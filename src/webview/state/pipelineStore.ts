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
  settings: { hasApiKey: boolean; hasGitHubPAT: boolean };
  githubIssues: GitHubIssuePayload[];

  pendingQuestions: string[];
  questionAnswers: string[];
  currentQuestionIndex: number;

  previousPhase: AppPhase | null;

  toasts: ToastData[];

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
  setSettings: (s: { hasApiKey: boolean; hasGitHubPAT: boolean }) => void;
  setGithubIssues: (issues: GitHubIssuePayload[]) => void;

  setPendingQuestions: (questions: string[]) => void;
  answerQuestion: (answer: string) => void;
  clearQuestions: () => void;

  addToast: (message: string, type: ToastData['type'], duration?: number) => void;
  removeToast: (id: string) => void;
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
  settings: { hasApiKey: false, hasGitHubPAT: false },
  githubIssues: [],

  pendingQuestions: [],
  questionAnswers: [],
  currentQuestionIndex: 0,

  previousPhase: null,

  toasts: [],

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
  setPhase: (phase) => set({ currentPhase: phase }),

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
}));
