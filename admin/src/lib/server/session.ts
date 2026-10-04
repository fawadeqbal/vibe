import "server-only";

import type { NextRequest, NextResponse } from "next/server";

/**
 * The BFF side of staff sessions. The browser only ever holds two httpOnly,
 * SameSite=Strict cookies; this server swaps them for API calls and keeps
 * them fresh. Nothing here is reachable from client JavaScript.
 */

export const ACCESS_COOKIE = "vibe_admin_at";
export const REFRESH_COOKIE = "vibe_admin_rt";

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

/** Where the Vibe API lives, as seen from this server. */
export const API_URL = (process.env.VIBE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");

const secure = process.env.NODE_ENV === "production" && process.env.ADMIN_INSECURE_COOKIES !== "true";

export function setSessionCookies(res: NextResponse, t: Tokens): void {
  const now = Date.now();
  res.cookies.set(ACCESS_COOKIE, t.accessToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/api",
    maxAge: Math.max(1, Math.floor((new Date(t.accessExpiresAt).getTime() - now) / 1000) - 15),
  });
  res.cookies.set(REFRESH_COOKIE, t.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: Math.max(1, Math.floor((new Date(t.refreshExpiresAt).getTime() - now) / 1000)),
  });
}

export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, "", { path: "/api", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
}

/** Headers that tell the API who the real client is (audit log, rate limits). */
export function clientHeaders(req: NextRequest): Record<string, string> {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip") || "";
  const h: Record<string, string> = {};
  if (ip) h["x-forwarded-for"] = ip;
  const ua = req.headers.get("user-agent");
  if (ua) h["x-forwarded-user-agent"] = ua.slice(0, 300);
  const rid = req.headers.get("x-request-id");
  if (rid) h["x-request-id"] = rid;
  return h;
}

/**
 * Blocks cross-site requests to the BFF: state-changing calls must come from
 * this origin and carry the custom header the app's client sends.
 */
export function isSameOrigin(req: NextRequest): boolean {
  if (req.headers.get("x-vibe-admin") !== "1") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true; // same-origin GETs may omit it; the custom header already proves it's our JS
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function refreshTokens(refreshToken: string, req: NextRequest): Promise<Tokens | null> {
  const res = await fetch(`${API_URL}/v1/admin/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json", ...clientHeaders(req) },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as Tokens;
}

export function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}
