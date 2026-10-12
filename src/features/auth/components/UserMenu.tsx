"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isSuperuser, type Role, type RoleGrant } from "@/lib/authz";
import { hasSessionCookie } from "../session-cookie";
import styles from "./UserMenu.module.css";

/** GET /api/me's `user` (src/app/api/me/route.ts) */
export interface Me {
  handle: string | null;
  displayName: string | null;
  onboarded: boolean;
  banned: boolean;
  /** distinct role names */
  roles: Role[];
  /** every grant, with its category scope (null = global) */
  grants: RoleGrant[];
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

/**
 * Header island: "Sign in", "Finish sign-up" or the member's handle with a menu: an Admin link for
 * superusers and the owner, and sign-out. The admin pages check access again on the server.
 */
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
    // keyed by path so the menu closes after following one of its links
    <details key={pathname} className={styles.menu}>
      <summary className={styles.link} aria-label={`Account: @${me.handle}`}>
        @{me.handle}
      </summary>
      <div className={styles.pop}>
        {!me.banned && isSuperuser({ roles: me.grants }) && <Link href="/admin">Admin</Link>}
        <form method="post" action="/auth/signout">
          <button type="submit">Sign out</button>
        </form>
      </div>
    </details>
  );
}
