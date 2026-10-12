"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminLink } from "../sections";
import styles from "./AdminNav.module.css";

/** True for the link's own page and the pages under it (/admin/members/42 → Members). */
export function isCurrent(href: string, pathname: string): boolean {
  return pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
}

/**
 * The admin section links (forum category-chip style). The layout passes only the sections this
 * user may open (adminLinksFor); the pages check access again themselves.
 */
export function AdminNav({ links }: { links: AdminLink[] }) {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Admin sections">
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={isCurrent(l.href, pathname) ? "page" : undefined}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
