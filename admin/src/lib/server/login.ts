import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { API_URL, clientHeaders, isSameOrigin, jsonError, setSessionCookies, type Tokens } from "./session";

/**
 * Shared by both sign-in steps: forwards to the API and, on success, moves
 * the tokens into cookies so the browser never sees them.
 */
export async function forwardLogin(req: NextRequest, apiPath: string): Promise<Response> {
  if (!isSameOrigin(req)) return jsonError(403, "FORBIDDEN", "Cross-site request blocked");
  const body = await req.text();
  const res = await fetch(`${API_URL}/v1/admin/auth/${apiPath}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...clientHeaders(req) },
    body,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as { status?: string; tokens?: Tokens; me?: unknown; challenge?: string };
  if (!res.ok) return NextResponse.json(data, { status: res.status });
  if (data.status === "ok" && data.tokens) {
    const out = NextResponse.json({ status: "ok", me: data.me });
    setSessionCookies(out, data.tokens);
    return out;
  }
  return NextResponse.json({ status: data.status, challenge: data.challenge });
}
