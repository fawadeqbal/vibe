import type { ApiErrorBody, LoginResult } from "./types";

/**
 * Browser-side API client. Every call goes to this app's own `/api/v1/*`
 * route (the BFF), which adds the staff session from httpOnly cookies and
 * forwards to the Vibe API — tokens never reach JavaScript.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isForbidden(): boolean {
    return this.status === 403 && this.code === "FORBIDDEN";
  }
}

export type Query = Record<string, string | number | boolean | string[] | null | undefined>;

/** `{ status: ['OPEN','ACTIONED'], q: '' }` → `status=OPEN,ACTIONED` (empty values dropped). */
export function toQueryString(q?: Query): string {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Where to send people when the session or setup state changes. */
const SETUP_CODES = new Set(["PASSWORD_CHANGE_REQUIRED", "TWO_FACTOR_SETUP_REQUIRED"]);

function redirect(to: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname.startsWith(to)) return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(to === "/login" ? `/login?next=${next}` : to);
}

interface RequestInit2 {
  query?: Query;
  signal?: AbortSignal;
  /** Sign-in screens handle 401 themselves instead of redirecting. */
  noRedirect?: boolean;
}

async function request<T>(method: string, url: string, body?: unknown, init?: RequestInit2): Promise<T> {
  const res = await fetch(`${url}${toQueryString(init?.query)}`, {
    method,
    signal: init?.signal,
    credentials: "same-origin",
    headers: {
      // Custom header = no cross-site form/simple request can reach the BFF.
      "x-vibe-admin": "1",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const e = (data as ApiErrorBody | undefined)?.error;
    const err = new ApiError(res.status, e?.code ?? "INTERNAL", e?.message ?? `Request failed (${res.status})`, e?.details, (data as ApiErrorBody | undefined)?.requestId);
    if (init?.noRedirect) throw err;
    if (res.status === 401) redirect("/login");
    else if (res.status === 403 && SETUP_CODES.has(err.code)) redirect("/setup");
    throw err;
  }
  return data as T;
}

const v1 = (path: string) => `/api/v1/${path.replace(/^\//, "")}`;

/** `api.get<Page<UserSummary>>("admin/users", { q })` */
export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>("GET", v1(path), undefined, { query, signal }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", v1(path), body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", v1(path), body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", v1(path), body ?? {}),
  delete: <T>(path: string, body?: unknown) => request<T>("DELETE", v1(path), body),
};

/** Sign-in calls go to the BFF's auth routes, which set and clear the session cookies. */
export const authApi = {
  login: (email: string, password: string) => request<LoginResult>("POST", "/api/auth/login", { email, password }, { noRedirect: true }),
  loginTwoFactor: (challenge: string, code: string) => request<LoginResult>("POST", "/api/auth/login/2fa", { challenge, code }, { noRedirect: true }),
  logout: () => request<{ ok: true }>("POST", "/api/auth/logout", {}, { noRedirect: true }),
};
