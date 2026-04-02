import EventEmitter from 'eventemitter3';
import { log } from '../util/logger.js';
import type {
  AgentName,
  AgentSpec,
  AgentState,
  AgentStatus,
  ArtifactRef,
  GateConfig,
  GatePendingInfo,
  PipelineSnapshot,
  PipelineStage,
  TaskDefinition,
} from '../shared/types.js';

const TAG = 'PipelineFSM';

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
  | 'reset'
  | 'agentComplete'
  | 'groupComplete';

interface FSMEvents {
  stateChange: (snapshot: PipelineSnapshot) => void;
}

const DEFAULT_AGENT_NAMES: string[] = ['planner', 'coder', 'tester', 'reviewer', 'orchestrator'];

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

const THROTTLE_MS = 500;

export class PipelineFSM extends EventEmitter<FSMEvents> {
  private stage: PipelineStage = 'idle';
  private task: TaskDefinition | null = null;
  private agentStates: Record<string, AgentState>;
  private currentGate: GatePendingInfo | null = null;
  private gateConfig: GateConfig | null = null;
  private sessionId: string = '';
  private startedAt: number | null = null;
  private errorMessage: string | null = null;
  private dynamicAgentNames: string[] = DEFAULT_AGENT_NAMES;
  private _dynamicMode = false;
  private _currentGroupIndex = 0;
  private _totalGroups = 0;
  private _throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private _throttlePending = false;

  constructor() {
    super();
    this.agentStates = Object.fromEntries(
      DEFAULT_AGENT_NAMES.map((n) => [n, createDefaultAgentState(n)]),
    );
    log.debug(TAG, 'FSM initialized in idle state');
  }

  get dynamicMode(): boolean {
    return this._dynamicMode;
  }

  get currentGroupIndex(): number {
    return this._currentGroupIndex;
  }

  get totalGroups(): number {
    return this._totalGroups;
  }

  setSessionId(id: string): void {
    this.sessionId = id;
    log.debug(TAG, `Session ID set: ${id}`);
  }

  setGateConfig(config: GateConfig): void {
    this.gateConfig = config;
    log.debug(TAG, 'Gate config set', config);
  }

  setTask(task: TaskDefinition): void {
    this.task = task;
    this.startedAt = Date.now();
    this.errorMessage = null;
    log.info(TAG, `Task set: "${task.title}" (id=${task.id})`);
  }

  setDynamicAgents(agents: AgentSpec[], totalGroups: number): void {
    this._dynamicMode = true;
    this._totalGroups = totalGroups;
    this._currentGroupIndex = 0;
    this.dynamicAgentNames = agents.map((a) => a.id);
    this.agentStates = Object.fromEntries(
      this.dynamicAgentNames.map((n) => [n, createDefaultAgentState(n)]),
    );
    log.info(TAG, `Dynamic agents set: ${this.dynamicAgentNames.join(', ')} (${totalGroups} groups)`);
  }

  advanceGroup(): void {
    this._currentGroupIndex++;
    log.info(TAG, `Advanced to group ${this._currentGroupIndex}/${this._totalGroups}`);
    this.emit('stateChange', this.getSnapshot());
  }

  transition(event: FSMEvent): void {
    const prevStage = this.stage;

    if (event === 'error') {
      this.stage = 'failed';
      log.error(TAG, `Transition: ${prevStage} -> failed (error event)`);
      this.emit('stateChange', this.getSnapshot());
      return;
    }

    if (event === 'reset') {
      if (this.stage === 'done' || this.stage === 'failed') {
        log.info(TAG, `Resetting FSM from ${this.stage} to idle`);
        this.resetState();
        return;
      }
      const msg = `Cannot reset from stage "${this.stage}"`;
      log.error(TAG, msg);
      throw new Error(msg);
    }

    if (this._dynamicMode) {
      if (event === 'groupComplete') {
        log.info(TAG, `Transition: ${prevStage} -[groupComplete]-> dynamic_approval`);
        this.stage = 'dynamic_approval';
        this.currentGate = null;
        this.emit('stateChange', this.getSnapshot());
        return;
      }

      if (event === 'approved' && this.stage === 'dynamic_approval') {
        this.stage = 'dynamic_group';
        this.currentGate = null;
        log.info(TAG, `Transition: dynamic_approval -[approved]-> dynamic_group`);
        this.emit('stateChange', this.getSnapshot());
        return;
      }

      if (event === 'rejected' && this.stage === 'dynamic_approval') {
        this.stage = 'dynamic_group';
        this.currentGate = null;
        log.info(TAG, `Transition: dynamic_approval -[rejected]-> dynamic_group (re-run)`);
        this.emit('stateChange', this.getSnapshot());
        return;
      }

      if (event === 'merged') {
        this.stage = 'done';
        this.currentGate = null;
        log.info(TAG, `Transition: ${prevStage} -[merged]-> done`);
        this.emit('stateChange', this.getSnapshot());
        return;
      }
    }

    const stageTransitions = TRANSITION_TABLE[this.stage];
    const nextStage = stageTransitions?.[event];

    if (!nextStage) {
      const msg = `Invalid transition: "${this.stage}" + "${event}". No such transition exists.`;
      log.error(TAG, msg);
      throw new Error(msg);
    }

    log.info(TAG, `Transition: ${prevStage} -[${event}]-> ${nextStage}`);
    this.stage = nextStage;
    this.currentGate = null;
    this.emit('stateChange', this.getSnapshot());

    if (this.gateConfig && this.isApprovalStage(nextStage)) {
      const gateKey = APPROVAL_STAGE_TO_GATE_KEY[nextStage];
      if (gateKey && this.gateConfig[gateKey] === 'skip') {
        log.debug(TAG, `Auto-skipping gate at ${nextStage} (config=skip)`);
        this.transition('approved');
      }
    }
  }

  setStage(stage: PipelineStage): void {
    this.stage = stage;
    this.emit('stateChange', this.getSnapshot());
  }

  getSnapshot(): PipelineSnapshot {
    return {
      sessionId: this.sessionId,
      stage: this.stage,
      task: this.task,
      agents: { ...this.agentStates } as Record<AgentName, AgentState>,
      currentGate: this.currentGate ? { ...this.currentGate } : null,
      startedAt: this.startedAt,
      error: this.errorMessage,
      dynamicMode: this._dynamicMode,
      currentGroupIndex: this._currentGroupIndex,
      totalGroups: this._totalGroups,
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
    if (!this.agentStates[name]) {
      this.agentStates[name] = createDefaultAgentState(name);
    }
    const current = this.agentStates[name];
    if (update.status !== undefined) current.status = update.status;
    if (update.currentTask !== undefined) current.currentTask = update.currentTask;
    if (update.outputChunks !== undefined) current.outputChunks = update.outputChunks;
    if (update.artifacts !== undefined) current.artifacts = update.artifacts;
    if (update.progress !== undefined) current.progress = update.progress;

    const isImmediate = update.status !== undefined || update.currentTask !== undefined;
    if (isImmediate) {
      this.emitStateChangeNow();
    } else {
      this.emitStateChangeThrottled();
    }
  }

  private emitStateChangeNow(): void {
    if (this._throttleTimer) {
      clearTimeout(this._throttleTimer);
      this._throttleTimer = null;
    }
    this._throttlePending = false;
    this.emit('stateChange', this.getSnapshot());
  }

  private emitStateChangeThrottled(): void {
    this._throttlePending = true;
    if (this._throttleTimer) return;
    this._throttleTimer = setTimeout(() => {
      this._throttleTimer = null;
      if (this._throttlePending) {
        this._throttlePending = false;
        this.emit('stateChange', this.getSnapshot());
      }
    }, THROTTLE_MS);
  }

  setGatePending(info: GatePendingInfo): void {
    this.currentGate = info;
    log.info(TAG, `Gate pending: ${info.stage} (${info.fromAgent} -> ${info.toAgent})`);
    this.emit('stateChange', this.getSnapshot());
  }

  setError(message: string): void {
    this.errorMessage = message;
    log.error(TAG, `Error set: ${message}`);
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
    this._dynamicMode = false;
    this._currentGroupIndex = 0;
    this._totalGroups = 0;
    this.dynamicAgentNames = DEFAULT_AGENT_NAMES;
    this.agentStates = Object.fromEntries(
      DEFAULT_AGENT_NAMES.map((n) => [n, createDefaultAgentState(n)]),
    );
    log.info(TAG, 'FSM reset to idle');
    this.emit('stateChange', this.getSnapshot());
  }

  private isApprovalStage(stage: PipelineStage): boolean {
    return stage in APPROVAL_STAGE_TO_GATE_KEY;
  }
}
