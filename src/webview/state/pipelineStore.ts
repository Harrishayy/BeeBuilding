import { create } from 'zustand';
import type {
  AgentName,
  AgentArchitecture,
  AppPhase,
  PipelineSnapshot,
  PlanDocument,
  PlanningMessage,
  PlanningStatus,
  TimelineEvent,
  WorkflowSummary,
} from '../../shared/types';
import type { GitHubIssuePayload } from '../../shared/messages';
import type { ToastData } from '../components/Toast';

let _toastCounter = 0;

interface PipelineStore {
  snapshot: PipelineSnapshot | null;
  timelineEvents: TimelineEvent[];
  agentOutputs: Record<string, string[]>;
  selectedAgent: AgentName | null;
  currentView: 'map' | 'detail';

  currentPhase: AppPhase;
  planningMessages: PlanningMessage[];
  planningStatus: PlanningStatus | null;
  plan: PlanDocument | null;
  architecture: AgentArchitecture | null;
  settings: {
    hasApiKey: boolean;
    hasGitHubPAT: boolean;
    skillsPaths: string[];
    agentFrameworkPath: string;
  };
  githubIssues: GitHubIssuePayload[];

  pendingQuestions: string[];
  questionAnswers: string[];
  currentQuestionIndex: number;

  previousPhase: AppPhase | null;

  toasts: ToastData[];

  workflows: WorkflowSummary[];
  activeWorkflowId: string | null;

  isTransitionLoading: boolean;
  _transitionLoadingTimeout: ReturnType<typeof setTimeout> | null;

  setWorkflows: (list: WorkflowSummary[]) => void;
  resetForNewWorkflow: () => void;

  updateSnapshot: (snapshot: PipelineSnapshot) => void;
  addTimelineEvent: (event: TimelineEvent) => void;
  addAgentOutput: (agent: AgentName, chunk: string) => void;
  selectAgent: (agent: AgentName | null) => void;
  setView: (view: 'map' | 'detail') => void;
  setPhase: (phase: AppPhase) => void;
  openSettings: () => void;
  closeSettings: () => void;
  addPlanningMessage: (msg: PlanningMessage) => void;
  setPlanningStatus: (status: PlanningStatus | null) => void;
  setPlan: (plan: PlanDocument | null) => void;
  setArchitecture: (arch: AgentArchitecture | null) => void;
  setSettings: (s: {
    hasApiKey: boolean;
    hasGitHubPAT: boolean;
    skillsPaths: string[];
    agentFrameworkPath: string;
  }) => void;
  setGithubIssues: (issues: GitHubIssuePayload[]) => void;

  setPendingQuestions: (questions: string[]) => void;
  answerQuestion: (answer: string) => void;
  clearQuestions: () => void;

  navigateToPhase: (phase: AppPhase) => void;

  addToast: (message: string, type: ToastData['type'], duration?: number) => void;
  removeToast: (id: string) => void;

  startTransitionLoading: () => void;
  stopTransitionLoading: () => void;
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  snapshot: null,
  timelineEvents: [],
  agentOutputs: {},
  selectedAgent: null,
  currentView: 'map',

  currentPhase: 'task',
  planningMessages: [],
  planningStatus: null,
  plan: null,
  architecture: null,
  settings: { hasApiKey: false, hasGitHubPAT: false, skillsPaths: [], agentFrameworkPath: '' },
  githubIssues: [],

  pendingQuestions: [],
  questionAnswers: [],
  currentQuestionIndex: 0,

  previousPhase: null,

  toasts: [],

  workflows: [],
  activeWorkflowId: null,

  isTransitionLoading: false,
  _transitionLoadingTimeout: null,

  setWorkflows: (list) => set({ workflows: list }),

  resetForNewWorkflow: () =>
    set((state) => {
      if (state._transitionLoadingTimeout) clearTimeout(state._transitionLoadingTimeout);
      return {
        currentPhase: 'task' as AppPhase,
        planningMessages: [],
        planningStatus: null,
        plan: null,
        architecture: null,
        snapshot: null,
        timelineEvents: [],
        agentOutputs: {},
        selectedAgent: null,
        currentView: 'map' as const,
        pendingQuestions: [],
        questionAnswers: [],
        currentQuestionIndex: 0,
        previousPhase: null,
        isTransitionLoading: false,
        _transitionLoadingTimeout: null,
      };
    }),

  updateSnapshot: (snapshot) => set({ snapshot }),

  addTimelineEvent: (event) =>
    set((state) => ({
      timelineEvents: [...state.timelineEvents, event],
    })),

  addAgentOutput: (agent, chunk) =>
    set((state) => ({
      agentOutputs: {
        ...state.agentOutputs,
        [agent]: [...(state.agentOutputs[agent] ?? []), chunk],
      },
    })),

  selectAgent: (agent) => set({ selectedAgent: agent }),
  setView: (view) => set({ currentView: view }),
  setPhase: (phase) =>
    set((state) => {
      if (state._transitionLoadingTimeout) clearTimeout(state._transitionLoadingTimeout);
      return { currentPhase: phase, isTransitionLoading: false, _transitionLoadingTimeout: null };
    }),

  openSettings: () =>
    set((state) => ({
      previousPhase: state.currentPhase === 'settings' ? state.previousPhase : state.currentPhase,
      currentPhase: 'settings',
    })),

  closeSettings: () =>
    set((state) => ({
      currentPhase: state.previousPhase ?? 'task',
      previousPhase: null,
    })),

  addPlanningMessage: (msg) =>
    set((state) => ({
      planningMessages: [...state.planningMessages, msg],
    })),

  setPlanningStatus: (status) => set({ planningStatus: status }),
  setPlan: (plan) => set({ plan }),
  setArchitecture: (arch) => set({ architecture: arch }),
  setSettings: (s) => set({ settings: s }),
  setGithubIssues: (issues) => set({ githubIssues: issues }),

  setPendingQuestions: (questions) =>
    set({ pendingQuestions: questions, questionAnswers: [], currentQuestionIndex: 0 }),

  answerQuestion: (answer) =>
    set((state) => {
      const newAnswers = [...state.questionAnswers, answer];
      return {
        questionAnswers: newAnswers,
        currentQuestionIndex: state.currentQuestionIndex + 1,
      };
    }),

  clearQuestions: () =>
    set({ pendingQuestions: [], questionAnswers: [], currentQuestionIndex: 0 }),

  navigateToPhase: (phase) =>
    set((state) => {
      let targetPhase: AppPhase = phase;
      if (phase === 'planning' && state.plan) {
        targetPhase = 'plan_review';
      }
      return {
        currentPhase: targetPhase,
        previousPhase: null,
      };
    }),

  addToast: (message, type, duration) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { id: `toast-${++_toastCounter}`, message, type, duration },
      ],
    })),

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),

  startTransitionLoading: () =>
    set((state) => {
      if (state._transitionLoadingTimeout) clearTimeout(state._transitionLoadingTimeout);
      const timeout = setTimeout(() => {
        const s = usePipelineStore.getState();
        if (s.isTransitionLoading) {
          s.stopTransitionLoading();
          s.addToast('Operation timed out — please try again', 'warning', 5000);
        }
      }, 30_000);
      return { isTransitionLoading: true, _transitionLoadingTimeout: timeout };
    }),

  stopTransitionLoading: () =>
    set((state) => {
      if (state._transitionLoadingTimeout) clearTimeout(state._transitionLoadingTimeout);
      return { isTransitionLoading: false, _transitionLoadingTimeout: null };
    }),
}));
