import Anthropic from '@anthropic-ai/sdk';
import { log } from '../util/logger.js';
import type { ToolDefinition } from './tools.js';

const TAG = 'ClaudeClient';
const FIRST_RESPONSE_TIMEOUT_MS = 60_000;
const MAX_CONTEXT_CHARS = 80_000;
const PRESERVE_RECENT_MESSAGES = 4;

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
    this.client = new Anthropic({ apiKey, timeout: 15 * 60 * 1000 });
    log.info(TAG, 'Claude client created');
  }

  private compressHistory(
    messages: Anthropic.MessageParam[],
    onChunk: (chunk: string) => void,
  ): void {
    const estimatedSize = JSON.stringify(messages).length;
    if (estimatedSize <= MAX_CONTEXT_CHARS) return;

    log.warn(TAG, `Context size ${estimatedSize} exceeds ${MAX_CONTEXT_CHARS}, compressing history`);
    onChunk(`\n[status] Compressing conversation history (${Math.round(estimatedSize / 1000)}k chars > ${MAX_CONTEXT_CHARS / 1000}k limit)\n`);

    const protectedTail = messages.length >= PRESERVE_RECENT_MESSAGES
      ? messages.length - PRESERVE_RECENT_MESSAGES
      : messages.length;

    for (let i = 1; i < protectedTail; i++) {
      const msg = messages[i];
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        const blocks = msg.content as Anthropic.ToolResultBlockParam[];
        for (let b = 0; b < blocks.length; b++) {
          const block = blocks[b];
          if (block.type === 'tool_result' && typeof block.content === 'string' && block.content.length > 200) {
            const originalLen = block.content.length;
            blocks[b] = {
              ...block,
              content: `[previous tool result: ${originalLen} chars — compressed to save context]`,
            };
          }
        }
      } else if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const blocks = msg.content as Anthropic.ContentBlock[];
        for (let b = 0; b < blocks.length; b++) {
          const block = blocks[b];
          if (block.type === 'text' && block.text.length > 300) {
            (blocks[b] as Anthropic.TextBlock) = {
              ...block,
              text: block.text.slice(0, 200) + '...[compressed]',
            };
          }
        }
      }
    }

    const newSize = JSON.stringify(messages).length;
    log.info(TAG, `Compressed context: ${estimatedSize} -> ${newSize} chars`);
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
    let retryCount = 0;
    const maxTurns = 50;
    const maxRetries = 5;

    for (;;) {
      turnCount++;
      if (turnCount > maxTurns) {
        log.warn(TAG, `Agent exceeded ${maxTurns} turns, forcing stop`);
        break;
      }

      this.compressHistory(internalMessages, params.onChunk);

      log.debug(TAG, `Turn ${turnCount}: sending request (${internalMessages.length} messages)`);

      let response: Anthropic.Message;
      let firstResponseTimer: ReturnType<typeof setTimeout> | null = null;
      let gotFirstEvent = false;
      const cancelDeadline = () => {
        gotFirstEvent = true;
        if (firstResponseTimer) {
          clearTimeout(firstResponseTimer);
          firstResponseTimer = null;
        }
      };

      try {
        const stream = this.client.messages.stream({
          model: params.model,
          system: params.systemPrompt,
          messages: internalMessages,
          tools,
          max_tokens: 8192,
        });

        const responseDeadline = new Promise<never>((_, reject) => {
          firstResponseTimer = setTimeout(() => {
            if (!gotFirstEvent) {
              const hint = turnCount === 1
                ? `Check model name "${params.model}" and API key validity.`
                : `The API may be slow or the request is too large.`;
              reject(new Error(
                `No response from Claude API within ${FIRST_RESPONSE_TIMEOUT_MS / 1000}s (turn ${turnCount}). ${hint}`,
              ));
              stream.abort();
            }
          }, FIRST_RESPONSE_TIMEOUT_MS);
        });

        stream.on('text', (text) => {
          cancelDeadline();
          fullText += text;
          params.onChunk(text);
        });

        stream.on('inputJson', () => cancelDeadline());
        stream.on('message', () => cancelDeadline());
        stream.on('contentBlock', (block) => {
          cancelDeadline();
          if (block.type === 'tool_use') {
            params.onChunk(`[calling tool: ${block.name}]\n`);
          }
        });

        const finalMessagePromise = stream.finalMessage();
        finalMessagePromise.catch(() => {});
        responseDeadline.catch(() => {});

        response = await Promise.race([finalMessagePromise, responseDeadline]);
        cancelDeadline();

        log.debug(TAG, `Turn ${turnCount} complete: stop_reason=${response.stop_reason}, usage=${JSON.stringify(response.usage)}`);
      } catch (err) {
        cancelDeadline();
        if (err instanceof Anthropic.APIError) {
          log.error(TAG, `API error: status=${err.status} type=${err.error?.type ?? 'unknown'}`, err);
          if (err.status === 429 || err.status === 529) {
            retryCount++;
            if (retryCount > maxRetries) {
              log.error(TAG, `Exceeded ${maxRetries} retries for ${err.status} errors, giving up`);
              throw err;
            }
            const waitMs = err.status === 429 ? 10_000 : 30_000;
            log.warn(TAG, `${err.status === 429 ? 'Rate limited' : 'API overloaded'}, waiting ${waitMs / 1000}s (retry ${retryCount}/${maxRetries})`);
            await new Promise((r) => setTimeout(r, waitMs));
            turnCount--;
            continue;
          }
        }
        log.error(TAG, 'Unrecoverable API error', err);
        throw err;
      }

      if (response.stop_reason === 'max_tokens') {
        log.warn(TAG, `Agent hit max_tokens limit on turn ${turnCount} — output may be truncated`);
        params.onChunk(`\n[warning] Output truncated (hit max_tokens limit). Response may be incomplete.\n`);
      }

      if (response.stop_reason !== 'tool_use') {
        log.info(TAG, `Agent finished after ${turnCount} turns (${fullText.length} chars total, stop_reason=${response.stop_reason})`);
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
