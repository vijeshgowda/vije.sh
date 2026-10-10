"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./UserMenu.module.css";

export interface Me {
  handle: string | null;
  displayName: string | null;
  onboarded: boolean;
  roles: string[];
}

// Supabase's session cookie (chunked as .0, .1 when large) or the test-mode cookie
const SESSION_COOKIE = /(?:^|;\s*)(?:sb-[^=;]+-auth-token(?:\.\d+)?|test_session)=/;

export function hasSessionCookie(cookie: string): boolean {
  return SESSION_COOKIE.test(cookie);
}

/** The signed-in user from /api/me, or null. Guests (no session cookie) never call the server. */
export async function fetchMe(signal?: AbortSignal): Promise<Me | null> {
  if (!hasSessionCookie(document.cookie)) return null;
  try {
    const res = await fetch("/api/me", { cache: "no-store", signal });
    if (!res.ok) return null;
    return ((await res.json()) as { user: Me | null }).user;
  } catch {
    return null;
  }
}

const AUTH_PATHS = ["/login", "/welcome"];

/** Header island: "Sign in", "Finish sign-up" or the member's handle with a sign-out button. */
export function UserMenu() {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  // Re-checked on navigation: onboarding and sign-in end with a client-side redirect.
  useEffect(() => {
    const ctrl = new AbortController();
    fetchMe(ctrl.signal).then((u) => {
      if (!ctrl.signal.aborted) setMe(u);
    });
    return () => ctrl.abort();
  }, [pathname]);

  if (me === undefined) return <span className={styles.slot} aria-hidden="true" />;

  if (!me) {
    const next = AUTH_PATHS.includes(pathname) ? "" : `?next=${encodeURIComponent(pathname)}`;
    return (
      <Link className={styles.link} href={`/login${next}` as Route}>
        Sign in
      </Link>
    );
  }

  if (!me.onboarded) {
    return (
      <Link className={styles.link} href="/welcome">
        Finish sign-up
      </Link>
    );
  }

  return (
    <details className={styles.menu}>
      <summary className={styles.link} aria-label={`Account: @${me.handle}`}>
        @{me.handle}
      </summary>
      <div className={styles.pop}>
        <form method="post" action="/auth/signout">
          <button type="submit">Sign out</button>
        </form>
      </div>
    </details>
  );
}
