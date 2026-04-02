import Anthropic from '@anthropic-ai/sdk';
import type { ToolDefinition } from './tools.js';

export interface AgentMessageParams {
  model: string;
  systemPrompt: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  tools: ToolDefinition[];
  onChunk: (chunk: string) => void;
  onToolUse: (toolName: string, input: Record<string, unknown>) => Promise<string>;
}

export class ClaudeClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async createAgentMessage(params: AgentMessageParams): Promise<string> {
    const internalMessages: Anthropic.MessageParam[] = params.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const tools: Anthropic.Tool[] = params.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: t.input_schema.properties,
        required: t.input_schema.required,
      },
    }));

    let fullText = '';

    for (;;) {
      const stream = this.client.messages.stream({
        model: params.model,
        system: params.systemPrompt,
        messages: internalMessages,
        tools,
        max_tokens: 8192,
      });

      stream.on('text', (text) => {
        fullText += text;
        params.onChunk(text);
      });

      const response = await stream.finalMessage();

      if (response.stop_reason !== 'tool_use') {
        return fullText;
      }

      internalMessages.push({ role: 'assistant', content: response.content });

      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          try {
            const result = await params.onToolUse(
              block.name,
              block.input as Record<string, unknown>,
            );
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: result,
            });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Error executing tool: ${errorMsg}`,
              is_error: true,
            });
          }
        }
      }

      internalMessages.push({ role: 'user', content: toolResultBlocks });
    }
  }
}
