import Anthropic from '@anthropic-ai/sdk';
import { log } from '../../util/logger.js';
import type { StreamChatParams, ChatMessage } from '../types.js';

const TAG = 'LLM:Anthropic';

export async function streamAnthropicChat(
  apiKey: string,
  params: StreamChatParams,
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const messages: Anthropic.MessageParam[] = params.messages
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
  const maxTurns = 50;

  for (;;) {
    turnCount++;
    if (turnCount > maxTurns) {
      log.warn(TAG, `Exceeded ${maxTurns} turns, forcing stop`);
      break;
    }

    log.debug(TAG, `Turn ${turnCount} (${messages.length} messages)`);

    let response: Anthropic.Message;
    try {
      const streamOpts: Anthropic.MessageStreamParams = {
        model: params.model,
        system: params.systemPrompt,
        messages,
        max_tokens: params.maxTokens ?? 8192,
      };
      if (tools.length > 0) {
        streamOpts.tools = tools;
      }

      const stream = client.messages.stream(streamOpts);
      stream.on('text', (text) => {
        fullText += text;
        params.onChunk(text);
      });
      response = await stream.finalMessage();
      log.debug(TAG, `Turn ${turnCount}: stop_reason=${response.stop_reason}`);
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        if (err.status === 429) {
          log.warn(TAG, 'Rate limited, waiting 10s');
          await new Promise((r) => setTimeout(r, 10_000));
          turnCount--;
          continue;
        }
        if (err.status === 529) {
          log.warn(TAG, 'Overloaded, waiting 30s');
          await new Promise((r) => setTimeout(r, 30_000));
          turnCount--;
          continue;
        }
      }
      throw err;
    }

    if (response.stop_reason !== 'tool_use') {
      return fullText;
    }

    if (!params.onToolUse) return fullText;

    messages.push({ role: 'assistant', content: response.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === 'tool_use') {
        try {
          const result = await params.onToolUse(block.name, block.input as Record<string, unknown>);
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Error: ${err instanceof Error ? err.message : String(err)}`,
            is_error: true,
          });
        }
      }
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return fullText;
}

export async function simpleChatAnthropic(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: ChatMessage[],
): Promise<string> {
  return streamAnthropicChat(apiKey, {
    model,
    systemPrompt,
    messages,
    onChunk: () => {},
  });
}
