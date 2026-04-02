import EventEmitter from 'eventemitter3';
import type {
  AgentName,
  AgentState,
  AgentStatus,
  ArtifactRef,
  GateConfig,
  GatePendingInfo,
  PipelineSnapshot,
  PipelineStage,
  TaskDefinition,
} from '../shared/types.js';

export type FSMEvent =
  | 'taskSubmitted'
  | 'planComplete'
  | 'approved'
  | 'rejected'
  | 'codeComplete'
  | 'testsComplete'
  | 'reviewComplete'
  | 'merged'
  | 'error'
  | 'reset';

interface FSMEvents {
  stateChange: (snapshot: PipelineSnapshot) => void;
}

const AGENT_NAMES: AgentName[] = ['planner', 'coder', 'tester', 'reviewer', 'orchestrator'];

const TRANSITION_TABLE: Partial<
  Record<PipelineStage, Partial<Record<FSMEvent, PipelineStage>>>
> = {
  idle: { taskSubmitted: 'planning' },
  planning: { planComplete: 'plan_approval' },
  plan_approval: { approved: 'coding', rejected: 'planning' },
  coding: { codeComplete: 'code_approval' },
  code_approval: { approved: 'testing', rejected: 'coding' },
  testing: { testsComplete: 'test_approval' },
  test_approval: { approved: 'reviewing', rejected: 'testing' },
  reviewing: { reviewComplete: 'review_approval' },
  review_approval: { approved: 'merging', rejected: 'coding' },
  merging: { merged: 'done' },
  done: { reset: 'idle' },
  failed: { reset: 'idle' },
};

const APPROVAL_STAGE_TO_GATE_KEY: Partial<Record<PipelineStage, keyof GateConfig>> = {
  plan_approval: 'afterPlanning',
  code_approval: 'afterCoding',
  test_approval: 'afterTesting',
  review_approval: 'afterReview',
};

function createDefaultAgentState(name: AgentName): AgentState {
  return {
    name,
    status: 'idle',
    currentTask: null,
    outputChunks: [],
    artifacts: [],
    progress: 0,
  };
}

export class PipelineFSM extends EventEmitter<FSMEvents> {
  private stage: PipelineStage = 'idle';
  private task: TaskDefinition | null = null;
  private agentStates: Record<AgentName, AgentState>;
  private currentGate: GatePendingInfo | null = null;
  private gateConfig: GateConfig | null = null;
  private sessionId: string = '';
  private startedAt: number | null = null;
  private errorMessage: string | null = null;

  constructor() {
    super();
    this.agentStates = Object.fromEntries(
      AGENT_NAMES.map((n) => [n, createDefaultAgentState(n)]),
    ) as Record<AgentName, AgentState>;
  }

  setSessionId(id: string): void {
    this.sessionId = id;
  }

  setGateConfig(config: GateConfig): void {
    this.gateConfig = config;
  }

  setTask(task: TaskDefinition): void {
    this.task = task;
    this.startedAt = Date.now();
    this.errorMessage = null;
  }

  transition(event: FSMEvent): void {
    if (event === 'error') {
      this.stage = 'failed';
      this.emit('stateChange', this.getSnapshot());
      return;
    }

    if (event === 'reset') {
      if (this.stage === 'done' || this.stage === 'failed') {
        this.resetState();
        return;
      }
      throw new Error(`Cannot reset from stage "${this.stage}"`);
    }

    const stageTransitions = TRANSITION_TABLE[this.stage];
    const nextStage = stageTransitions?.[event];

    if (!nextStage) {
      throw new Error(
        `Invalid transition: "${this.stage}" + "${event}". No such transition exists.`,
      );
    }

    this.stage = nextStage;
    this.currentGate = null;
    this.emit('stateChange', this.getSnapshot());

    if (this.gateConfig && this.isApprovalStage(nextStage)) {
      const gateKey = APPROVAL_STAGE_TO_GATE_KEY[nextStage];
      if (gateKey && this.gateConfig[gateKey] === 'skip') {
        this.transition('approved');
      }
    }
  }

  getSnapshot(): PipelineSnapshot {
    return {
      sessionId: this.sessionId,
      stage: this.stage,
      task: this.task,
      agents: Object.fromEntries(
        AGENT_NAMES.map((n) => [n, { ...this.agentStates[n] }]),
      ) as Record<AgentName, AgentState>,
      currentGate: this.currentGate ? { ...this.currentGate } : null,
      startedAt: this.startedAt,
      error: this.errorMessage,
    };
  }

  getStage(): PipelineStage {
    return this.stage;
  }

  updateAgentState(
    name: AgentName,
    update: Partial<{
      status: AgentStatus;
      currentTask: string | null;
      outputChunks: string[];
      artifacts: ArtifactRef[];
      progress: number;
    }>,
  ): void {
    const current = this.agentStates[name];
    if (update.status !== undefined) current.status = update.status;
    if (update.currentTask !== undefined) current.currentTask = update.currentTask;
    if (update.outputChunks !== undefined) current.outputChunks = update.outputChunks;
    if (update.artifacts !== undefined) current.artifacts = update.artifacts;
    if (update.progress !== undefined) current.progress = update.progress;
  }

  setGatePending(info: GatePendingInfo): void {
    this.currentGate = info;
    this.emit('stateChange', this.getSnapshot());
  }

  setError(message: string): void {
    this.errorMessage = message;
  }

  reset(): void {
    this.resetState();
  }

  private resetState(): void {
    this.stage = 'idle';
    this.task = null;
    this.currentGate = null;
    this.startedAt = null;
    this.errorMessage = null;
    this.agentStates = Object.fromEntries(
      AGENT_NAMES.map((n) => [n, createDefaultAgentState(n)]),
    ) as Record<AgentName, AgentState>;
    this.emit('stateChange', this.getSnapshot());
  }

  private isApprovalStage(stage: PipelineStage): boolean {
    return stage in APPROVAL_STAGE_TO_GATE_KEY;
  }
}
