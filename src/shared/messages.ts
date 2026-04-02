import type {
  AgentName,
  AgentArchitecture,
  AppPhase,
  PipelineSnapshot,
  PipelineStage,
  PlanDocument,
  PlanningMessage,
  PlanningStatus,
  TimelineEvent,
  GatePendingInfo,
} from './types.js';

export interface GitHubIssuePayload {
  number: number;
  title: string;
  body: string;
  labels: string[];
  state: string;
  createdAt: string;
  author: string;
}

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
  | { type: 'sessionLoaded'; payload: { sessionId: string } }
  | {
      type: 'settingsState';
      payload: {
        hasApiKey: boolean;
        hasGitHubPAT: boolean;
        skillsPaths: string[];
        agentFrameworkPath: string;
      };
    }
  | { type: 'planningMessage'; payload: PlanningMessage }
  | { type: 'planReady'; payload: PlanDocument }
  | { type: 'architectureReady'; payload: AgentArchitecture }
  | { type: 'planningStatus'; payload: { phase: PlanningStatus } }
  | { type: 'issuesList'; payload: GitHubIssuePayload[] }
  | { type: 'issueImported'; payload: { title: string; body: string; labels: string[] } }
  | {
      type: 'sessionRestore';
      payload: {
        phase: AppPhase;
        planningMessages: PlanningMessage[];
        plan: PlanDocument | null;
        architecture: AgentArchitecture | null;
      };
    };

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
  | { type: 'requestState' }
  | { type: 'saveApiKey'; payload: { apiKey: string } }
  | { type: 'removeApiKey' }
  | { type: 'saveGitHubPAT'; payload: { token: string } }
  | { type: 'requestSettings' }
  | { type: 'addSkillsPath'; payload: { path: string } }
  | { type: 'removeSkillsPath'; payload: { path: string } }
  | { type: 'saveAgentFrameworkPath'; payload: { path: string } }
  | { type: 'clearAgentFrameworkPath' }
  | { type: 'startPlanning'; payload: { description: string; context?: string } }
  | { type: 'sendPlanningReply'; payload: { message: string } }
  | { type: 'approvePlan' }
  | { type: 'revisePlan'; payload: { feedback: string } }
  | { type: 'approveArchitecture' }
  | { type: 'reviseArchitecture'; payload: { feedback: string } }
  | { type: 'fetchIssues'; payload: { filter?: string } }
  | { type: 'importIssue'; payload: { issueNumber: number } };
