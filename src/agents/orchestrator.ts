import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import EventEmitter from 'eventemitter3';
import type {
  AgentName,
  AgentArchitecture,
  AgentSpec,
  GateConfig,
  GatePendingInfo,
  PipelineSnapshot,
  PipelineStage,
  TaskDefinition,
  TimelineEvent,
} from '../shared/types.js';
import { PipelineFSM, type FSMEvent } from '../state/pipeline-state.js';
import { SessionManager } from '../state/session-manager.js';
import { TimelineLog } from '../state/timeline-log.js';
import { WorktreeManager } from '../git/worktree-manager.js';
import { ClaudeClient } from './claude-client.js';
import { ToolExecutor } from './tool-executor.js';
import { plannerTools, coderTools, testerTools, reviewerTools, type ToolDefinition } from './tools.js';
import { parseAgentsConfig } from '../config/agents-parser.js';
import { log } from '../util/logger.js';
import type { SessionConfig } from '../shared/types.js';

const TAG = 'QueenBee';

interface OrchestratorEvents {
  stateChange: (snapshot: PipelineSnapshot) => void;
  agentOutput: (data: { agent: AgentName; chunk: string; timestamp: number }) => void;
  gatePending: (info: GatePendingInfo) => void;
  gateResolved: (data: { stage: PipelineStage; resolution: 'approved' | 'rejected' }) => void;
  timelineEvent: (event: TimelineEvent) => void;
  error: (err: { message: string; recoverable: boolean }) => void;
}

interface PipelineStageInfo {
  workingStage: PipelineStage;
  agent: AgentName;
  completeEvent: FSMEvent;
  approvalStage: PipelineStage;
  gateKey: keyof GateConfig;
}

const PIPELINE_STAGES: PipelineStageInfo[] = [
  {
    workingStage: 'planning',
    agent: 'scout_bee',
    completeEvent: 'planComplete',
    approvalStage: 'plan_approval',
    gateKey: 'afterPlanning',
  },
  {
    workingStage: 'coding',
    agent: 'worker_bee',
    completeEvent: 'codeComplete',
    approvalStage: 'code_approval',
    gateKey: 'afterCoding',
  },
  {
    workingStage: 'testing',
    agent: 'tester_bee',
    completeEvent: 'testsComplete',
    approvalStage: 'test_approval',
    gateKey: 'afterTesting',
  },
  {
    workingStage: 'reviewing',
    agent: 'guard_bee',
    completeEvent: 'reviewComplete',
    approvalStage: 'review_approval',
    gateKey: 'afterReview',
  },
];

const AGENT_TO_NEXT: Record<string, AgentName> = {
  scout_bee: 'worker_bee',
  worker_bee: 'tester_bee',
  tester_bee: 'guard_bee',
  guard_bee: 'queen_bee',
};

export class QueenOrchestrator extends EventEmitter<OrchestratorEvents> {
  private fsm: PipelineFSM;
  private sessionManager: SessionManager;
  private worktreeManager: WorktreeManager | null = null;
  private claudeClient: ClaudeClient | null = null;
  private timelineLog: TimelineLog | null = null;

  private sessionConfig: SessionConfig | null = null;
  private agentOutputs: Map<AgentName, string> = new Map();
  private paused = false;
  private aborted = false;
  private rejectionFeedback = '';
  private gateResolve: ((approved: boolean) => void) | null = null;
  private pauseResolve: (() => void) | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {
    super();
    log.info(TAG, 'Queen Bee awakening... initializing the hive');

    const storagePath = context.globalStorageUri.fsPath;
    try {
      fs.mkdirSync(storagePath, { recursive: true });
      log.debug(TAG, `Hive storage: ${storagePath}`);
    } catch (err) {
      log.error(TAG, 'Failed to build hive storage', err);
      throw err;
    }

    const dbPath = path.join(storagePath, 'beebuilding.db');
    try {
      this.sessionManager = new SessionManager(dbPath);
      log.info(TAG, 'Colony memory initialized');
    } catch (err) {
      log.error(TAG, 'Failed to initialize colony memory', err);
      throw err;
    }

    this.fsm = new PipelineFSM();
    this.fsm.on('stateChange', (snapshot) => {
      log.debug(TAG, `Swarm state shift: ${snapshot.stage}`);
      this.emit('stateChange', snapshot);
      if (this.sessionConfig) {
        try {
          this.sessionManager.updatePipelineState(
            this.sessionConfig.id,
            snapshot.stage,
            JSON.stringify(snapshot),
          );
        } catch (err) {
          log.error(TAG, 'Failed to persist swarm state', err);
        }
      }
    });

    log.info(TAG, 'Queen Bee is ready. The hive awaits orders.');
  }

  createSession(): void {
    log.info(TAG, 'Establishing new colony session');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      log.warn(TAG, 'No workspace hive found');
      this.emit('error', { message: 'No workspace folder open', recoverable: true });
      return;
    }

    const projectPath = workspaceFolders[0].uri.fsPath;
    log.info(TAG, `Hive root: ${projectPath}`);

    let config: SessionConfig;
    try {
      config = parseAgentsConfig(projectPath);
      log.info(TAG, `Colony config parsed, session=${config.id}`, {
        bees: Object.keys(config.agents),
        gates: config.gates,
        gitMergeStrategy: config.gitMergeStrategy,
      });
    } catch (err) {
      log.error(TAG, 'Failed to parse AGENTS.md colony config', err);
      this.emit('error', {
        message: `Failed to parse config: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: true,
      });
      return;
    }

    this.sessionConfig = config;

    try {
      this.sessionManager.createSession(config);
    } catch (err) {
      log.error(TAG, 'Failed to persist colony session', err);
    }

    this.fsm.setSessionId(config.id);
    this.fsm.setGateConfig(config.gates);

    try {
      this.worktreeManager = new WorktreeManager(projectPath);
      log.info(TAG, 'Worktree chambers ready');
    } catch (err) {
      log.error(TAG, 'Failed to initialize worktree chambers', err);
      this.emit('error', {
        message: `Git worktree init failed: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: false,
      });
      return;
    }

    const logPath = path.join(
      this.context.globalStorageUri.fsPath,
      'timelines',
      `${config.id}.jsonl`,
    );
    try {
      this.timelineLog = new TimelineLog(logPath);
      log.debug(TAG, `Colony timeline: ${logPath}`);
    } catch (err) {
      log.error(TAG, 'Failed to create colony timeline', err);
    }

    this.agentOutputs.clear();
    this.paused = false;
    this.aborted = false;
    this.rejectionFeedback = '';

    this.emitTimelineEvent('pipeline_started', null, 'idle', 'Colony session established — bees standing by');
    log.info(TAG, `Colony session created: ${config.id}`);
  }

  async submitTask(task: TaskDefinition): Promise<void> {
    log.info(TAG, `Nectar run received: "${task.title}" (priority=${task.priority}, id=${task.id})`);

    if (!this.sessionConfig) {
      log.info(TAG, 'No colony session, creating one');
      this.createSession();
    }

    this.runPipeline(task).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error(TAG, `Swarm flow failed: ${message}`, err);
      this.fsm.setError(message);
      this.fsm.transition('error');
      this.emitTimelineEvent('pipeline_failed', null, this.fsm.getStage(), message);
      this.emit('error', { message, recoverable: false });
    });
  }

  async submitTaskWithArchitecture(task: TaskDefinition, architecture: AgentArchitecture): Promise<void> {
    log.info(TAG, `Dynamic nectar run: "${task.title}" with ${architecture.agents.length} bees`);

    if (!this.sessionConfig) {
      this.createSession();
    }

    this.fsm.setDynamicAgents(architecture.agents);

    this.runDynamicPipeline(task, architecture).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error(TAG, `Dynamic swarm flow failed: ${message}`, err);
      this.fsm.setError(message);
      this.fsm.transition('error');
      this.emitTimelineEvent('pipeline_failed', null, this.fsm.getStage(), message);
      this.emit('error', { message, recoverable: false });
    });
  }

  approveCurrentGate(): void {
    log.info(TAG, "Queen's Gate approved by beekeeper");
    if (this.gateResolve) {
      const resolve = this.gateResolve;
      this.gateResolve = null;
      resolve(true);
    } else {
      log.warn(TAG, "approveCurrentGate called but no Queen's Gate is pending");
    }
  }

  rejectCurrentGate(feedback: string): void {
    log.info(TAG, `Queen's Gate rejected by beekeeper: "${feedback}"`);
    this.rejectionFeedback = feedback;
    if (this.gateResolve) {
      const resolve = this.gateResolve;
      this.gateResolve = null;
      resolve(false);
    } else {
      log.warn(TAG, "rejectCurrentGate called but no Queen's Gate is pending");
    }
  }

  pause(): void {
    this.paused = !this.paused;
    log.info(TAG, `Swarm flow ${this.paused ? 'paused — bees on standby' : 'resumed — bees buzzing again'}`);
    if (!this.paused && this.pauseResolve) {
      const resolve = this.pauseResolve;
      this.pauseResolve = null;
      resolve();
    }
  }

  abort(): void {
    log.info(TAG, 'Swarm flow abort — all bees returning to hive');
    this.aborted = true;

    if (this.gateResolve) {
      const resolve = this.gateResolve;
      this.gateResolve = null;
      resolve(false);
    }

    if (this.pauseResolve) {
      const resolve = this.pauseResolve;
      this.pauseResolve = null;
      resolve();
    }
  }

  getDiffForAgent(agent: AgentName): void {
    if (!this.worktreeManager || !this.sessionConfig) {
      log.warn(TAG, `getDiffForAgent(${agent}) called but no worktree/session`);
      return;
    }

    log.debug(TAG, `Fetching nectar diff for ${agent}`);
    this.worktreeManager
      .getDiff(agent, this.sessionConfig.id)
      .then((diff) => {
        log.debug(TAG, `Nectar diff for ${agent}: ${diff.length} chars`);
        this.emit('agentOutput', {
          agent,
          chunk: diff,
          timestamp: Date.now(),
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error(TAG, `Failed to get nectar diff for ${agent}`, err);
        this.emit('error', {
          message: `Failed to get diff for ${agent}: ${message}`,
          recoverable: true,
        });
      });
  }

  getSnapshot(): PipelineSnapshot {
    return this.fsm.getSnapshot();
  }

  dispose(): void {
    log.info(TAG, 'Shutting down the hive');
    if (this.worktreeManager) {
      this.worktreeManager.cleanupAll().catch((err) => {
        log.error(TAG, 'Error cleaning up worktree chambers on dispose', err);
      });
    }
    try {
      this.sessionManager.close();
    } catch (err) {
      log.error(TAG, 'Error closing colony memory', err);
    }
    this.removeAllListeners();
  }

  // --- Private swarm flow logic ---

  private async runPipeline(task: TaskDefinition): Promise<void> {
    log.info(TAG, `Initiating swarm flow for nectar run: "${task.title}"`);
    await this.ensureClaudeClient();

    this.fsm.setTask(task);
    this.fsm.transition('taskSubmitted');
    this.emitTimelineEvent('pipeline_started', null, 'planning', `Nectar Run: ${task.title}`);

    let currentStageIndex = 0;

    while (currentStageIndex < PIPELINE_STAGES.length) {
      if (this.aborted) {
        throw new Error('Swarm flow aborted by beekeeper');
      }

      if (this.paused) {
        log.info(TAG, 'Swarm flow paused — bees waiting for signal');
        await this.waitForResume();
        if (this.aborted) {
          throw new Error('Swarm flow aborted by beekeeper');
        }
      }

      const stageInfo = PIPELINE_STAGES[currentStageIndex];
      log.info(TAG, `=== Swarm stage ${currentStageIndex + 1}/${PIPELINE_STAGES.length}: ${stageInfo.workingStage} (bee=${stageInfo.agent}) ===`);

      this.fsm.updateAgentState(stageInfo.agent, {
        status: 'working',
        currentTask: task.title,
        progress: 0,
      });

      const beeVerb = this.getBeeVerb(stageInfo.agent);
      this.emitTimelineEvent(
        'agent_started',
        stageInfo.agent,
        stageInfo.workingStage,
        beeVerb,
      );

      try {
        const startTime = Date.now();
        await this.runAgentStage(stageInfo, task);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        log.info(TAG, `${stageInfo.agent} returned to hive in ${elapsed}s`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(TAG, `${stageInfo.agent} encountered a problem`, err);
        this.fsm.updateAgentState(stageInfo.agent, { status: 'error' });
        this.emitTimelineEvent(
          'agent_error',
          stageInfo.agent,
          stageInfo.workingStage,
          message,
        );
        throw err;
      }

      this.fsm.updateAgentState(stageInfo.agent, {
        status: 'done',
        progress: 100,
      });
      this.emitTimelineEvent(
        'agent_completed',
        stageInfo.agent,
        stageInfo.workingStage,
        `${stageInfo.agent} finished pollinating`,
      );

      this.fsm.transition(stageInfo.completeEvent);

      const currentFSMStage = this.fsm.getStage();
      if (currentFSMStage !== stageInfo.approvalStage) {
        log.debug(TAG, `Queen's Gate auto-skipped for ${stageInfo.approvalStage}`);
        this.emitTimelineEvent(
          'gate_approved',
          stageInfo.agent,
          stageInfo.approvalStage,
          `Queen's Gate auto-cleared for ${stageInfo.approvalStage}`,
        );

        const nextAgent = AGENT_TO_NEXT[stageInfo.agent] ?? 'queen_bee';
        this.emitTimelineEvent(
          'handoff',
          stageInfo.agent,
          currentFSMStage,
          `Pheromone handoff: ${stageInfo.agent} → ${nextAgent}`,
        );

        currentStageIndex++;
        continue;
      }

      const gateConfig = this.sessionConfig!.gates[stageInfo.gateKey];

      if (gateConfig === 'optional') {
        log.debug(TAG, `Optional Queen's Gate auto-approved for ${stageInfo.approvalStage}`);
        this.emitTimelineEvent(
          'gate_approved',
          stageInfo.agent,
          stageInfo.approvalStage,
          `Optional Queen's Gate auto-cleared for ${stageInfo.approvalStage}`,
        );
        this.fsm.transition('approved');
        currentStageIndex++;
        continue;
      }

      log.info(TAG, `Awaiting beekeeper approval at Queen's Gate: ${stageInfo.approvalStage}`);
      const diffStats = await this.computeDiffStats(stageInfo.agent);
      const gatePending: GatePendingInfo = {
        stage: stageInfo.approvalStage,
        fromAgent: stageInfo.agent,
        toAgent: AGENT_TO_NEXT[stageInfo.agent] ?? 'queen_bee',
        filesChanged: diffStats.filesChanged,
        linesAdded: diffStats.linesAdded,
        linesRemoved: diffStats.linesRemoved,
        timestamp: Date.now(),
      };

      this.fsm.setGatePending(gatePending);
      this.emit('gatePending', gatePending);
      this.emitTimelineEvent(
        'gate_pending',
        stageInfo.agent,
        stageInfo.approvalStage,
        `Queen's Gate: awaiting beekeeper approval at ${stageInfo.approvalStage}`,
      );

      const approved = await this.waitForGateApproval();
      log.info(TAG, `Queen's Gate ${stageInfo.approvalStage} ${approved ? 'approved — bees proceed' : 'rejected — returning to cell'}`);

      if (approved) {
        this.fsm.transition('approved');
        this.emit('gateResolved', {
          stage: stageInfo.approvalStage,
          resolution: 'approved',
        });
        this.emitTimelineEvent(
          'gate_approved',
          stageInfo.agent,
          stageInfo.approvalStage,
          `Queen's Gate cleared for ${stageInfo.approvalStage}`,
        );

        const nextAgent = AGENT_TO_NEXT[stageInfo.agent] ?? 'queen_bee';
        this.emitTimelineEvent(
          'handoff',
          stageInfo.agent,
          this.fsm.getStage(),
          `Pheromone handoff: ${stageInfo.agent} → ${nextAgent}`,
        );

        currentStageIndex++;
      } else {
        if (this.aborted) {
          throw new Error('Swarm flow aborted by beekeeper');
        }

        this.emitTimelineEvent(
          'gate_rejected',
          stageInfo.agent,
          stageInfo.approvalStage,
          `Queen's Gate rejected: ${this.rejectionFeedback || 'No feedback provided'}`,
        );

        this.fsm.transition('rejected');
        this.emit('gateResolved', {
          stage: stageInfo.approvalStage,
          resolution: 'rejected',
        });

        const rejectedToStage = this.fsm.getStage();
        log.info(TAG, `Rejected — bee returning to stage: ${rejectedToStage}`);
        const backIndex = PIPELINE_STAGES.findIndex(
          (s) => s.workingStage === rejectedToStage,
        );
        currentStageIndex = backIndex >= 0 ? backIndex : currentStageIndex;
      }
    }

    log.info(TAG, 'All bees have reported — Queen Bee begins the merge dance');
    this.emitTimelineEvent('merge_started', 'queen_bee', 'merging', 'Queen Bee is sealing the honeycomb...');

    await this.performMerge();
    this.fsm.transition('merged');

    this.emitTimelineEvent('merge_completed', 'queen_bee', 'done', 'Honeycomb sealed — merge complete');
    this.emitTimelineEvent('pipeline_completed', null, 'done', 'Swarm flow completed — nectar run successful!');
    log.info(TAG, 'Swarm flow completed successfully');
  }

  private async runAgentStage(
    stageInfo: PipelineStageInfo,
    task: TaskDefinition,
  ): Promise<void> {
    if (!this.claudeClient || !this.worktreeManager || !this.sessionConfig) {
      throw new Error('Queen Bee not fully initialized');
    }

    log.debug(TAG, `Preparing worktree chamber for ${stageInfo.agent}`);
    let worktreePath: string;
    try {
      worktreePath = await this.worktreeManager.createWorktree(
        stageInfo.agent,
        this.sessionConfig.id,
      );
      log.debug(TAG, `Worktree chamber built at: ${worktreePath}`);
    } catch (err) {
      log.error(TAG, `Failed to build worktree chamber for ${stageInfo.agent}`, err);
      throw new Error(`Worktree creation failed for ${stageInfo.agent}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const systemPrompt = this.loadSystemPrompt(stageInfo.agent);
    log.debug(TAG, `Flight plan loaded for ${stageInfo.agent} (${systemPrompt.length} chars)`);

    const toolExecutor = new ToolExecutor(worktreePath);
    const tools = this.getToolsForAgent(stageInfo.agent);
    const userMessage = this.buildAgentContext(stageInfo.agent, task);

    log.debug(TAG, `Dispatching ${stageInfo.agent} to Claude API (model=${this.sessionConfig.agents[stageInfo.agent].model})`);
    const outputChunks: string[] = [];

    const output = await this.claudeClient.createAgentMessage({
      model: this.sessionConfig.agents[stageInfo.agent].model,
      systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      tools,
      onChunk: (chunk) => {
        outputChunks.push(chunk);
        this.fsm.updateAgentState(stageInfo.agent, { outputChunks: [...outputChunks] });
        this.emit('agentOutput', {
          agent: stageInfo.agent,
          chunk,
          timestamp: Date.now(),
        });
      },
      onToolUse: async (toolName, input) => {
        log.debug(TAG, `${stageInfo.agent} using tool: ${toolName}`, input);
        this.emitTimelineEvent(
          'tool_call',
          stageInfo.agent,
          stageInfo.workingStage,
          `Tool: ${toolName}`,
        );
        try {
          const result = await toolExecutor.execute(toolName, input);
          log.debug(TAG, `${stageInfo.agent} tool ${toolName} returned (${result.length} chars)`);
          return result;
        } catch (err) {
          log.error(TAG, `${stageInfo.agent} tool ${toolName} failed`, err);
          throw err;
        }
      },
    });

    log.info(TAG, `${stageInfo.agent} produced ${output.length} chars of nectar`);
    this.agentOutputs.set(stageInfo.agent, output);

    try {
      this.sessionManager.storeAgentOutput(
        this.sessionConfig.id,
        stageInfo.agent,
        output,
      );
    } catch (err) {
      log.error(TAG, `Failed to store nectar output for ${stageInfo.agent}`, err);
    }
  }

  private buildAgentContext(agent: AgentName, task: TaskDefinition): string {
    const parts: string[] = [];

    parts.push(`## Nectar Run\n**${task.title}**\n\n${task.description}`);

    if (task.priority) {
      parts.push(`\n**Priority**: ${task.priority}`);
    }
    if (task.estimatedComplexity) {
      parts.push(`**Estimated Complexity**: ${task.estimatedComplexity}`);
    }

    switch (agent) {
      case 'worker_bee': {
        const scoutOutput = this.agentOutputs.get('scout_bee');
        if (scoutOutput) {
          parts.push(`\n## Scout Bee Specification\n${scoutOutput}`);
        }
        break;
      }
      case 'tester_bee': {
        const workerOutput = this.agentOutputs.get('worker_bee');
        if (workerOutput) {
          parts.push(`\n## Worker Bee Implementation Summary\n${workerOutput}`);
        }
        break;
      }
      case 'guard_bee': {
        const workerOutput = this.agentOutputs.get('worker_bee');
        const testerOutput = this.agentOutputs.get('tester_bee');
        if (workerOutput) {
          parts.push(`\n## Implementation Summary\n${workerOutput}`);
        }
        if (testerOutput) {
          parts.push(`\n## Test Results\n${testerOutput}`);
        }
        break;
      }
    }

    if (this.rejectionFeedback) {
      parts.push(
        `\n## Rejection Feedback\nYour previous output was rejected. Address this feedback:\n${this.rejectionFeedback}`,
      );
      this.rejectionFeedback = '';
    }

    return parts.join('\n');
  }

  private getToolsForAgent(agent: AgentName): ToolDefinition[] {
    switch (agent) {
      case 'scout_bee':
        return plannerTools;
      case 'worker_bee':
        return coderTools;
      case 'tester_bee':
        return testerTools;
      case 'guard_bee':
        return reviewerTools;
      default:
        return [];
    }
  }

  private loadSystemPrompt(agent: AgentName): string {
    if (agent === 'queen_bee') {
      return 'You are the Queen Bee orchestrator agent for the BeeBuilding hive.';
    }

    const extensionPath = this.context.extensionPath;
    const candidates = [
      path.join(extensionPath, 'src', 'agents', 'prompts', `${agent}.system.md`),
      path.join(extensionPath, 'dist', 'agents', 'prompts', `${agent}.system.md`),
      path.join(__dirname, 'prompts', `${agent}.system.md`),
    ];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          log.debug(TAG, `Flight plan found: ${candidate}`);
          return fs.readFileSync(candidate, 'utf-8');
        }
      } catch (err) {
        log.warn(TAG, `Failed to read flight plan: ${candidate}`, err);
      }
    }

    log.warn(TAG, `No flight plan found for ${agent}, using fallback`);
    return this.getFallbackPrompt(agent);
  }

  private getFallbackPrompt(agent: AgentName): string {
    switch (agent) {
      case 'scout_bee':
        return 'You are the Scout Bee. Analyze the task, inspect the codebase using available tools, and produce a detailed JSON implementation specification with subtasks, files to modify, success criteria, and risks.';
      case 'worker_bee':
        return 'You are the Worker Bee. Follow the Scout Bee specification exactly. Write production-quality code using the project\'s existing style. Use the available tools to read, write, and test files.';
      case 'tester_bee':
        return 'You are the Tester Bee. Write comprehensive tests for the implementation, run the test suite, and produce a structured test report with pass/fail counts and coverage information.';
      case 'guard_bee':
        return 'You are the Guard Bee. Review the implementation for correctness, security, performance, and maintainability. Use create_review_comment for specific feedback. Produce a structured verdict with blocking issues and suggestions.';
      default:
        return `You are the ${agent} in the BeeBuilding hive.`;
    }
  }

  private getBeeVerb(agent: AgentName): string {
    switch (agent) {
      case 'scout_bee':
        return 'Scout Bee is mapping the workspace flora...';
      case 'worker_bee':
        return 'Worker Bee is constructing honeycomb cells...';
      case 'tester_bee':
        return 'Tester Bee is inspecting the honeycomb quality...';
      case 'guard_bee':
        return 'Guard Bee is patrolling the perimeter...';
      default:
        return `${agent} is buzzing into action...`;
    }
  }

  private async ensureClaudeClient(): Promise<void> {
    if (this.claudeClient) return;

    log.info(TAG, 'Connecting to the hivemind API');
    let apiKey: string | undefined;

    try {
      apiKey = await this.context.secrets.get('beebuilder.anthropicApiKey');
      if (apiKey) log.debug(TAG, 'API key loaded from SecretStorage');
    } catch (err) {
      log.warn(TAG, 'SecretStorage not available', err);
    }

    if (!apiKey) {
      try {
        apiKey = await this.context.secrets.get('beebuilder.claudeApiKey');
        if (apiKey) log.debug(TAG, 'API key loaded from SecretStorage (legacy key)');
      } catch {
        // ignore
      }
    }

    if (!apiKey) {
      apiKey = vscode.workspace
        .getConfiguration('beebuilder')
        .get<string>('claudeApiKey');
      if (apiKey) log.debug(TAG, 'API key loaded from settings');
    }

    if (!apiKey) {
      const msg = 'Claude API key not configured. Save your Anthropic API key in Settings.';
      log.error(TAG, msg);
      throw new Error(msg);
    }

    this.claudeClient = new ClaudeClient(apiKey);
    log.info(TAG, 'Hivemind API connected');
  }

  private async waitForGateApproval(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.gateResolve = resolve;
    });
  }

  private async waitForResume(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.pauseResolve = resolve;
    });
  }

  private async computeDiffStats(
    agent: AgentName,
  ): Promise<{ filesChanged: number; linesAdded: number; linesRemoved: number }> {
    if (!this.worktreeManager || !this.sessionConfig) {
      return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
    }

    try {
      const diff = await this.worktreeManager.getDiff(agent, this.sessionConfig.id);
      const lines = diff.split('\n');
      let added = 0;
      let removed = 0;
      const files = new Set<string>();

      for (const line of lines) {
        if (line.startsWith('+++ ') || line.startsWith('--- ')) {
          const filePath = line.substring(4).trim();
          if (filePath !== '/dev/null' && !filePath.startsWith('/dev/null')) {
            files.add(filePath.replace(/^[ab]\//, ''));
          }
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          added++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          removed++;
        }
      }

      const stats = { filesChanged: files.size, linesAdded: added, linesRemoved: removed };
      log.debug(TAG, `Diff stats for ${agent}:`, stats);
      return stats;
    } catch (err) {
      log.error(TAG, `Failed to compute diff stats for ${agent}`, err);
      return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
    }
  }

  private async performMerge(): Promise<void> {
    if (!this.worktreeManager || !this.sessionConfig) {
      log.warn(TAG, 'performMerge called but no worktree/session');
      return;
    }

    const strategy = this.sessionConfig.gitMergeStrategy;
    log.info(TAG, `Sealing honeycomb with merge strategy: ${strategy}`);

    try {
      await this.worktreeManager.mergeWorktree(
        'worker_bee',
        this.sessionConfig.id,
        strategy,
      );
      log.info(TAG, 'Honeycomb sealed successfully');
    } catch (err) {
      log.error(TAG, 'Merge failed — honeycomb damaged', err);
      throw new Error(`Merge failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    for (const agent of ['scout_bee', 'worker_bee', 'tester_bee', 'guard_bee'] as AgentName[]) {
      try {
        await this.worktreeManager.removeWorktree(agent);
        log.debug(TAG, `Worktree chamber cleaned for ${agent}`);
      } catch (err) {
        log.warn(TAG, `Failed to clean worktree chamber for ${agent}`, err);
      }
    }
  }

  private async runDynamicPipeline(task: TaskDefinition, architecture: AgentArchitecture): Promise<void> {
    log.info(TAG, `Dynamic swarm flow for: "${task.title}" with ${architecture.agents.length} bees`);
    await this.ensureClaudeClient();

    this.fsm.setTask(task);
    this.fsm.setStage('planning');
    this.emitTimelineEvent('pipeline_started', null, 'planning', `Dynamic swarm flow: ${task.title}`);

    const agentMap = new Map(architecture.agents.map((a) => [a.id, a]));

    for (let groupIdx = 0; groupIdx < architecture.executionOrder.length; groupIdx++) {
      if (this.aborted) throw new Error('Swarm flow aborted by beekeeper');

      if (this.paused) {
        await this.waitForResume();
        if (this.aborted) throw new Error('Swarm flow aborted by beekeeper');
      }

      const group = architecture.executionOrder[groupIdx];
      const isParallel = group.length > 1;
      log.info(TAG, `Swarm group ${groupIdx + 1}/${architecture.executionOrder.length}: [${group.join(', ')}] ${isParallel ? '(parallel flight)' : ''}`);

      const agentPromises = group.map(async (agentId) => {
        const spec = agentMap.get(agentId);
        if (!spec) {
          log.warn(TAG, `Unknown bee id: ${agentId}`);
          return;
        }

        this.fsm.updateAgentState(agentId, { status: 'working', currentTask: task.title, progress: 0 });
        this.emitTimelineEvent('agent_started', agentId, 'coding', `${spec.name} is buzzing into action...`);

        try {
          await this.runDynamicAgent(spec, task);
          this.fsm.updateAgentState(agentId, { status: 'done', progress: 100 });
          this.emitTimelineEvent('agent_completed', agentId, 'coding', `${spec.name} returned with nectar`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.fsm.updateAgentState(agentId, { status: 'error' });
          this.emitTimelineEvent('agent_error', agentId, 'coding', msg);
          throw err;
        }
      });

      await Promise.all(agentPromises);
    }

    log.info(TAG, 'Dynamic swarm complete — sealing the honeycomb');
    this.fsm.setStage('merging');
    this.emitTimelineEvent('merge_started', 'queen_bee', 'merging', 'Queen Bee is sealing the honeycomb...');

    await this.performMerge();
    this.fsm.transition('merged');
    this.emitTimelineEvent('pipeline_completed', null, 'done', 'Dynamic swarm flow complete — the hive prospers!');
  }

  private async runDynamicAgent(spec: AgentSpec, task: TaskDefinition): Promise<void> {
    if (!this.claudeClient || !this.worktreeManager || !this.sessionConfig) {
      throw new Error('Queen Bee not fully initialized');
    }

    let worktreePath: string;
    try {
      worktreePath = await this.worktreeManager.createWorktree(spec.id, this.sessionConfig.id);
    } catch (err) {
      throw new Error(`Worktree creation failed for ${spec.id}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const toolExecutor = new ToolExecutor(worktreePath);
    const tools = this.resolveToolsForSpec(spec);
    const userMessage = `## Nectar Run\n**${task.title}**\n\n${task.description}`;
    const outputChunks: string[] = [];

    const output = await this.claudeClient.createAgentMessage({
      model: spec.model,
      systemPrompt: spec.systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      tools,
      onChunk: (chunk) => {
        outputChunks.push(chunk);
        this.fsm.updateAgentState(spec.id, { outputChunks: [...outputChunks] });
        this.emit('agentOutput', { agent: spec.id, chunk, timestamp: Date.now() });
      },
      onToolUse: async (toolName, input) => {
        this.emitTimelineEvent('tool_call', spec.id, 'coding', `Tool: ${toolName}`);
        return toolExecutor.execute(toolName, input);
      },
    });

    this.agentOutputs.set(spec.id, output);
    try {
      this.sessionManager.storeAgentOutput(this.sessionConfig.id, spec.id, output);
    } catch (err) {
      log.error(TAG, `Failed to persist nectar output for ${spec.id}`, err);
    }
  }

  private resolveToolsForSpec(spec: AgentSpec): ToolDefinition[] {
    const allTools: Record<string, ToolDefinition[]> = {
      scout_bee: plannerTools,
      worker_bee: coderTools,
      tester_bee: testerTools,
      guard_bee: reviewerTools,
    };

    if (allTools[spec.id]) return allTools[spec.id];

    const toolMap = new Map<string, ToolDefinition>();
    for (const list of [plannerTools, coderTools, testerTools, reviewerTools]) {
      for (const tool of list) {
        toolMap.set(tool.name, tool);
      }
    }

    return spec.tools
      .map((name) => toolMap.get(name))
      .filter((t): t is ToolDefinition => t !== undefined);
  }

  private emitTimelineEvent(
    type: TimelineEvent['type'],
    agentName: AgentName | null,
    stage: PipelineStage,
    message: string,
  ): void {
    const event: TimelineEvent = {
      id: randomUUID(),
      sessionId: this.sessionConfig?.id ?? '',
      timestamp: Date.now(),
      type,
      agentName,
      stage,
      payload: {},
      message,
    };

    try {
      this.timelineLog?.append(event);
    } catch (err) {
      log.error(TAG, 'Failed to append colony timeline event', err);
    }
    this.emit('timelineEvent', event);
  }
}
