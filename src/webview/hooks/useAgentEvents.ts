import { useMemo } from 'react';
import { usePipelineStore } from '../state/pipelineStore';
import type { AgentName, AgentState } from '../../shared/types';

interface AgentEventData {
  agentState: AgentState | null;
  outputChunks: string[];
}

export function useAgentEvents(agentName: AgentName): AgentEventData {
  const snapshot = usePipelineStore((s) => s.snapshot);
  const agentOutputs = usePipelineStore((s) => s.agentOutputs);

  const agentState = useMemo<AgentState | null>(() => {
    if (!snapshot) return null;
    return snapshot.agents[agentName];
  }, [snapshot, agentName]);

  const outputChunks = useMemo<string[]>(
    () => agentOutputs[agentName] ?? [],
    [agentOutputs, agentName],
  );

  return { agentState, outputChunks };
}
