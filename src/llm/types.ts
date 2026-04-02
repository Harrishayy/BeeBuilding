export interface LLMConfig {
  model: string;
  apiKey: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface StreamChatParams {
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  tools?: LLMToolDefinition[];
  maxTokens?: number;
  onChunk: (text: string) => void;
  onToolUse?: (toolName: string, input: Record<string, unknown>) => Promise<string>;
}

export const AVAILABLE_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-3-5',
] as const;

export type ClaudeModel = (typeof AVAILABLE_MODELS)[number];
