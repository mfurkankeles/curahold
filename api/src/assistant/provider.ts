// Where the assistant's language model comes from.
//
// One small interface, so the provider can be changed by configuration:
// Anthropic's Claude is the default. The call is the Messages API over plain
// fetch — the same request the official SDK sends — because the project adds
// no runtime dependencies and the API also runs on Cloudflare Workers. The
// key and the model come from the server's environment and never reach a
// browser.
//
// Prompt caching: the tool list and the standing rules (the system blocks)
// are the same for every company and every question, and are marked to be
// cached, so after the first question they cost a tenth of the price.

export type LlmBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | LlmBlock[];
}
export interface LlmTool {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties?: Record<string, unknown>; required?: string[] };
}
export interface LlmRequest {
  /** Stable first (cached), the request's own last. */
  system: { text: string; cache?: boolean }[];
  messages: LlmMessage[];
  tools: LlmTool[];
  maxTokens: number;
  /** 'any': the model must call a tool (the assistant always finishes with `respond`). */
  toolChoice?: 'any' | 'auto';
  signal?: AbortSignal;
}
export interface LlmUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
export interface LlmResponse {
  content: LlmBlock[];
  stop: string;
  usage: LlmUsage;
}
export interface LlmProvider {
  id: string;
  model: string;
  complete(req: LlmRequest): Promise<LlmResponse>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    /** 'rate' (the provider's own limit), 'overloaded', 'auth', 'bad_request', 'network'. */
    public code: string,
  ) {
    super(message);
  }
}

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/** Claude through the Messages API. */
export function anthropicProvider(opts: { apiKey: string; model: string; fetch?: typeof fetch; url?: string; timeoutMs?: number }): LlmProvider {
  const doFetch = opts.fetch ?? fetch;
  return {
    id: 'anthropic',
    model: opts.model,
    async complete(req) {
      const system = req.system.map((b, i) => ({
        type: 'text' as const,
        text: b.text,
        // One breakpoint at the end of the stable part caches tools + rules together.
        ...(b.cache && !req.system.slice(i + 1).some((x) => x.cache) ? { cache_control: { type: 'ephemeral' as const } } : {}),
      }));
      const body = {
        model: opts.model,
        max_tokens: req.maxTokens,
        system,
        messages: req.messages,
        ...(req.tools.length ? { tools: req.tools } : {}),
        ...(req.toolChoice && req.tools.length ? { tool_choice: { type: req.toolChoice } } : {}),
      };
      const timeout = AbortSignal.timeout(opts.timeoutMs ?? 30_000);
      const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
      let res: Response;
      try {
        res = await doFetch(opts.url ?? ANTHROPIC_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify(body),
          signal,
        });
      } catch (e) {
        throw new ProviderError((e as Error).message, 'network');
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
        content?: LlmBlock[];
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
      };
      if (!res.ok) {
        const code = res.status === 429 ? 'rate' : res.status === 529 || res.status >= 500 ? 'overloaded' : res.status === 401 || res.status === 403 ? 'auth' : 'bad_request';
        // The provider's message, never the request (which holds the question and the data).
        throw new ProviderError(String(data?.error?.message ?? res.status).slice(0, 300), code);
      }
      const u = data.usage ?? {};
      return {
        content: (data.content ?? []) as LlmBlock[],
        stop: String(data.stop_reason ?? ''),
        usage: { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 },
      };
    },
  };
}

/**
 * A provider that answers from a script, for tests and for the evaluation's
 * runs without a key. `script` sees each request and returns the response.
 */
export function mockProvider(script: (req: LlmRequest, call: number) => LlmResponse | Promise<LlmResponse>, model = 'mock'): LlmProvider & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    id: 'mock',
    model,
    calls,
    async complete(req) {
      calls.push(req);
      return script(req, calls.length);
    },
  };
}

/** A mock response that calls the final `respond` tool. */
export function respondWith(input: Record<string, unknown>, usage: Partial<LlmUsage> = {}): LlmResponse {
  return {
    content: [{ type: 'tool_use', id: `toolu_${Math.random().toString(36).slice(2, 10)}`, name: 'respond', input }],
    stop: 'tool_use',
    usage: { input: 800, output: 150, cacheRead: 1800, cacheWrite: 0, ...usage },
  };
}
