import Anthropic from '@anthropic-ai/sdk';
import { log } from '../../util/logger.js';
import type { LLMResponse } from '../types.js';
import type { ToolDefinition } from '../../agents/tools.js';
import type { ChatMessage } from '../types.js';

const TAG = 'AnthropicProvider';

export interface AnthropicStreamParams {
  model: string;
  messages: ChatMessage[];
  systemPrompt?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
  onChunk?: (text: string) => void;
  onToolUse?: (toolName: string, input: Record<string, unknown>) => Promise<string>;
}

export class AnthropicProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, timeout: 15 * 60 * 1000 });
  }

  async streamChat(params: AnthropicStreamParams): Promise<LLMResponse> {
    const maxTokens = params.maxTokens ?? 8192;
    const maxTurns = 50;

    const internalMessages: Anthropic.MessageParam[] = params.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    const tools: Anthropic.Tool[] = (params.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: t.input_schema.properties,
        required: t.input_schema.required,
      },
    }));

    let fullText = '';
    let turnCount = 0;

    for (;;) {
      turnCount++;
      if (turnCount > maxTurns) {
        log.warn(TAG, `Exceeded ${maxTurns} turns, forcing stop`);
        break;
      }

      let response: Anthropic.Message;
      try {
        const requestParams: Anthropic.MessageCreateParams = {
          model: params.model,
          messages: internalMessages,
          max_tokens: maxTokens,
          ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
          ...(tools.length > 0 ? { tools } : {}),
        };

        const stream = this.client.messages.stream(requestParams as Parameters<typeof this.client.messages.stream>[0]);

        stream.on('text', (text) => {
          fullText += text;
          params.onChunk?.(text);
        });

        response = await stream.finalMessage();
      } catch (err) {
        if (err instanceof Anthropic.APIError) {
          if (err.status === 429) {
            log.warn(TAG, 'Rate limited, waiting 10s');
            await new Promise((r) => setTimeout(r, 10_000));
            turnCount--;
            continue;
          }
          if (err.status === 529) {
            log.warn(TAG, 'API overloaded, waiting 30s');
            await new Promise((r) => setTimeout(r, 30_000));
            turnCount--;
            continue;
          }
        }
        throw err;
      }

      if (response.stop_reason !== 'tool_use') {
        return {
          text: fullText,
          stopReason: response.stop_reason === 'max_tokens' ? 'max_tokens' : 'end_turn',
        };
      }

      if (!params.onToolUse) {
        return {
          text: fullText,
          toolCalls: response.content
            .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
            .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> })),
          stopReason: 'tool_use',
        };
      }

      internalMessages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          try {
            const result = await params.onToolUse(block.name, block.input as Record<string, unknown>);
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${msg}`, is_error: true });
          }
        }
      }
      internalMessages.push({ role: 'user', content: toolResults });
    }

    return { text: fullText, stopReason: 'end_turn' };
  }
}
