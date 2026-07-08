import type Anthropic from '@anthropic-ai/sdk';

/**
 * OpenAI-compatible adapter for the direct agent loop.
 *
 * The agent (backend/anthropic/agent.ts) consumes exactly two things from a
 * model stream: async-iterated `content_block_delta`/`text_delta` chunks, and
 * `finalMessage().content` (text + tool_use blocks). This client translates
 * an Anthropic Messages request into a `chat/completions` stream and
 * synthesizes that minimal surface — which makes the same agent run against
 * OpenAI, Google (AI Studio / Vertex OpenAI-compat endpoints), Groq,
 * OpenRouter, xAI, DeepSeek, Mistral, and any custom gateway.
 */

type MessageCreateParams = Anthropic.Messages.MessageCreateParams;
type ContentBlock = Anthropic.Messages.ContentBlock;

/**
 * Loose chunk shape: a structural supertype of the Anthropic SDK's raw stream
 * events, so both the real SDK and this adapter satisfy AgentModelClient.
 */
export interface MinimalStreamChunk {
  type: string;
  /** Loosely typed — consumers narrow with a cast (see agent.ts). */
  delta?: unknown;
}

export interface MinimalFinalMessage {
  content: ContentBlock[];
  stop_reason: string | null;
}

export interface MinimalMessageStream extends AsyncIterable<MinimalStreamChunk> {
  finalMessage(): Promise<MinimalFinalMessage>;
}

/** The only client surface the agent uses. */
export interface AgentModelClient {
  messages: {
    stream(params: MessageCreateParams, options?: { signal?: AbortSignal }): MinimalMessageStream;
  };
}

interface OpenAIToolCall {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAIDelta {
  content?: string | null;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIChunk {
  choices?: { delta?: OpenAIDelta; finish_reason?: string | null }[];
}

const textOf = (content: string | unknown[]): string => {
  if (typeof content === 'string') return content;
  return content
    .map((block) => {
      const b = block as { type?: string; text?: string };
      return b.type === 'text' ? (b.text ?? '') : '';
    })
    .join('');
};

/** Anthropic messages+system+tools → OpenAI chat/completions payload. */
function translateRequest(params: MessageCreateParams): Record<string, unknown> {
  const messages: Record<string, unknown>[] = [];
  if (params.system) {
    messages.push({ role: 'system', content: textOf(params.system as never) });
  }

  for (const msg of params.messages) {
    if (typeof msg.content === 'string') {
      messages.push({ role: msg.role, content: msg.content });
      continue;
    }
    if (msg.role === 'assistant') {
      const text = msg.content
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('');
      const toolCalls = msg.content
        .filter((b) => b.type === 'tool_use')
        .map((b) => {
          const t = b as { id: string; name: string; input: unknown };
          return {
            id: t.id,
            type: 'function',
            function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
          };
        });
      messages.push({
        role: 'assistant',
        content: text || null,
        ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      });
      continue;
    }
    // user turn: split tool_results into role:'tool' messages, keep text
    const toolResults = msg.content.filter((b) => b.type === 'tool_result');
    for (const block of toolResults) {
      const t = block as { tool_use_id: string; content?: unknown };
      messages.push({
        role: 'tool',
        tool_call_id: t.tool_use_id,
        content: typeof t.content === 'string' ? t.content : textOf((t.content as never) ?? []),
      });
    }
    const text = msg.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('');
    if (text) messages.push({ role: 'user', content: text });
  }

  const tools = (params.tools ?? [])
    .filter((t): t is Anthropic.Messages.Tool => 'input_schema' in t)
    .map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description ?? '', parameters: t.input_schema },
    }));

  return {
    model: params.model,
    messages,
    stream: true,
    max_tokens: params.max_tokens,
    ...(tools.length > 0 ? { tools } : {}),
  };
}

/** Parse an SSE stream of chat/completions chunks. */
async function* sseChunks(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<OpenAIChunk, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      if (signal?.aborted)
        throw Object.assign(new Error('Request cancelled'), { name: 'AbortError' });
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf('\n');
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') return;
        try {
          yield JSON.parse(data) as OpenAIChunk;
        } catch {
          // partial/keepalive line — skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function createOpenAICompatClient(config: {
  baseUrl: string;
  apiKey: string;
  headers?: Record<string, string>;
}): AgentModelClient {
  return {
    messages: {
      stream(params, options): MinimalMessageStream {
        const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
        const payload = translateRequest(params);

        const textParts: string[] = [];
        // Chunks the agent actually renders (text deltas only).
        const toolCalls = new Map<number, { id: string; name: string; args: string }>();
        let finishReason: string | null = null;

        // One fetch shared by the iterator and finalMessage(); the iterator
        // drains the stream, finalMessage() awaits its completion.
        let drained: Promise<void> | undefined;
        const queue: MinimalStreamChunk[] = [];
        let notify: (() => void) | undefined;
        let streamDone = false;
        let streamError: unknown;

        const pump = async (): Promise<void> => {
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${config.apiKey}`,
              ...config.headers,
            },
            body: JSON.stringify(payload),
            signal: options?.signal,
          });
          if (!response.ok || !response.body) {
            const body = await response.text();
            throw new Error(`Model request failed (${response.status}): ${body.slice(0, 300)}`);
          }
          for await (const chunk of sseChunks(response.body, options?.signal)) {
            const choice = chunk.choices?.[0];
            if (!choice) continue;
            if (choice.finish_reason) finishReason = choice.finish_reason;
            const { delta } = choice;
            if (!delta) continue;
            if (delta.content) {
              textParts.push(delta.content);
              queue.push({
                type: 'content_block_delta',
                delta: { type: 'text_delta', text: delta.content },
              });
              notify?.();
            }
            for (const tc of delta.tool_calls ?? []) {
              const index = tc.index ?? 0;
              const existing = toolCalls.get(index) ?? { id: '', name: '', args: '' };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name += tc.function.name;
              if (tc.function?.arguments) existing.args += tc.function.arguments;
              toolCalls.set(index, existing);
            }
          }
        };

        const ensureDrained = (): Promise<void> => {
          if (!drained) {
            drained = pump()
              .catch((err: unknown) => {
                streamError = err;
              })
              .finally(() => {
                streamDone = true;
                notify?.();
              });
          }
          return drained;
        };

        const iterator = async function* (): AsyncGenerator<MinimalStreamChunk, void, void> {
          void ensureDrained();
          for (;;) {
            while (queue.length > 0) yield queue.shift()!;
            if (streamDone) {
              if (streamError) throw streamError;
              return;
            }
            await new Promise<void>((resolve) => {
              notify = resolve;
            });
            notify = undefined;
          }
        };

        return {
          [Symbol.asyncIterator]: iterator,
          async finalMessage(): Promise<MinimalFinalMessage> {
            await ensureDrained();
            if (streamError) throw streamError;
            const content: ContentBlock[] = [];
            const text = textParts.join('');
            if (text) content.push({ type: 'text', text, citations: null } as ContentBlock);
            for (const [index, tc] of [...toolCalls.entries()].sort((a, b) => a[0] - b[0])) {
              let input: unknown = {};
              try {
                input = tc.args ? JSON.parse(tc.args) : {};
              } catch {
                input = { _raw: tc.args };
              }
              content.push({
                type: 'tool_use',
                id: tc.id || `call_${index}`,
                name: tc.name,
                input,
              } as ContentBlock);
            }
            return {
              content,
              stop_reason: finishReason === 'tool_calls' ? 'tool_use' : 'end_turn',
            };
          },
        };
      },
    },
  };
}
