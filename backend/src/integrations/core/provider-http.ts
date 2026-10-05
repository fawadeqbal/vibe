import { Logger } from '@nestjs/common';

/**
 * Why a provider call failed, in the terms callers need to decide what to do:
 * - `declined`: the provider answered and said no (don't retry the same thing)
 * - `unavailable`: network/5xx/timeout before we know anything (safe to retry reads)
 * - `unknown`: the request may have been processed (e.g. timeout on a payout):
 *   never assume failure; check status later.
 */
export type ProviderErrorKind = 'declined' | 'unavailable' | 'unknown' | 'misconfigured';

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly kind: ProviderErrorKind,
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(`${provider}: ${message}`);
    this.name = 'ProviderError';
  }
}

export interface HttpRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  /** Objects are sent as JSON; URLSearchParams as a form; strings/Buffers as-is. */
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
  /** Retries for network errors / 5xx. Only set for idempotent calls. */
  retries?: number;
  /** Accept non-2xx and return it (for APIs that put errors in the body). */
  acceptAnyStatus?: boolean;
}

export interface HttpResponse<T> {
  status: number;
  headers: Headers;
  body: T;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Small fetch wrapper every provider client uses: timeouts, retries with
 * backoff for idempotent calls, JSON in/out, and errors classified as
 * [ProviderError]. Tests swap `fetchImpl` to fake the provider.
 */
export class ProviderHttp {
  private readonly logger: Logger;

  constructor(
    readonly provider: string,
    private readonly baseUrl = '',
    private readonly fetchImpl: FetchLike = (i, init) => fetch(i, init),
  ) {
    this.logger = new Logger(`http:${provider}`);
  }

  async request<T = unknown>(path: string, req: HttpRequest = {}): Promise<HttpResponse<T>> {
    const url = new URL(path.startsWith('http') ? path : `${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { Accept: 'application/json', ...(req.headers ?? {}) };
    let body: RequestInit['body'];
    if (req.body instanceof URLSearchParams) {
      body = req.body.toString();
      headers['Content-Type'] ??= 'application/x-www-form-urlencoded';
    } else if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      body = req.body as RequestInit['body'];
    } else if (req.body !== undefined) {
      body = JSON.stringify(req.body);
      headers['Content-Type'] ??= 'application/json';
    }
    const attempts = 1 + (req.retries ?? 0);
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const res = await this.fetchImpl(url.toString(), { method: req.method ?? (body ? 'POST' : 'GET'), headers, body, signal: AbortSignal.timeout(req.timeoutMs ?? 20_000) });
        const text = await res.text();
        let parsed: unknown = text;
        if (text && (res.headers.get('content-type') ?? '').includes('json')) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
        } else if (text && /^[[{]/.test(text.trim())) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
        }
        if (res.status >= 500 && attempt < attempts) {
          lastError = new ProviderError(this.provider, 'unavailable', `HTTP ${res.status}`, res.status, parsed);
          await sleep(backoff(attempt));
          continue;
        }
        if (!res.ok && !req.acceptAnyStatus) {
          const kind = res.status >= 500 ? 'unavailable' : res.status === 401 || res.status === 403 ? 'misconfigured' : 'declined';
          throw new ProviderError(this.provider, kind, `HTTP ${res.status} on ${url.pathname}`, res.status, parsed);
        }
        return { status: res.status, headers: res.headers, body: parsed as T };
      } catch (e) {
        if (e instanceof ProviderError) throw e;
        lastError = e;
        const timedOut = (e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError';
        if (attempt < attempts) {
          this.logger.warn(`${url.pathname} attempt ${attempt} failed: ${(e as Error).message}`);
          await sleep(backoff(attempt));
          continue;
        }
        // A timeout on a non-retried (non-idempotent) call: the provider may have acted.
        throw new ProviderError(this.provider, timedOut && attempts === 1 && body ? 'unknown' : 'unavailable', (e as Error).message);
      }
    }
    throw lastError instanceof Error ? lastError : new ProviderError(this.provider, 'unavailable', 'request failed');
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const backoff = (attempt: number) => Math.min(4000, 300 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 100);
