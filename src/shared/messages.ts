import type {
  AgentName,
  PipelineSnapshot,
  PipelineStage,
  TimelineEvent,
  GatePendingInfo,
} from './types.js';

// Extension Host -> Webview
export type ExtensionMessage =
  | { type: 'pipelineState'; payload: PipelineSnapshot }
  | {
      type: 'agentOutput';
      payload: { agent: AgentName; chunk: string; timestamp: number };
    }
  | {
      type: 'agentHandoff';
      payload: { from: AgentName; to: AgentName; artifact: string; timestamp: number };
    }
  | { type: 'gatePending'; payload: GatePendingInfo }
  | {
      type: 'gateResolved';
      payload: { stage: PipelineStage; resolution: 'approved' | 'rejected' };
    }
  | { type: 'timelineEvent'; payload: TimelineEvent }
  | { type: 'error'; payload: { message: string; recoverable: boolean } }
  | { type: 'sessionLoaded'; payload: { sessionId: string } };

// Webview -> Extension Host
export type WebviewMessage =
  | {
      type: 'submitTask';
      payload: { title: string; description: string; priority: string };
    }
  | { type: 'approveGate'; payload: { stage: PipelineStage } }
  | {
      type: 'rejectGate';
      payload: { stage: PipelineStage; feedback: string };
    }
  | { type: 'pausePipeline' }
  | { type: 'abortTask' }
  | { type: 'requestDiff'; payload: { agent: AgentName } }
  | { type: 'selectAgent'; payload: { agent: AgentName } }
  | { type: 'requestState' };
