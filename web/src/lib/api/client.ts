import { config } from "../config";
import { ApiError } from "./errors";
import { tokenStore, type Tokens } from "./tokens";

type Query = Record<string, string | number | undefined>;

/** A fresh key for `Idempotency-Key` (one per user action, reused on retry). */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * JSON over HTTP with the session handled for you: adds the bearer token,
 * refreshes it once on expiry (one refresh shared by concurrent calls) and
 * turns every failure into an {@link ApiError}. Mirror of the Flutter `ApiClient`.
 */
export class ApiClient {
  private access: string | null = null;
  private refresh: string | null = null;
  private refreshing: Promise<boolean> | null = null;

  /** Called when the session can't be refreshed any more (signed out elsewhere). */
  onSessionExpired?: () => void;

  constructor(private readonly base = config.restBase) {}

  get accessToken() {
    return this.access;
  }
  get hasSession() {
    return this.refresh != null;
  }

  restore() {
    const t = tokenStore.read();
    this.access = t?.access ?? null;
    this.refresh = t?.refresh ?? null;
  }

  setTokens(pair: { accessToken: string; refreshToken: string }) {
    this.access = pair.accessToken;
    this.refresh = pair.refreshToken;
    tokenStore.write({ access: this.access, refresh: this.refresh } satisfies Tokens);
  }

  clearSession() {
    this.access = null;
    this.refresh = null;
    tokenStore.clear();
  }

  get<T = unknown>(path: string, query?: Query) {
    return this.send<T>("GET", path, { query });
  }
  post<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.send<T>("POST", path, { body, headers });
  }
  patch<T = unknown>(path: string, body?: unknown) {
    return this.send<T>("PATCH", path, { body });
  }
  delete<T = unknown>(path: string) {
    return this.send<T>("DELETE", path);
  }

  /** `multipart/form-data` upload of one file (avatar, selfie). */
  upload<T = unknown>(path: string, field: string, file: Blob, filename: string, fields: Record<string, string> = {}) {
    return this.dispatch<T>(
      path,
      () => {
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) form.append(k, v);
        form.append(field, file, filename);
        return { method: "POST", body: form };
      },
      60_000,
    );
  }

  private send<T>(method: string, path: string, opts: { body?: unknown; query?: Query; headers?: Record<string, string> } = {}) {
    let url = path;
    if (opts.query) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.query)) if (v !== undefined) q.set(k, String(v));
      const s = q.toString();
      if (s) url += `?${s}`;
    }
    return this.dispatch<T>(url, () => ({
      method,
      headers: { ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}), ...opts.headers },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }));
  }

  /** Sends a freshly built request, refreshing the session once on 401. */
  private async dispatch<T>(path: string, build: () => RequestInit, timeoutMs = 20_000, retried = false): Promise<T> {
    const init = build();
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (this.access) headers.set("Authorization", `Bearer ${this.access}`);
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      throw ApiError.network(e);
    }
    const text = await res.text();
    const body = text ? tryJson(text) : null;
    if (res.ok) return body as T;
    if (res.status === 401 && !retried && this.refresh && !path.startsWith("/auth/")) {
      if (await this.refreshSession()) return this.dispatch<T>(path, build, timeoutMs, true);
    }
    throw ApiError.fromBody(res.status, body);
  }

  /** Rotates the refresh token. Concurrent callers share one request. */
  refreshSession(): Promise<boolean> {
    this.refreshing ??= (async () => {
      try {
        const r = this.refresh;
        if (!r) return false;
        const res = await fetch(`${this.base}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ refreshToken: r }),
        });
        if (res.status !== 200) {
          this.clearSession();
          this.onSessionExpired?.();
          return false;
        }
        const body = (await res.json()) as { tokens: { accessToken: string; refreshToken: string } };
        this.setTokens(body.tokens);
        return true;
      } catch {
        return false; // offline: keep the session, try again later
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
