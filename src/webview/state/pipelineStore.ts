import { create } from 'zustand';
import type {
  AgentName,
  PipelineSnapshot,
  TimelineEvent,
} from '../../shared/types';

interface PipelineStore {
  snapshot: PipelineSnapshot | null;
  timelineEvents: TimelineEvent[];
  agentOutputs: Record<string, string[]>;
  selectedAgent: AgentName | null;
  currentView: 'map' | 'detail';

  updateSnapshot: (snapshot: PipelineSnapshot) => void;
  addTimelineEvent: (event: TimelineEvent) => void;
  addAgentOutput: (agent: AgentName, chunk: string) => void;
  selectAgent: (agent: AgentName | null) => void;
  setView: (view: 'map' | 'detail') => void;
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  snapshot: null,
  timelineEvents: [],
  agentOutputs: {},
  selectedAgent: null,
  currentView: 'map',

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
}));
