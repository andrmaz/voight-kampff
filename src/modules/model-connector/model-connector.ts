import { OpenRouter } from '@openrouter/sdk';
import { OpenRouterError, RequestTimeoutError } from '@openrouter/sdk/models/errors';

const DEFAULT_TIMEOUT_MS = 25_000;

export interface NormalizedModelResponse {
  text: string;
  providerMeta: Record<string, unknown>;
}

export interface HttpLlmConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  /** Optional OpenRouter attribution ([quickstart](https://openrouter.ai/docs/quickstart)). */
  httpReferer?: string;
  appTitle?: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function mockInvoke(input: { prompt: string; requestId: string }): Promise<NormalizedModelResponse> {
  const hash = [...input.prompt].reduce((a, c) => a + c.charCodeAt(0), 0) % 1000;
  const text = `[mock-model:${input.requestId.slice(0, 8)}] I would pause and describe feeling uneasy about the situation. The details matter to me, and I'd want to understand more before acting (${hash}).`;
  return {
    text,
    providerMeta: { provider: 'mock', requestId: input.requestId },
  };
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function gatewayHostFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return 'unknown-host';
  }
}

/** True when requests should use the OpenRouter-hosted API (SDK + correct attribution headers). */
export function isOpenRouterEndpoint(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname;
    return host === 'openrouter.ai' || host.endsWith('.openrouter.ai');
  } catch {
    return false;
  }
}

/**
 * Normalize assistant `content` from OpenAI-compatible or OpenRouter responses (string or multipart).
 */
export function assistantContentToPlainText(
  content: unknown,
  refusal?: string | null,
  reasoning?: string | null,
): string {
  if (typeof content === 'string') {
    const t = content.trim();
    if (t) return t;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>;
        if (typeof o.text === 'string') parts.push(o.text);
        else if (typeof o.content === 'string') parts.push(o.content);
      }
    }
    const joined = parts.join('').trim();
    if (joined) return joined;
  }
  if (typeof refusal === 'string' && refusal.trim()) return refusal.trim();
  if (typeof reasoning === 'string' && reasoning.trim()) return reasoning.trim();
  return '';
}

function mapUnknownToProviderError(e: unknown, gatewayHost: string): Error {
  if (e instanceof RequestTimeoutError) {
    const err = new Error('Model request timed out') as Error & { code: string };
    err.code = 'MODEL_TIMEOUT';
    return err;
  }
  if (e instanceof OpenRouterError) {
    const err = new Error(`LLM HTTP ${e.statusCode} (${gatewayHost})`) as Error & {
      code: string;
      status: number;
      bodyPreview: string;
    };
    err.code = 'MODEL_PROVIDER_ERROR';
    err.status = e.statusCode;
    err.bodyPreview = e.body.slice(0, 200);
    return err;
  }
  return e instanceof Error ? e : new Error(String(e));
}

/**
 * OpenRouter official TypeScript client: same wire format as the dashboard, with timeouts and typed errors.
 * @see https://openrouter.ai/docs/quickstart
 */
function createOpenRouterSdkInvoke(cfg: HttpLlmConfig) {
  const gatewayHost = gatewayHostFromBaseUrl(cfg.baseUrl);
  const client = new OpenRouter({
    apiKey: cfg.apiKey,
    serverURL: cfg.baseUrl,
    httpReferer: cfg.httpReferer,
    xTitle: cfg.appTitle,
    timeoutMs: cfg.timeoutMs,
  });

  return async function invoke(input: {
    prompt: string;
    requestId: string;
  }): Promise<NormalizedModelResponse> {
    try {
      const completion = await client.chat.send({
        chatGenerationParams: {
          model: cfg.model,
          messages: [{ role: 'user', content: input.prompt }],
          stream: false,
        },
      });

      if (!completion || typeof completion !== 'object' || !('choices' in completion)) {
        throw new Error('Unexpected OpenRouter response shape (expected non-streaming chat completion)');
      }

      const message = completion.choices?.[0]?.message;
      const text = assistantContentToPlainText(
        message?.content,
        message?.refusal,
        message?.reasoning,
      );

      return {
        text,
        providerMeta: {
          provider: 'openrouter-sdk',
          gatewayHost,
          model: cfg.model,
          requestId: input.requestId,
        },
      };
    } catch (e: unknown) {
      throw mapUnknownToProviderError(e, gatewayHost);
    }
  };
}

function createChatCompletionsInvoke(cfg: HttpLlmConfig) {
  const baseUrl = normalizeBaseUrl(cfg.baseUrl);
  const { model, timeoutMs } = cfg;
  const gatewayHost = gatewayHostFromBaseUrl(baseUrl);
  const openRouter = isOpenRouterEndpoint(baseUrl);

  async function invoke(
    input: { prompt: string; requestId: string },
    attempt = 0,
  ): Promise<NormalizedModelResponse> {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      };
      if (cfg.httpReferer) {
        headers['HTTP-Referer'] = cfg.httpReferer;
      }
      if (cfg.appTitle) {
        // SDK uses `X-Title` on the wire; quickstart also documents `X-OpenRouter-Title`.
        headers['X-Title'] = cfg.appTitle;
        if (openRouter) {
          headers['X-OpenRouter-Title'] = cfg.appTitle;
        }
      }

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: input.prompt }],
        }),
        signal: controller.signal,
      });

      if ((res.status === 429 || res.status >= 500) && attempt < 1) {
        const jitter = 200 + Math.floor(Math.random() * 400);
        await sleep(jitter);
        return invoke(input, attempt + 1);
      }

      if (!res.ok) {
        const body = await res.text();
        const err = new Error(`LLM HTTP ${res.status} (${gatewayHost})`) as Error & {
          code: string;
          status: number;
          bodyPreview: string;
        };
        err.code = 'MODEL_PROVIDER_ERROR';
        err.status = res.status;
        err.bodyPreview = body.slice(0, 200);
        throw err;
      }

      const data = (await res.json()) as {
        choices?: Array<{
          message?: { content?: unknown; refusal?: string | null; reasoning?: string | null };
        }>;
      };
      const msg = data.choices?.[0]?.message;
      const text = assistantContentToPlainText(msg?.content, msg?.refusal, msg?.reasoning);

      return {
        text,
        providerMeta: {
          provider: 'http',
          gatewayHost,
          model,
          requestId: input.requestId,
        },
      };
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        const err = new Error('Model request timed out') as Error & { code: string };
        err.code = 'MODEL_TIMEOUT';
        throw err;
      }
      const nodeErr = e as { cause?: { code?: string }; code?: string };
      if (attempt < 1 && (nodeErr.cause?.code === 'ECONNRESET' || nodeErr.code === 'ETIMEDOUT')) {
        const jitter = 200 + Math.floor(Math.random() * 400);
        await sleep(jitter);
        return invoke(input, attempt + 1);
      }
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  return invoke;
}

function requirePair(
  apiKey: string | undefined,
  baseUrl: string | undefined,
  model: string | undefined,
  role: string,
): { baseUrl: string; model: string } {
  const b = baseUrl?.trim();
  const m = model?.trim();
  if (!b) {
    throw new Error(`${role}_LLM_BASE_URL is required when ${role}_LLM_API_KEY is set`);
  }
  if (!m) {
    throw new Error(`${role}_LLM_MODEL is required when ${role}_LLM_API_KEY is set`);
  }
  return { baseUrl: normalizeBaseUrl(b), model: m };
}

/**
 * Subject model: `SUBJECT_LLM_*` if `SUBJECT_LLM_API_KEY` is set, otherwise shared `LLM_*`.
 */
export function resolveSubjectHttpLlmConfig(
  env: Record<string, string | undefined> = process.env,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): HttpLlmConfig | null {
  const subjectKey = env.SUBJECT_LLM_API_KEY?.trim();
  if (subjectKey) {
    const { baseUrl, model } = requirePair(
      subjectKey,
      env.SUBJECT_LLM_BASE_URL,
      env.SUBJECT_LLM_MODEL,
      'SUBJECT',
    );
    return {
      apiKey: subjectKey,
      baseUrl,
      model,
      timeoutMs,
      httpReferer: env.SUBJECT_LLM_HTTP_REFERER?.trim() || undefined,
      appTitle: env.SUBJECT_LLM_APP_TITLE?.trim() || undefined,
    };
  }
  return resolveSharedHttpLlmConfig(env, timeoutMs);
}

/** Legacy shared `LLM_*` (subject when no `SUBJECT_LLM_*`). */
export function resolveSharedHttpLlmConfig(
  env: Record<string, string | undefined> = process.env,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): HttpLlmConfig | null {
  const apiKey = env.LLM_API_KEY?.trim();
  if (!apiKey) return null;
  const baseUrlRaw = env.LLM_BASE_URL?.trim();
  const modelRaw = env.LLM_MODEL?.trim();
  if (!baseUrlRaw) {
    throw new Error('LLM_BASE_URL is required when LLM_API_KEY is set');
  }
  if (!modelRaw) {
    throw new Error('LLM_MODEL is required when LLM_API_KEY is set');
  }
  return {
    apiKey,
    baseUrl: normalizeBaseUrl(baseUrlRaw),
    model: modelRaw,
    timeoutMs,
    httpReferer: env.LLM_HTTP_REFERER?.trim() || undefined,
    appTitle: env.LLM_APP_TITLE?.trim() || undefined,
  };
}

/** Alias for `resolveSubjectHttpLlmConfig` (subject resolution including `LLM_*` fallback). */
export function resolveHttpLlmConfig(
  env: Record<string, string | undefined> = process.env,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): HttpLlmConfig | null {
  return resolveSubjectHttpLlmConfig(env, timeoutMs);
}

export interface ModelConnector {
  id: string;
  invokeModel(input: { prompt: string; requestId: string }): Promise<NormalizedModelResponse>;
}

export type InvokeImpl = (input: { prompt: string; requestId: string }) => Promise<NormalizedModelResponse>;

function wrapInvokeImpl(invokeImpl: InvokeImpl, timeoutMs: number): ModelConnector['invokeModel'] {
  return async (input) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await invokeImpl(input);
    } finally {
      clearTimeout(t);
    }
  };
}

function httpConnector(cfg: HttpLlmConfig, id: string): ModelConnector {
  const invoke = isOpenRouterEndpoint(cfg.baseUrl)
    ? createOpenRouterSdkInvoke(cfg)
    : createChatCompletionsInvoke(cfg);
  return {
    id,
    async invokeModel(input) {
      return invoke(input);
    },
  };
}

function mockConnector(id: string, timeoutMs: number): ModelConnector {
  return {
    id,
    async invokeModel(input) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await mockInvoke(input);
      } finally {
        clearTimeout(t);
      }
    },
  };
}

export interface ModelConnectorOptions {
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  invokeImpl?: InvokeImpl;
}

/** Subject connector: HTTP when keys are set, otherwise mock. */
export function createModelConnector(opts: ModelConnectorOptions = {}): ModelConnector {
  const env = opts.env ?? process.env;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (opts.invokeImpl) {
    return {
      id: 'injected-subject',
      invokeModel: wrapInvokeImpl(opts.invokeImpl, timeoutMs),
    };
  }
  const subjectCfg = resolveSubjectHttpLlmConfig(env, timeoutMs);
  return subjectCfg
    ? httpConnector(subjectCfg, 'http-subject')
    : mockConnector('mock-subject', timeoutMs);
}
