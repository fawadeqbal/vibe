import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic routing only: no session cookie → sign-in page. Real checks
 * (token validity, permissions) happen in the API on every request.
 */
const REFRESH_COOKIE = "vibe_admin_rt";
const PUBLIC = ["/login"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const signedIn = req.cookies.has(REFRESH_COOKIE);
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!signedIn && !isPublic) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  if (signedIn && isPublic) return NextResponse.redirect(new URL("/", req.url));

  const res = NextResponse.next();
  res.headers.set("x-frame-options", "DENY");
  res.headers.set("referrer-policy", "same-origin");
  res.headers.set("x-content-type-options", "nosniff");
  return res;
}

export const config = {
  // Pages only: not the BFF, Next internals or static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
