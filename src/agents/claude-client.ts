import Anthropic from '@anthropic-ai/sdk';
import { log } from '../util/logger.js';
import type { ToolDefinition } from './tools.js';

const TAG = 'ClaudeClient';

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
    log.info(TAG, 'Claude client created');
  }

  async createAgentMessage(params: AgentMessageParams): Promise<string> {
    log.info(TAG, `Creating agent message (model=${params.model}, tools=${params.tools.length})`);

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
    let turnCount = 0;
    const maxTurns = 50;

    for (;;) {
      turnCount++;
      if (turnCount > maxTurns) {
        log.warn(TAG, `Agent exceeded ${maxTurns} turns, forcing stop`);
        break;
      }

      log.debug(TAG, `Turn ${turnCount}: sending request (${internalMessages.length} messages)`);

      let response: Anthropic.Message;
      try {
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

        response = await stream.finalMessage();
        log.debug(TAG, `Turn ${turnCount} complete: stop_reason=${response.stop_reason}, usage=${JSON.stringify(response.usage)}`);
      } catch (err) {
        if (err instanceof Anthropic.APIError) {
          log.error(TAG, `API error: status=${err.status} type=${err.error?.type ?? 'unknown'}`, err);
          if (err.status === 429) {
            log.warn(TAG, 'Rate limited, waiting 10s before retry');
            await new Promise((r) => setTimeout(r, 10_000));
            turnCount--;
            continue;
          }
          if (err.status === 529) {
            log.warn(TAG, 'API overloaded, waiting 30s before retry');
            await new Promise((r) => setTimeout(r, 30_000));
            turnCount--;
            continue;
          }
        }
        log.error(TAG, 'Unrecoverable API error', err);
        throw err;
      }

      if (response.stop_reason !== 'tool_use') {
        log.info(TAG, `Agent finished after ${turnCount} turns (${fullText.length} chars total)`);
        return fullText;
      }

      internalMessages.push({ role: 'assistant', content: response.content });

      const toolResultBlocks: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          log.debug(TAG, `Tool use: ${block.name} (id=${block.id})`);
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
            log.error(TAG, `Tool "${block.name}" execution failed: ${errorMsg}`);
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

    return fullText;
  }
}
