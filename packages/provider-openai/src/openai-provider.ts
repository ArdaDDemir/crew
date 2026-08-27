import type { ChatRequest, Provider, ChatEvent } from "@crew/core";
import { parseSseChunk, splitSse } from "./sse";
import { formatProviderError } from "./format-error";

export type OpenAICompatOptions = {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
};

export class OpenAICompatProvider implements Provider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly retries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;

  constructor(opts: OpenAICompatOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.fetchFn = opts.fetch ?? fetch;
    this.retries = opts.retries ?? 2;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.timeoutMs = opts.timeoutMs ?? 45_000;
  }

  async *complete(req: ChatRequest): AsyncIterable<ChatEvent> {
    const tools = req.tools?.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/local/crew",
      "X-Title": "crew",
    };
    const body = JSON.stringify({
      model: req.model,
      messages: req.messages,
      tools: tools?.length ? tools : undefined,
      stream: true,
      reasoning: { enabled: true },
    });

    let response: Response | undefined;
    let lastStatus = 0;
    let lastBody = "";
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body,
          signal: ctrl.signal,
        });
      } catch (err) {
        clearTimeout(timer);
        const aborted =
          (err instanceof Error && err.name === "AbortError") ||
          (typeof err === "object" && err !== null && "name" in err && err.name === "AbortError");
        if (aborted) {
          yield {
            type: "error",
            message: `provider timeout after ${this.timeoutMs}ms — no HTTP response (OpenRouter activity will be empty)`,
          };
          yield { type: "done" };
          return;
        }
        yield {
          type: "error",
          message: `provider network: ${err instanceof Error ? err.message : String(err)}`,
        };
        yield { type: "done" };
        return;
      }
      clearTimeout(timer);
      if (response.ok) break;
      lastStatus = response.status;
      lastBody = await response.text();
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === this.retries) {
        yield {
          type: "error",
          message: formatProviderError(response.status, lastBody),
        };
        yield { type: "done" };
        return;
      }
      await this.sleep(1500 * (attempt + 1));
    }
    if (!response?.ok) {
      yield { type: "error", message: formatProviderError(lastStatus, lastBody) };
      yield { type: "done" };
      return;
    }
    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: "error", message: "provider returned no body" };
      yield { type: "done" };
      return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    const toolAcc = new Map<number, { id: string; name: string; arguments: string }>();
    let done = false;
    while (!done) {
      const next = await reader.read();
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      const split = splitSse(buffer);
      buffer = split.rest;
      for (const frame of split.frames) {
        for (const event of parseSseChunk(frame, toolAcc)) {
          yield event;
          if (event.type === "done") done = true;
        }
      }
    }
    if (!done) yield { type: "done" };
  }
}
