import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import EventEmitter from 'eventemitter3';
import type {
  AgentName,
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
import type { SessionConfig } from '../shared/types.js';

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
  private agentOutputs: Map<AgentName, string> = new Map();
  private paused = false;
  private aborted = false;
  private rejectionFeedback = '';

  private gateResolve: ((approved: boolean) => void) | null = null;
  private pauseResolve: (() => void) | null = null;

  constructor(private readonly context: vscode.ExtensionContext) {
    super();

    const storagePath = context.globalStorageUri.fsPath;
    fs.mkdirSync(storagePath, { recursive: true });

    const dbPath = path.join(storagePath, 'agentflow.db');
    this.sessionManager = new SessionManager(dbPath);

    this.fsm = new PipelineFSM();
    this.fsm.on('stateChange', (snapshot) => {
      this.emit('stateChange', snapshot);
      if (this.sessionConfig) {
        this.sessionManager.updatePipelineState(
          this.sessionConfig.id,
          snapshot.stage,
          JSON.stringify(snapshot),
        );
      }
    });
  }

  createSession(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.emit('error', { message: 'No workspace folder open', recoverable: true });
      return;
    }

    const projectPath = workspaceFolders[0].uri.fsPath;
    const config = parseAgentsConfig(projectPath);

    this.sessionConfig = config;
    this.sessionManager.createSession(config);

    this.fsm.setSessionId(config.id);
    this.fsm.setGateConfig(config.gates);

    this.worktreeManager = new WorktreeManager(projectPath);

    const logPath = path.join(
      this.context.globalStorageUri.fsPath,
      'timelines',
      `${config.id}.jsonl`,
    );
    this.timelineLog = new TimelineLog(logPath);

    this.agentOutputs.clear();
    this.paused = false;
    this.aborted = false;
    this.rejectionFeedback = '';

    this.emitTimelineEvent('pipeline_started', null, 'idle', 'Session created');
  }

  async submitTask(task: TaskDefinition): Promise<void> {
    if (!this.sessionConfig) {
      this.createSession();
    }

    this.runPipeline(task).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      this.fsm.setError(message);
      this.fsm.transition('error');
      this.emitTimelineEvent('pipeline_failed', null, this.fsm.getStage(), message);
      this.emit('error', { message, recoverable: false });
    });
  }

  approveCurrentGate(): void {
    if (this.gateResolve) {
      const resolve = this.gateResolve;
      this.gateResolve = null;
      resolve(true);
    }
  }

  rejectCurrentGate(feedback: string): void {
    this.rejectionFeedback = feedback;
    if (this.gateResolve) {
      const resolve = this.gateResolve;
      this.gateResolve = null;
      resolve(false);
    }
  }

  pause(): void {
    this.paused = !this.paused;
    if (!this.paused && this.pauseResolve) {
      const resolve = this.pauseResolve;
      this.pauseResolve = null;
      resolve();
    }
  }

  abort(): void {
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
    if (!this.worktreeManager || !this.sessionConfig) return;

    this.worktreeManager
      .getDiff(agent, this.sessionConfig.id)
      .then((diff) => {
        this.emit('agentOutput', {
          agent,
          chunk: diff,
          timestamp: Date.now(),
        });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
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
    if (this.worktreeManager) {
      this.worktreeManager.cleanupAll().catch(() => {
        // Best-effort cleanup on dispose
      });
    }
    this.sessionManager.close();
    this.removeAllListeners();
  }

  // --- Private pipeline logic ---

  private async runPipeline(task: TaskDefinition): Promise<void> {
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
        await this.waitForResume();
        if (this.aborted) {
          throw new Error('Pipeline aborted by user');
        }
      }

      const stageInfo = PIPELINE_STAGES[currentStageIndex];

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
        await this.runAgentStage(stageInfo, task);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
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
        const backIndex = PIPELINE_STAGES.findIndex(
          (s) => s.workingStage === rejectedToStage,
        );
        currentStageIndex = backIndex >= 0 ? backIndex : currentStageIndex;
      }
    }

    this.emitTimelineEvent('merge_started', 'orchestrator', 'merging', 'Merging changes');

    await this.performMerge();
    this.fsm.transition('merged');

    this.emitTimelineEvent('merge_completed', 'orchestrator', 'done', 'Merge complete');
    this.emitTimelineEvent('pipeline_completed', null, 'done', 'Pipeline completed successfully');
  }

  private async runAgentStage(
    stageInfo: PipelineStageInfo,
    task: TaskDefinition,
  ): Promise<void> {
    if (!this.claudeClient || !this.worktreeManager || !this.sessionConfig) {
      throw new Error('Orchestrator not fully initialized');
    }

    const worktreePath = await this.worktreeManager.createWorktree(
      stageInfo.agent,
      this.sessionConfig.id,
    );

    const systemPrompt = this.loadSystemPrompt(stageInfo.agent);
    const toolExecutor = new ToolExecutor(worktreePath);
    const tools = this.getToolsForAgent(stageInfo.agent);
    const userMessage = this.buildAgentContext(stageInfo.agent, task);

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
        this.emitTimelineEvent(
          'tool_call',
          stageInfo.agent,
          stageInfo.workingStage,
          `Tool: ${toolName}`,
        );
        return toolExecutor.execute(toolName, input);
      },
    });

    this.agentOutputs.set(stageInfo.agent, output);
    this.sessionManager.storeAgentOutput(
      this.sessionConfig.id,
      stageInfo.agent,
      output,
    );
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
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf-8');
      }
    }

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

    let apiKey: string | undefined;

    try {
      apiKey = await this.context.secrets.get('agentflow.claudeApiKey');
    } catch {
      // SecretStorage may not be available
    }

    if (!apiKey) {
      apiKey = vscode.workspace
        .getConfiguration('agentflow')
        .get<string>('claudeApiKey');
    }

    if (!apiKey) {
      throw new Error(
        'Claude API key not configured. Set it via SecretStorage or agentflow.claudeApiKey setting.',
      );
    }

    this.claudeClient = new ClaudeClient(apiKey);
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

      return { filesChanged: files.size, linesAdded: added, linesRemoved: removed };
    } catch {
      return { filesChanged: 0, linesAdded: 0, linesRemoved: 0 };
    }
  }

  private async performMerge(): Promise<void> {
    if (!this.worktreeManager || !this.sessionConfig) return;

    const strategy = this.sessionConfig.gitMergeStrategy;

    await this.worktreeManager.mergeWorktree(
      'coder',
      this.sessionConfig.id,
      strategy,
    );

    for (const agent of ['planner', 'coder', 'tester', 'reviewer'] as AgentName[]) {
      try {
        await this.worktreeManager.removeWorktree(agent);
      } catch {
        // Best-effort cleanup
      }
    }
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

    this.timelineLog?.append(event);
    this.emit('timelineEvent', event);
  }
}
