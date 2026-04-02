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
  GateLevel,
  GatePendingInfo,
  PipelineSnapshot,
  PipelineStage,
  PlanDocument,
  TaskDefinition,
  TimelineEvent,
  SessionConfig,
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

const TAG = 'Orchestrator';

const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000;

const CANONICAL_TOOL_MAP: Map<string, ToolDefinition> = (() => {
  const map = new Map<string, ToolDefinition>();
  for (const list of [plannerTools, coderTools, testerTools, reviewerTools]) {
    for (const tool of list) {
      map.set(tool.name, tool);
    }
  }
  return map;
})();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${(ms / 60000).toFixed(0)}m`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

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
    agent: 'planner',
    completeEvent: 'planComplete',
    approvalStage: 'plan_approval',
    gateKey: 'afterPlanning',
  },
  {
    workingStage: 'coding',
    agent: 'coder',
    completeEvent: 'codeComplete',
    approvalStage: 'code_approval',
    gateKey: 'afterCoding',
  },
  {
    workingStage: 'testing',
    agent: 'tester',
    completeEvent: 'testsComplete',
    approvalStage: 'test_approval',
    gateKey: 'afterTesting',
  },
  {
    workingStage: 'reviewing',
    agent: 'reviewer',
    completeEvent: 'reviewComplete',
    approvalStage: 'review_approval',
    gateKey: 'afterReview',
  },
];

const AGENT_TO_NEXT: Record<string, AgentName> = {
  planner: 'coder',
  coder: 'tester',
  tester: 'reviewer',
  reviewer: 'orchestrator',
};

export class AgentOrchestrator extends EventEmitter<OrchestratorEvents> {
  private fsm: PipelineFSM;
  private sessionManager: SessionManager;
  private worktreeManager: WorktreeManager | null = null;
  private claudeClient: ClaudeClient | null = null;
  private timelineLog: TimelineLog | null = null;

  private sessionConfig: SessionConfig | null = null;
  private currentPlan: PlanDocument | null = null;
  private agentOutputs: Map<AgentName, string> = new Map();
  private paused = false;
  private aborted = false;
  private rejectionFeedback = '';
  private gateResolve: ((approved: boolean) => void) | null = null;
  private pauseResolve: (() => void) | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {
    super();
    log.info(TAG, 'Initializing orchestrator');

    const storagePath = context.globalStorageUri.fsPath;
    try {
      fs.mkdirSync(storagePath, { recursive: true });
      log.debug(TAG, `Storage path: ${storagePath}`);
    } catch (err) {
      log.error(TAG, 'Failed to create storage directory', err);
      throw err;
    }

    const dbPath = path.join(storagePath, 'agentflow.db');
    try {
      this.sessionManager = new SessionManager(dbPath);
      log.info(TAG, 'Session manager initialized');
    } catch (err) {
      log.error(TAG, 'Failed to initialize session manager', err);
      throw err;
    }

    this.fsm = new PipelineFSM();
    this.fsm.on('stateChange', (snapshot) => {
      log.debug(TAG, `FSM state change: ${snapshot.stage}`);
      this.emit('stateChange', snapshot);
      if (this.sessionConfig) {
        try {
          this.sessionManager.updatePipelineState(
            this.sessionConfig.id,
            snapshot.stage,
            JSON.stringify(snapshot),
          );
        } catch (err) {
          log.error(TAG, 'Failed to persist pipeline state', err);
        }
      }
    });

    log.info(TAG, 'Orchestrator initialized');
  }

  createSession(): void {
    log.info(TAG, 'Creating new session');
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      log.warn(TAG, 'No workspace folder open');
      this.emit('error', { message: 'No workspace folder open', recoverable: true });
      return;
    }

    const projectPath = workspaceFolders[0].uri.fsPath;
    log.info(TAG, `Project path: ${projectPath}`);

    let config: SessionConfig;
    try {
      config = parseAgentsConfig(projectPath);
      log.info(TAG, `Session config parsed, id=${config.id}`, {
        agents: Object.keys(config.agents),
        gates: config.gates,
        gitMergeStrategy: config.gitMergeStrategy,
      });
    } catch (err) {
      log.error(TAG, 'Failed to parse AGENTS.md config', err);
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
      log.error(TAG, 'Failed to persist session', err);
    }

    this.fsm.setSessionId(config.id);
    this.fsm.setGateConfig(config.gates);

    try {
      this.worktreeManager = new WorktreeManager(projectPath);
      log.info(TAG, 'Worktree manager initialized');
    } catch (err) {
      log.error(TAG, 'Failed to initialize worktree manager', err);
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
      log.debug(TAG, `Timeline log: ${logPath}`);
    } catch (err) {
      log.error(TAG, 'Failed to create timeline log', err);
    }

    this.agentOutputs.clear();
    this.paused = false;
    this.aborted = false;
    this.rejectionFeedback = '';

    this.emitTimelineEvent('pipeline_started', null, 'idle', 'Session created');
    log.info(TAG, `Session created: ${config.id}`);
  }

  async submitTask(task: TaskDefinition): Promise<void> {
    log.info(TAG, `Task submitted: "${task.title}" (priority=${task.priority}, id=${task.id})`);

    if (!this.sessionConfig) {
      log.info(TAG, 'No session exists, creating one');
      this.createSession();
    }

    this.runPipeline(task).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error(TAG, `Pipeline failed: ${message}`, err);
      this.fsm.setError(message);
      this.fsm.transition('error');
      this.emitTimelineEvent('pipeline_failed', null, this.fsm.getStage(), message);
      this.emit('error', { message, recoverable: false });
    });
  }

  async submitTaskWithArchitecture(task: TaskDefinition, architecture: AgentArchitecture, plan?: PlanDocument): Promise<void> {
    log.info(TAG, `Dynamic task submitted: "${task.title}" with ${architecture.agents.length} agents`);

    if (!this.sessionConfig) {
      this.createSession();
    }

    this.currentPlan = plan ?? null;
    this.fsm.setDynamicAgents(architecture.agents, architecture.executionOrder.length);

    this.runDynamicPipeline(task, architecture).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      log.error(TAG, `Dynamic pipeline failed: ${message}`, err);
      this.fsm.setError(message);
      this.fsm.transition('error');
      this.emitTimelineEvent('pipeline_failed', null, this.fsm.getStage(), message);
      this.emit('error', { message, recoverable: false });
    });
  }

  approveCurrentGate(): void {
    log.info(TAG, 'Gate approved by user');
    if (this.gateResolve) {
      const resolve = this.gateResolve;
      this.gateResolve = null;
      resolve(true);
    } else {
      log.warn(TAG, 'approveCurrentGate called but no gate is pending');
    }
  }

  rejectCurrentGate(feedback: string): void {
    log.info(TAG, `Gate rejected by user: "${feedback}"`);
    this.rejectionFeedback = feedback;
    if (this.gateResolve) {
      const resolve = this.gateResolve;
      this.gateResolve = null;
      resolve(false);
    } else {
      log.warn(TAG, 'rejectCurrentGate called but no gate is pending');
    }
  }

  pause(): void {
    this.paused = !this.paused;
    log.info(TAG, `Pipeline ${this.paused ? 'paused' : 'resumed'}`);
    if (!this.paused && this.pauseResolve) {
      const resolve = this.pauseResolve;
      this.pauseResolve = null;
      resolve();
    }
  }

  abort(): void {
    log.info(TAG, 'Pipeline abort requested');
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

    log.debug(TAG, `Fetching diff for agent: ${agent}`);
    this.worktreeManager
      .getDiff(agent, this.sessionConfig.id)
      .then((diff) => {
        log.debug(TAG, `Diff for ${agent}: ${diff.length} chars`);
        this.emit('agentOutput', {
          agent,
          chunk: diff,
          timestamp: Date.now(),
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log.error(TAG, `Failed to get diff for ${agent}`, err);
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
    log.info(TAG, 'Disposing orchestrator');
    if (this.worktreeManager) {
      this.worktreeManager.cleanupAll().catch((err) => {
        log.error(TAG, 'Error cleaning up worktrees on dispose', err);
      });
    }
    try {
      this.sessionManager.close();
    } catch (err) {
      log.error(TAG, 'Error closing session manager', err);
    }
    this.removeAllListeners();
  }

  // --- Private pipeline logic ---

  private async runPipeline(task: TaskDefinition): Promise<void> {
    log.info(TAG, `Starting pipeline for task: "${task.title}"`);
    await this.ensureClaudeClient();

    this.fsm.setTask(task);
    this.fsm.transition('taskSubmitted');
    this.emitTimelineEvent('pipeline_started', null, 'planning', `Task: ${task.title}`);

    let currentStageIndex = 0;

    while (currentStageIndex < PIPELINE_STAGES.length) {
      if (this.aborted) {
        throw new Error('Pipeline aborted by user');
      }

      if (this.paused) {
        log.info(TAG, 'Pipeline paused, waiting for resume');
        await this.waitForResume();
        if (this.aborted) {
          throw new Error('Pipeline aborted by user');
        }
      }

      const stageInfo = PIPELINE_STAGES[currentStageIndex];
      log.info(TAG, `=== Stage ${currentStageIndex + 1}/${PIPELINE_STAGES.length}: ${stageInfo.workingStage} (agent=${stageInfo.agent}) ===`);

      this.fsm.updateAgentState(stageInfo.agent, {
        status: 'working',
        currentTask: task.title,
        progress: 0,
      });

      this.emitTimelineEvent(
        'agent_started',
        stageInfo.agent,
        stageInfo.workingStage,
        `${stageInfo.agent} started`,
      );

      try {
        const startTime = Date.now();
        await this.runAgentStage(stageInfo, task);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        log.info(TAG, `Agent ${stageInfo.agent} completed in ${elapsed}s`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error(TAG, `Agent ${stageInfo.agent} failed`, err);
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
        `${stageInfo.agent} completed`,
      );

      this.fsm.transition(stageInfo.completeEvent);

      const currentFSMStage = this.fsm.getStage();
      if (currentFSMStage !== stageInfo.approvalStage) {
        log.debug(TAG, `Gate auto-skipped for ${stageInfo.approvalStage}`);
        this.emitTimelineEvent(
          'gate_approved',
          stageInfo.agent,
          stageInfo.approvalStage,
          `Gate auto-skipped for ${stageInfo.approvalStage}`,
        );

        const nextAgent = AGENT_TO_NEXT[stageInfo.agent] ?? 'orchestrator';
        this.emitTimelineEvent(
          'handoff',
          stageInfo.agent,
          currentFSMStage,
          `Handoff from ${stageInfo.agent} to ${nextAgent}`,
        );

        currentStageIndex++;
        continue;
      }

      const gateConfig = this.sessionConfig!.gates[stageInfo.gateKey];

      if (gateConfig === 'optional') {
        log.debug(TAG, `Optional gate auto-approved for ${stageInfo.approvalStage}`);
        this.emitTimelineEvent(
          'gate_approved',
          stageInfo.agent,
          stageInfo.approvalStage,
          `Optional gate auto-approved for ${stageInfo.approvalStage}`,
        );
        this.fsm.transition('approved');
        currentStageIndex++;
        continue;
      }

      log.info(TAG, `Waiting for user approval at ${stageInfo.approvalStage}`);
      const diffStats = await this.computeDiffStats(stageInfo.agent);
      const gatePending: GatePendingInfo = {
        stage: stageInfo.approvalStage,
        fromAgent: stageInfo.agent,
        toAgent: AGENT_TO_NEXT[stageInfo.agent] ?? 'orchestrator',
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
        `Awaiting approval at ${stageInfo.approvalStage}`,
      );

      const approved = await this.waitForGateApproval();
      log.info(TAG, `Gate ${stageInfo.approvalStage} ${approved ? 'approved' : 'rejected'}`);

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
          `Gate approved for ${stageInfo.approvalStage}`,
        );

        const nextAgent = AGENT_TO_NEXT[stageInfo.agent] ?? 'orchestrator';
        this.emitTimelineEvent(
          'handoff',
          stageInfo.agent,
          this.fsm.getStage(),
          `Handoff from ${stageInfo.agent} to ${nextAgent}`,
        );

        currentStageIndex++;
      } else {
        if (this.aborted) {
          throw new Error('Pipeline aborted by user');
        }

        this.emitTimelineEvent(
          'gate_rejected',
          stageInfo.agent,
          stageInfo.approvalStage,
          `Gate rejected: ${this.rejectionFeedback || 'No feedback provided'}`,
        );

        this.fsm.transition('rejected');
        this.emit('gateResolved', {
          stage: stageInfo.approvalStage,
          resolution: 'rejected',
        });

        const rejectedToStage = this.fsm.getStage();
        log.info(TAG, `Rejected, returning to stage: ${rejectedToStage}`);
        const backIndex = PIPELINE_STAGES.findIndex(
          (s) => s.workingStage === rejectedToStage,
        );
        currentStageIndex = backIndex >= 0 ? backIndex : currentStageIndex;
      }
    }

    log.info(TAG, 'All agent stages complete, beginning merge');
    this.emitTimelineEvent('merge_started', 'orchestrator', 'merging', 'Merging changes');

    await this.performMerge();
    this.fsm.transition('merged');

    this.emitTimelineEvent('merge_completed', 'orchestrator', 'done', 'Merge complete');
    this.emitTimelineEvent('pipeline_completed', null, 'done', 'Pipeline completed successfully');
    log.info(TAG, 'Pipeline completed successfully');
  }

  private async runAgentStage(
    stageInfo: PipelineStageInfo,
    task: TaskDefinition,
  ): Promise<void> {
    if (!this.claudeClient || !this.worktreeManager || !this.sessionConfig) {
      throw new Error('Orchestrator not fully initialized');
    }

    log.debug(TAG, `Creating worktree for ${stageInfo.agent}`);
    let worktreePath: string;
    try {
      worktreePath = await this.worktreeManager.createWorktree(
        stageInfo.agent,
        this.sessionConfig.id,
      );
      log.debug(TAG, `Worktree created at: ${worktreePath}`);
    } catch (err) {
      log.error(TAG, `Failed to create worktree for ${stageInfo.agent}`, err);
      throw new Error(`Worktree creation failed for ${stageInfo.agent}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const systemPrompt = this.loadSystemPrompt(stageInfo.agent);
    log.debug(TAG, `System prompt loaded for ${stageInfo.agent} (${systemPrompt.length} chars)`);

    const toolExecutor = new ToolExecutor(worktreePath);
    const tools = this.getToolsForAgent(stageInfo.agent);
    const userMessage = this.buildAgentContext(stageInfo.agent, task);

    log.debug(TAG, `Calling Claude API for ${stageInfo.agent} (model=${this.sessionConfig.agents[stageInfo.agent].model})`);
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
        log.debug(TAG, `${stageInfo.agent} tool call: ${toolName}`, input);
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

    log.info(TAG, `${stageInfo.agent} produced ${output.length} chars of output`);
    this.agentOutputs.set(stageInfo.agent, output);

    try {
      this.sessionManager.storeAgentOutput(
        this.sessionConfig.id,
        stageInfo.agent,
        output,
      );
    } catch (err) {
      log.error(TAG, `Failed to persist agent output for ${stageInfo.agent}`, err);
    }
  }

  private buildAgentContext(agent: AgentName, task: TaskDefinition): string {
    const parts: string[] = [];

    parts.push(`## Task\n**${task.title}**\n\n${task.description}`);

    if (task.priority) {
      parts.push(`\n**Priority**: ${task.priority}`);
    }
    if (task.estimatedComplexity) {
      parts.push(`**Estimated Complexity**: ${task.estimatedComplexity}`);
    }

    switch (agent) {
      case 'coder': {
        const plannerOutput = this.agentOutputs.get('planner');
        if (plannerOutput) {
          parts.push(`\n## Planner Specification\n${plannerOutput}`);
        }
        break;
      }
      case 'tester': {
        const coderOutput = this.agentOutputs.get('coder');
        if (coderOutput) {
          parts.push(`\n## Coder Implementation Summary\n${coderOutput}`);
        }
        break;
      }
      case 'reviewer': {
        const coderOutput = this.agentOutputs.get('coder');
        const testerOutput = this.agentOutputs.get('tester');
        if (coderOutput) {
          parts.push(`\n## Implementation Summary\n${coderOutput}`);
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
      case 'planner':
        return plannerTools;
      case 'coder':
        return coderTools;
      case 'tester':
        return testerTools;
      case 'reviewer':
        return reviewerTools;
      default:
        return [];
    }
  }

  private loadSystemPrompt(agent: AgentName): string {
    if (agent === 'orchestrator') {
      return 'You are the orchestrator agent.';
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
          log.debug(TAG, `System prompt found: ${candidate}`);
          return fs.readFileSync(candidate, 'utf-8');
        }
      } catch (err) {
        log.warn(TAG, `Failed to read prompt file: ${candidate}`, err);
      }
    }

    log.warn(TAG, `No system prompt file found for ${agent}, using fallback`);
    return this.getFallbackPrompt(agent);
  }

  private getFallbackPrompt(agent: AgentName): string {
    switch (agent) {
      case 'planner':
        return 'You are a planning agent. Analyze the task, inspect the codebase using available tools, and produce a detailed JSON implementation specification with subtasks, files to modify, success criteria, and risks.';
      case 'coder':
        return 'You are a coding agent. Follow the planner specification exactly. Write production-quality code using the project\'s existing style. Use the available tools to read, write, and test files.';
      case 'tester':
        return 'You are a testing agent. Write comprehensive tests for the implementation, run the test suite, and produce a structured test report with pass/fail counts and coverage information.';
      case 'reviewer':
        return 'You are a code review agent. Review the implementation for correctness, security, performance, and maintainability. Use create_review_comment for specific feedback. Produce a structured verdict with blocking issues and suggestions.';
      default:
        return `You are the ${agent} agent.`;
    }
  }

  private async ensureClaudeClient(): Promise<void> {
    if (this.claudeClient) return;

    log.info(TAG, 'Initializing Claude client');
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
    log.info(TAG, 'Claude client initialized');
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
    log.info(TAG, `Merging with strategy: ${strategy}`);

    try {
      await this.worktreeManager.mergeWorktree(
        'coder',
        this.sessionConfig.id,
        strategy,
      );
      log.info(TAG, 'Merge completed');
    } catch (err) {
      log.error(TAG, 'Merge failed', err);
      throw new Error(`Merge failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    for (const agent of ['planner', 'coder', 'tester', 'reviewer'] as AgentName[]) {
      try {
        await this.worktreeManager.removeWorktree(agent);
        log.debug(TAG, `Worktree cleaned up for ${agent}`);
      } catch (err) {
        log.warn(TAG, `Failed to clean up worktree for ${agent}`, err);
      }
    }
  }

  private async runDynamicPipeline(task: TaskDefinition, architecture: AgentArchitecture): Promise<void> {
    log.info(TAG, `Starting dynamic pipeline for: "${task.title}" with ${architecture.agents.length} agents`);
    await this.ensureClaudeClient();

    this.fsm.setTask(task);
    this.fsm.setStage('dynamic_group');
    this.emitTimelineEvent('pipeline_started', null, 'dynamic_group', `Dynamic pipeline: ${task.title}`);

    const agentMap = new Map(architecture.agents.map((a) => [a.id, a]));
    const totalGroups = architecture.executionOrder.length;

    for (let groupIdx = 0; groupIdx < totalGroups; groupIdx++) {
      if (this.aborted) throw new Error('Pipeline aborted by user');

      if (this.paused) {
        await this.waitForResume();
        if (this.aborted) throw new Error('Pipeline aborted by user');
      }

      const group = architecture.executionOrder[groupIdx];
      const isParallel = group.length > 1;
      log.info(TAG, `=== Execution group ${groupIdx + 1}/${totalGroups}: [${group.join(', ')}] ${isParallel ? '(parallel)' : ''} ===`);

      this.fsm.setStage('dynamic_group');

      const groupSpecs = group
        .map((id) => agentMap.get(id))
        .filter((s): s is AgentSpec => {
          if (!s) log.warn(TAG, `Unknown agent id in executionOrder`);
          return !!s;
        });

      await this.runDynamicGroup(groupSpecs, task, architecture, groupIdx);

      this.fsm.transition('groupComplete');

      const gateLevel = this.resolveGateForGroup(groupIdx, totalGroups, architecture);

      if (gateLevel === 'skip') {
        log.debug(TAG, `Gate skip for group ${groupIdx}`);
        this.emitTimelineEvent('gate_approved', null, 'dynamic_approval', `Gate auto-skipped for group ${groupIdx + 1}`);
        this.fsm.transition('approved');
      } else if (gateLevel === 'optional') {
        log.debug(TAG, `Optional gate auto-approved for group ${groupIdx}`);
        this.emitTimelineEvent('gate_approved', null, 'dynamic_approval', `Optional gate auto-approved for group ${groupIdx + 1}`);
        this.fsm.transition('approved');
      } else {
        const writerIds = groupSpecs.filter((s) => this.isWriterAgent(s)).map((s) => s.id);
        const combinedDiff = await this.computeCombinedDiffStats(writerIds);
        const nextGroupAgents = groupIdx + 1 < totalGroups ? architecture.executionOrder[groupIdx + 1] : [];
        const gatePending: GatePendingInfo = {
          stage: 'dynamic_approval',
          fromAgent: group.join(', '),
          toAgent: nextGroupAgents.join(', ') || 'merge',
          filesChanged: combinedDiff.filesChanged,
          linesAdded: combinedDiff.linesAdded,
          linesRemoved: combinedDiff.linesRemoved,
          timestamp: Date.now(),
        };

        this.fsm.setGatePending(gatePending);
        this.emit('gatePending', gatePending);
        this.emitTimelineEvent('gate_pending', null, 'dynamic_approval', `Awaiting approval after group ${groupIdx + 1}`);

        const approved = await this.waitForGateApproval();
        log.info(TAG, `Gate after group ${groupIdx + 1}: ${approved ? 'approved' : 'rejected'}`);

        if (approved) {
          this.fsm.transition('approved');
          this.emit('gateResolved', { stage: 'dynamic_approval', resolution: 'approved' });
          this.emitTimelineEvent('gate_approved', null, 'dynamic_approval', `Group ${groupIdx + 1} approved`);
        } else {
          if (this.aborted) throw new Error('Pipeline aborted by user');

          this.emit('gateResolved', { stage: 'dynamic_approval', resolution: 'rejected' });
          this.emitTimelineEvent('gate_rejected', null, 'dynamic_approval',
            `Group ${groupIdx + 1} rejected: ${this.rejectionFeedback || 'No feedback'}`);
          this.fsm.transition('rejected');

          log.info(TAG, `Re-running group ${groupIdx + 1} with rejection feedback`);
          for (const spec of groupSpecs) {
            this.fsm.updateAgentState(spec.id, { status: 'idle', progress: 0 });
          }
          groupIdx--;
          continue;
        }
      }

      this.fsm.advanceGroup();

      if (groupIdx + 1 < totalGroups) {
        const nextGroup = architecture.executionOrder[groupIdx + 1];
        this.emitTimelineEvent('handoff', group.join(', '), 'dynamic_group',
          `Handoff from [${group.join(', ')}] to [${nextGroup.join(', ')}]`);
      }
    }

    log.info(TAG, 'All dynamic groups complete, beginning merge');
    this.fsm.setStage('merging');
    this.emitTimelineEvent('merge_started', 'orchestrator', 'merging', 'Merging changes');

    await this.performDynamicMerge(architecture);
    this.fsm.transition('merged');

    this.emitTimelineEvent('merge_completed', 'orchestrator', 'done', 'Merge complete');
    this.emitTimelineEvent('pipeline_completed', null, 'done', 'Dynamic pipeline completed');
    log.info(TAG, 'Dynamic pipeline completed successfully');
  }

  private async runDynamicGroup(
    specs: AgentSpec[],
    task: TaskDefinition,
    architecture: AgentArchitecture,
    groupIdx: number,
  ): Promise<void> {
    for (const spec of specs) {
      this.fsm.updateAgentState(spec.id, { status: 'working', currentTask: task.title, progress: 0 });
      this.emitTimelineEvent('agent_started', spec.id, 'dynamic_group', `${spec.name} started`);
    }

    const timeoutMs = this.getAgentTimeoutMs();

    const results = await Promise.allSettled(
      specs.map((spec) =>
        withTimeout(
          this.runDynamicAgent(spec, task, architecture, groupIdx),
          timeoutMs,
          `Agent "${spec.name}" (${spec.id})`,
        ),
      ),
    );

    const failures: string[] = [];
    let hasSuccessfulWriter = false;

    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      const result = results[i];

      if (result.status === 'fulfilled') {
        this.fsm.updateAgentState(spec.id, { status: 'done', progress: 100 });
        this.emitTimelineEvent('agent_completed', spec.id, 'dynamic_group', `${spec.name} completed`);
        if (this.isWriterAgent(spec)) hasSuccessfulWriter = true;
      } else {
        const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        log.error(TAG, `Agent ${spec.id} failed: ${msg}`);
        this.fsm.updateAgentState(spec.id, { status: 'error' });
        this.emitTimelineEvent('agent_error', spec.id, 'dynamic_group', msg);
        failures.push(`${spec.name}: ${msg}`);
      }
    }

    const writerSpecs = specs.filter((s) => this.isWriterAgent(s));
    const allFailed = failures.length === specs.length;

    if (allFailed) {
      throw new Error(`All agents in group failed:\n${failures.join('\n')}`);
    }

    if (failures.length > 0 && writerSpecs.length > 0 && !hasSuccessfulWriter) {
      throw new Error(`All writer agents in group failed:\n${failures.join('\n')}`);
    }

    if (failures.length > 0) {
      log.warn(TAG, `${failures.length}/${specs.length} agents failed in group, continuing with partial results`);
      this.emitTimelineEvent('agent_error', null, 'dynamic_group',
        `Partial failures in group: ${failures.length}/${specs.length} agents failed`);
    }
  }

  private async runDynamicAgent(
    spec: AgentSpec,
    task: TaskDefinition,
    architecture: AgentArchitecture,
    groupIdx: number,
  ): Promise<void> {
    if (!this.claudeClient || !this.worktreeManager || !this.sessionConfig) {
      throw new Error('Orchestrator not fully initialized');
    }

    let worktreePath: string;
    try {
      worktreePath = await this.worktreeManager.createWorktree(spec.id, this.sessionConfig.id);
    } catch (err) {
      throw new Error(`Worktree creation failed for ${spec.id}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const toolExecutor = new ToolExecutor(worktreePath);
    const tools = this.resolveToolsForSpec(spec);
    const userMessage = this.buildDynamicAgentContext(spec, task, architecture, groupIdx);
    const outputChunks: string[] = [];

    log.debug(TAG, `Calling Claude API for dynamic agent ${spec.id} (model=${spec.model})`);

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
        log.debug(TAG, `${spec.id} tool call: ${toolName}`, input);
        this.emitTimelineEvent('tool_call', spec.id, 'dynamic_group', `Tool: ${toolName}`);
        try {
          const result = await toolExecutor.execute(toolName, input);
          log.debug(TAG, `${spec.id} tool ${toolName} returned (${result.length} chars)`);
          return result;
        } catch (err) {
          log.error(TAG, `${spec.id} tool ${toolName} failed`, err);
          throw err;
        }
      },
    });

    log.info(TAG, `${spec.id} produced ${output.length} chars of output`);
    this.agentOutputs.set(spec.id, output);

    try {
      this.sessionManager.storeAgentOutput(this.sessionConfig.id, spec.id, output);
    } catch (err) {
      log.error(TAG, `Failed to persist output for ${spec.id}`, err);
    }
  }

  private buildDynamicAgentContext(
    spec: AgentSpec,
    task: TaskDefinition,
    architecture: AgentArchitecture,
    groupIdx: number,
  ): string {
    const parts: string[] = [];

    parts.push(`## Task\n**${task.title}**\n\n${task.description}`);

    if (task.priority) {
      parts.push(`\n**Priority**: ${task.priority}`);
    }
    if (task.estimatedComplexity) {
      parts.push(`**Estimated Complexity**: ${task.estimatedComplexity}`);
    }

    if (this.currentPlan) {
      const plan = this.currentPlan;
      parts.push(`\n## Implementation Plan`);
      parts.push(`**Summary**: ${plan.summary}`);
      if (plan.requirements.length > 0) {
        parts.push(`\n### Requirements\n${plan.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}`);
      }
      if (plan.fileChanges.length > 0) {
        parts.push(`\n### File Changes\n${plan.fileChanges.map((f) => `- **${f.action}** \`${f.path}\`: ${f.description}`).join('\n')}`);
      }
      if (plan.risks.length > 0) {
        parts.push(`\n### Risks\n${plan.risks.map((r) => `- ${r}`).join('\n')}`);
      }
    }

    parts.push(`\n## Your Role\n**${spec.name}**: ${spec.role}`);

    const currentGroup = architecture.executionOrder[groupIdx];
    const parallelPeers = currentGroup.filter((id) => id !== spec.id);
    if (parallelPeers.length > 0) {
      const peerNames = parallelPeers
        .map((id) => architecture.agents.find((a) => a.id === id)?.name ?? id)
        .join(', ');
      parts.push(`\n**Note**: You are running in parallel with: ${peerNames}. Coordinate by avoiding conflicting file edits.`);
    }

    const priorGroupIds: string[] = [];
    for (let g = 0; g < groupIdx; g++) {
      priorGroupIds.push(...architecture.executionOrder[g]);
    }

    if (priorGroupIds.length > 0) {
      const priorOutputs: string[] = [];
      for (const priorId of priorGroupIds) {
        const output = this.agentOutputs.get(priorId);
        if (output) {
          const priorSpec = architecture.agents.find((a) => a.id === priorId);
          const label = priorSpec ? `${priorSpec.name} (${priorSpec.role})` : priorId;
          const truncated = output.length > 4000 ? output.slice(0, 4000) + '\n...(truncated)' : output;
          priorOutputs.push(`### ${label}\n${truncated}`);
        }
      }
      if (priorOutputs.length > 0) {
        parts.push(`\n## Prior Agent Outputs\n${priorOutputs.join('\n\n')}`);
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

  private async performDynamicMerge(architecture: AgentArchitecture): Promise<void> {
    if (!this.worktreeManager || !this.sessionConfig) {
      log.warn(TAG, 'performDynamicMerge called but no worktree/session');
      return;
    }

    const strategy = this.sessionConfig.gitMergeStrategy;

    const writerAgentIds: string[] = [];
    for (const group of architecture.executionOrder) {
      for (const agentId of group) {
        const spec = architecture.agents.find((a) => a.id === agentId);
        if (spec && this.isWriterAgent(spec)) {
          const agentState = this.fsm.getSnapshot().agents[agentId];
          if (agentState?.status === 'done') {
            writerAgentIds.push(agentId);
          } else {
            log.warn(TAG, `Skipping merge for agent "${agentId}" (status=${agentState?.status ?? 'unknown'})`);
          }
        }
      }
    }

    if (writerAgentIds.length === 0) {
      log.warn(TAG, 'No writer agents to merge');
    }

    for (const agentId of writerAgentIds) {
      log.info(TAG, `Merging agent "${agentId}" with strategy: ${strategy}`);
      try {
        await this.worktreeManager.mergeWorktree(agentId, this.sessionConfig.id, strategy);
        log.info(TAG, `Merge completed for agent "${agentId}"`);
      } catch (err) {
        log.error(TAG, `Merge failed for agent "${agentId}"`, err);
        throw new Error(`Merge failed for agent "${agentId}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    for (const spec of architecture.agents) {
      try {
        await this.worktreeManager.removeWorktree(spec.id);
        log.debug(TAG, `Worktree cleaned up for ${spec.id}`);
      } catch (err) {
        log.warn(TAG, `Failed to clean up worktree for ${spec.id}`, err);
      }
    }
  }

  private isWriterAgent(spec: AgentSpec): boolean {
    return spec.tools.includes('write_file') || spec.tools.includes('run_command');
  }

  private resolveGateForGroup(groupIdx: number, totalGroups: number, architecture: AgentArchitecture): GateLevel {
    if (architecture.gateAfterGroup) {
      const explicit = architecture.gateAfterGroup[groupIdx];
      if (explicit) return explicit;
    }

    if (groupIdx === totalGroups - 1) {
      return this.sessionConfig?.gates.afterReview ?? 'required';
    }

    return 'optional';
  }

  private getAgentTimeoutMs(): number {
    if (!this.sessionConfig) return DEFAULT_TIMEOUT_MS;
    const configs = Object.values(this.sessionConfig.agents);
    if (configs.length === 0) return DEFAULT_TIMEOUT_MS;
    const maxTimeout = Math.max(...configs.map((c) => c.timeoutMinutes));
    return maxTimeout * 60 * 1000;
  }

  private async computeCombinedDiffStats(
    agentIds: string[],
  ): Promise<{ filesChanged: number; linesAdded: number; linesRemoved: number }> {
    let totalFiles = 0;
    let totalAdded = 0;
    let totalRemoved = 0;
    for (const agentId of agentIds) {
      const stats = await this.computeDiffStats(agentId);
      totalFiles += stats.filesChanged;
      totalAdded += stats.linesAdded;
      totalRemoved += stats.linesRemoved;
    }
    return { filesChanged: totalFiles, linesAdded: totalAdded, linesRemoved: totalRemoved };
  }

  private resolveToolsForSpec(spec: AgentSpec): ToolDefinition[] {
    const resolved: ToolDefinition[] = [];
    for (const name of spec.tools) {
      const tool = CANONICAL_TOOL_MAP.get(name);
      if (tool) {
        resolved.push(tool);
      } else {
        log.warn(TAG, `Agent "${spec.id}" requests unknown tool "${name}" — skipping`);
      }
    }
    if (resolved.length === 0) {
      log.warn(TAG, `Agent "${spec.id}" has no resolved tools, giving read-only defaults`);
      const readFile = CANONICAL_TOOL_MAP.get('read_file');
      const listFiles = CANONICAL_TOOL_MAP.get('list_files');
      if (readFile) resolved.push(readFile);
      if (listFiles) resolved.push(listFiles);
    }
    return resolved;
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
      log.error(TAG, 'Failed to append timeline event', err);
    }
    this.emit('timelineEvent', event);
  }
}
