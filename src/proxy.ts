import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSessionCookie } from "@/features/auth/session-cookie";

/**
 * Refreshes the Supabase session cookie on the few dynamic auth routes (application.md 8.2).
 * Static pages are excluded by the matcher, so they stay on the CDN. getClaims() refreshes an
 * expired access token and setAll() writes the new cookies to both the request (for this render)
 * and the response.
 *
 * Visitors without any session cookie are sent from /admin to sign-in here, with a real redirect
 * that keeps the path. Everyone else is checked by the admin layout and pages.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (/^\/admin(?:\/|$)/.test(pathname) && !hasSessionCookie(request.headers.get("cookie") ?? "")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (process.env.AUTH_MODE === "test" || !url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/welcome", "/auth/:path*", "/login"],
};
