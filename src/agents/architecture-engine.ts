import { LLMClient } from '../llm/llm-client.js';
import type { PlanDocument, AgentSpec, AgentArchitecture } from '../shared/types.js';
import { log } from '../util/logger.js';

const TAG = 'ArchitectureEngine';

const ARCHITECTURE_SYSTEM_PROMPT = `You are an expert software architecture agent. Given an implementation plan, determine the optimal agent architecture for execution.

Decide:
1. How many agents are needed (1-6)
2. Each agent's role, name, and responsibilities
3. What tools each agent needs (from: read_file, write_file, run_command, search_codebase, list_files, create_review_comment)
4. Execution order - which agents run sequentially vs in parallel
5. Approval gates - which execution groups need user approval before proceeding
6. Estimated time per agent

Respond with valid JSON only:
{
  "agents": [
    {
      "id": "unique-id",
      "name": "Agent Name",
      "role": "Description of what this agent does",
      "tools": ["read_file", "write_file"],
      "model": "claude-sonnet-4-6",
      "systemPrompt": "You are a ... agent. Your task is to ..."
    }
  ],
  "executionOrder": [["agent-id-1"], ["agent-id-2", "agent-id-3"]],
  "gateAfterGroup": { "1": "required" },
  "estimatedTime": "15 minutes"
}

executionOrder is an array of arrays. Each inner array is a group of agents that can run in parallel. Groups execute sequentially.
gateAfterGroup maps group index (0-based) to "required", "optional", or "skip". The last group should typically be "required" so the user can review before merge. Omit groups that should default to "optional".`;

export class ArchitectureEngine {
  private llmClient: LLMClient;

  constructor(apiKey: string, model: string) {
    this.llmClient = LLMClient.create(apiKey, model);
  }

  async determineArchitecture(plan: PlanDocument): Promise<AgentArchitecture> {
    log.info(TAG, `Determining architecture for plan: ${plan.title}`);

    const prompt = `Given this implementation plan, determine the optimal agent architecture:

## Plan: ${plan.title}

### Summary
${plan.summary}

### Requirements
${plan.requirements.map((r, i) => `${i + 1}. ${r}`).join('\n')}

### File Changes
${plan.fileChanges.map((f) => `- ${f.action}: ${f.path} — ${f.description}`).join('\n')}

### Risks
${plan.risks.map((r) => `- ${r}`).join('\n')}

### Complexity: ${plan.complexity}

Determine the agent architecture now.`;

    const response = await this.llmClient.chat(
      [{ role: 'user', content: prompt }],
      ARCHITECTURE_SYSTEM_PROMPT,
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');

      const parsed = JSON.parse(jsonMatch[0]) as AgentArchitecture;
      log.info(TAG, `Architecture: ${parsed.agents.length} agents, ${parsed.executionOrder.length} groups`);
      return parsed;
    } catch (err) {
      log.error(TAG, 'Failed to parse architecture response', err);
      return this.fallbackArchitecture(plan);
    }
  }

  private fallbackArchitecture(plan: PlanDocument): AgentArchitecture {
    const agents: AgentSpec[] = [
      {
        id: 'planner',
        name: 'Planner',
        role: 'Analyze the plan and create detailed implementation steps',
        tools: ['read_file', 'list_files', 'search_codebase'],
        model: 'claude-sonnet-4-6',
        systemPrompt: 'You are a planning agent. Create detailed implementation steps.',
      },
      {
        id: 'coder',
        name: 'Coder',
        role: 'Implement the changes described in the plan',
        tools: ['read_file', 'write_file', 'run_command', 'search_codebase'],
        model: 'claude-sonnet-4-6',
        systemPrompt: 'You are a coding agent. Implement the changes.',
      },
      {
        id: 'tester',
        name: 'Tester',
        role: 'Write and run tests for the implementation',
        tools: ['read_file', 'write_file', 'run_command'],
        model: 'claude-sonnet-4-6',
        systemPrompt: 'You are a testing agent. Write and run tests.',
      },
      {
        id: 'reviewer',
        name: 'Reviewer',
        role: 'Review the implementation for quality and correctness',
        tools: ['read_file', 'search_codebase', 'create_review_comment'],
        model: 'claude-sonnet-4-6',
        systemPrompt: 'You are a review agent. Review the code.',
      },
    ];

    return {
      agents,
      executionOrder: [['planner'], ['coder'], ['tester'], ['reviewer']],
      estimatedTime: `${plan.complexity === 'high' ? 30 : plan.complexity === 'medium' ? 20 : 10} minutes`,
      gateAfterGroup: { 1: 'optional', 3: 'required' },
    };
  }
}
