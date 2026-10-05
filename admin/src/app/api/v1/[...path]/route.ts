import { NextResponse, type NextRequest } from "next/server";

import { ACCESS_COOKIE, API_URL, clearSessionCookies, clientHeaders, isSameOrigin, jsonError, REFRESH_COOKIE, refreshTokens, setSessionCookies, type Tokens } from "@/lib/server/session";

/**
 * The BFF proxy: `/api/v1/admin/...` → `${VIBE_API_URL}/v1/admin/...`.
 * Adds the staff access token from the httpOnly cookie, refreshes it when
 * it has expired (once per request), and passes the response straight back.
 * Only the admin API is reachable through here.
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  if (path[0] !== "admin") return jsonError(404, "NOT_FOUND", "Not found");
  if (!isSameOrigin(req)) return jsonError(403, "FORBIDDEN", "Cross-site request blocked");

  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  let access = req.cookies.get(ACCESS_COOKIE)?.value;
  let renewed: Tokens | null = null;

  if (!access && refreshToken) {
    renewed = await refreshTokens(refreshToken, req);
    access = renewed?.accessToken;
  }
  if (!access) return finish(jsonError(401, "UNAUTHENTICATED", "Sign in required"), null, true);

  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.arrayBuffer();
  const url = `${API_URL}/v1/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const send = (token: string) =>
    fetch(url, {
      method: req.method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { "content-type": req.headers.get("content-type") ?? "application/json" } : {}),
        ...clientHeaders(req),
      },
      body,
      cache: "no-store",
    });

  let res = await send(access);
  // Access token expired between cookie expiry and now: refresh once and retry.
  if (res.status === 401 && refreshToken && !renewed) {
    const code = ((await res.clone().json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
    if (code === "TOKEN_EXPIRED") {
      renewed = await refreshTokens(refreshToken, req);
      if (renewed) res = await send(renewed.accessToken);
    }
  }

  const headers: Record<string, string> = { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" };
  // File downloads (e.g. the payout batch CSV) keep their name.
  const disposition = res.headers.get("content-disposition");
  if (disposition) headers["content-disposition"] = disposition;
  const out = new NextResponse(res.status === 204 ? null : await res.arrayBuffer(), { status: res.status, headers });
  return finish(out, renewed, res.status === 401);
}

function finish(res: Response, renewed: Tokens | null, signedOut: boolean): Response {
  const out = res instanceof NextResponse ? res : new NextResponse(res.body, res);
  if (renewed) setSessionCookies(out, renewed);
  else if (signedOut) clearSessionCookies(out);
  return out;
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
