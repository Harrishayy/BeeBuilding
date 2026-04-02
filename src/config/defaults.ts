import { randomUUID } from 'node:crypto';
import type { AgentConfig, AgentName, GateConfig, SessionConfig } from '../shared/types.js';

export const defaultAgentConfigs: Record<AgentName, AgentConfig> = {
  scout_bee: {
    model: 'claude-opus-4-6',
    approvalRequired: false,
    timeoutMinutes: 45,
  },
  worker_bee: {
    model: 'claude-sonnet-4-6',
    approvalRequired: true,
    approvalAfterLines: 100,
    timeoutMinutes: 45,
  },
  tester_bee: {
    model: 'claude-sonnet-4-6',
    approvalRequired: true,
    timeoutMinutes: 45,
  },
  guard_bee: {
    model: 'claude-opus-4-6',
    approvalRequired: true,
    timeoutMinutes: 45,
  },
  queen_bee: {
    model: 'claude-opus-4-6',
    approvalRequired: false,
    timeoutMinutes: 90,
  },
};

export const defaultGateConfig: GateConfig = {
  afterPlanning: 'required',
  afterCoding: 'required',
  afterTesting: 'optional',
  afterReview: 'required',
};

export function defaultSessionConfig(projectPath: string): SessionConfig {
  return {
    id: randomUUID(),
    projectPath,
    agents: { ...defaultAgentConfigs },
    gates: { ...defaultGateConfig },
    gitMergeStrategy: 'squash',
    createdAt: Date.now(),
  };
}
