export type DefaultAgentName = 'scout_bee' | 'worker_bee' | 'tester_bee' | 'guard_bee' | 'queen_bee';
export type AgentName = string;

export type PipelineStage =
  | 'idle'
  | 'planning'
  | 'plan_approval'
  | 'coding'
  | 'code_approval'
  | 'testing'
  | 'test_approval'
  | 'reviewing'
  | 'review_approval'
  | 'merging'
  | 'done'
  | 'failed';

export type AgentStatus = 'idle' | 'working' | 'done' | 'blocked' | 'error';

export type AppPhase = 'settings' | 'task' | 'planning' | 'plan_review' | 'architecture' | 'execution';

export type PlanningStatus = 'chatting' | 'generating_plan' | 'generating_architecture' | 'ready';

export interface PlanningMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface PlanDocument {
  title: string;
  summary: string;
  requirements: string[];
  fileChanges: FileChange[];
  risks: string[];
  complexity: 'low' | 'medium' | 'high';
}

export interface FileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  description: string;
}

export interface AgentSpec {
  id: string;
  name: string;
  role: string;
  tools: string[];
  model: string;
  systemPrompt: string;
}

export interface AgentArchitecture {
  agents: AgentSpec[];
  executionOrder: string[][];
  estimatedTime: string;
}

export interface TaskDefinition {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  estimatedComplexity?: 'low' | 'medium' | 'high';
  createdAt: number;
}

export interface AgentOutput {
  agentName: AgentName;
  stage: PipelineStage;
  chunks: string[];
  artifacts: ArtifactRef[];
  toolCalls: ToolCallRecord[];
  startedAt: number;
  completedAt?: number;
}

export interface ArtifactRef {
  id: string;
  type: 'spec' | 'code' | 'test_report' | 'review' | 'diff';
  name: string;
  path: string;
  summary: string;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  input: Record<string, unknown>;
  output: string;
  timestamp: number;
}

export interface GateConfig {
  afterPlanning: 'required' | 'optional' | 'skip';
  afterCoding: 'required' | 'optional' | 'skip';
  afterTesting: 'required' | 'optional' | 'skip';
  afterReview: 'required' | 'optional' | 'skip';
}

export interface AgentConfig {
  model: string;
  approvalRequired: boolean;
  approvalAfterLines?: number;
  timeoutMinutes: number;
}

export interface SessionConfig {
  id: string;
  projectPath: string;
  agents: Record<AgentName, AgentConfig>;
  gates: GateConfig;
  gitMergeStrategy: 'squash' | 'rebase' | 'merge';
  createdAt: number;
}

export interface PipelineSnapshot {
  sessionId: string;
  stage: PipelineStage;
  task: TaskDefinition | null;
  agents: Record<AgentName, AgentState>;
  currentGate: GatePendingInfo | null;
  startedAt: number | null;
  error: string | null;
}

export interface AgentState {
  name: AgentName;
  status: AgentStatus;
  currentTask: string | null;
  outputChunks: string[];
  artifacts: ArtifactRef[];
  progress: number;
}

export interface GatePendingInfo {
  stage: PipelineStage;
  fromAgent: AgentName;
  toAgent: AgentName;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  timestamp: number;
}

export interface TimelineEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  type: TimelineEventType;
  agentName: AgentName | null;
  stage: PipelineStage;
  payload: Record<string, unknown>;
  message: string;
}

export type TimelineEventType =
  | 'pipeline_started'
  | 'pipeline_completed'
  | 'pipeline_failed'
  | 'agent_started'
  | 'agent_output'
  | 'agent_completed'
  | 'agent_error'
  | 'gate_pending'
  | 'gate_approved'
  | 'gate_rejected'
  | 'handoff'
  | 'tool_call'
  | 'file_changed'
  | 'merge_started'
  | 'merge_completed';
