import { NextResponse, type NextRequest } from "next/server";

import { API_URL, clearSessionCookies, isSameOrigin, jsonError, REFRESH_COOKIE } from "@/lib/server/session";

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, "FORBIDDEN", "Cross-site request blocked");
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await fetch(`${API_URL}/v1/admin/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    }).catch(() => undefined);
  }
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}
