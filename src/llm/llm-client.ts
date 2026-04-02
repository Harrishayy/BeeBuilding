import type { ChatMessage, LLMConfig, LLMResponse } from './types.js';
import type { ToolDefinition } from '../agents/tools.js';
import { AnthropicProvider } from './providers/anthropic.js';

export interface StreamChatParams {
  messages: ChatMessage[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
  onChunk?: (text: string) => void;
  onToolUse?: (toolName: string, input: Record<string, unknown>) => Promise<string>;
}

export class LLMClient {
  private provider: AnthropicProvider;
  private config: LLMConfig;

  private constructor(config: LLMConfig) {
    this.config = config;
    this.provider = new AnthropicProvider(config.apiKey);
  }

  static create(apiKey: string, model: string): LLMClient {
    return new LLMClient({ apiKey, model });
  }

  get model(): string {
    return this.config.model;
  }

  async streamChat(params: StreamChatParams): Promise<LLMResponse> {
    return this.provider.streamChat({
      model: this.config.model,
      ...params,
    });
  }

  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    const response = await this.streamChat({ messages, systemPrompt });
    return response.text;
  }
}
