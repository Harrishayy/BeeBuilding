import { LLMClient } from '../llm/llm-client.js';
import type { ChatMessage } from '../llm/types.js';
import type { PlanDocument, PlanningMessage } from '../shared/types.js';
import { log } from '../util/logger.js';

const TAG = 'PlanningEngine';

const PLANNING_SYSTEM_PROMPT = `You are an expert software planning assistant. Your job is to understand the user's task deeply before creating an implementation plan.

PHASE 1 - CLARIFICATION:
Ask 2-4 focused clarifying questions about:
- Scope and boundaries of the change
- Constraints (performance, backward compatibility, etc.)
- Existing code patterns to follow
- Testing requirements

Respond with JSON:
{"status":"questions","questions":["question1","question2"]}

PHASE 2 - PLAN GENERATION:
Once you have enough context, generate a comprehensive plan.
Respond with JSON:
{"status":"plan","plan":{"title":"...","summary":"...","requirements":["req1","req2"],"fileChanges":[{"path":"file.ts","action":"create|modify|delete","description":"what changes"}],"risks":["risk1"],"complexity":"low|medium|high"}}

IMPORTANT: Always respond with valid JSON only. No markdown, no extra text.`;

interface PlanningLLMResponse {
  status: 'questions' | 'plan';
  questions?: string[];
  plan?: PlanDocument;
}

export class PlanningEngine {
  private llmClient: LLMClient;
  private conversationHistory: ChatMessage[] = [];
  private planningMessages: PlanningMessage[] = [];

  constructor(apiKey: string, model: string) {
    this.llmClient = LLMClient.create(apiKey, model);
  }

  async startPlanning(taskDescription: string, context?: string): Promise<PlanningLLMResponse> {
    log.info(TAG, `Starting planning for: ${taskDescription.substring(0, 50)}...`);

    let userMessage = `Task: ${taskDescription}`;
    if (context) {
      userMessage += `\n\nAdditional context:\n${context}`;
    }

    this.conversationHistory = [];
    this.planningMessages = [];

    this.addMessage('user', userMessage);

    return this.sendToLLM();
  }

  async continueConversation(userReply: string): Promise<PlanningLLMResponse> {
    log.info(TAG, `User reply: ${userReply.substring(0, 50)}...`);
    this.addMessage('user', userReply);
    return this.sendToLLM();
  }

  getMessages(): PlanningMessage[] {
    return [...this.planningMessages];
  }

  private addMessage(role: 'user' | 'assistant', content: string): void {
    this.conversationHistory.push({ role, content });
    this.planningMessages.push({ role, content, timestamp: Date.now() });
  }

  private async sendToLLM(): Promise<PlanningLLMResponse> {
    const response = await this.llmClient.chat(
      this.conversationHistory,
      PLANNING_SYSTEM_PROMPT,
    );

    this.addMessage('assistant', response);

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        log.warn(TAG, 'No JSON found in response, treating as questions');
        return { status: 'questions', questions: [response] };
      }

      const parsed = JSON.parse(jsonMatch[0]) as PlanningLLMResponse;
      log.info(TAG, `Planning response status: ${parsed.status}`);
      return parsed;
    } catch {
      log.warn(TAG, 'Failed to parse planning response as JSON');
      return { status: 'questions', questions: [response] };
    }
  }
}
