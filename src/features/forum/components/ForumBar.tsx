import type { ReactNode } from "react";
import Link from "next/link";
import { categoryHref, forumHref } from "../format";
import type { ForumCategory } from "../types";
import s from "./Forum.module.css";

/**
 * Category chips (prototype `.fbar .chips`), as links: "All" is /forum, each category its own page.
 * `actions` is the right-hand slot (the "New thread" button comes with the write path).
 */
export function ForumBar({
  categories,
  current = null,
  actions,
}: {
  categories: Pick<ForumCategory, "slug" | "name">[];
  /** Slug of the category being shown; null for all */
  current?: string | null;
  actions?: ReactNode;
}) {
  const chip = (key: string | null, href: ReturnType<typeof forumHref>, label: string) => (
    <li key={key ?? ""}>
      <Link href={href} aria-current={current === key ? "page" : undefined}>
        {label}
      </Link>
    </li>
  );
  return (
    <div className={s.fbar}>
      <nav aria-label="Forum categories">
        <ul className={s.chips}>
          {chip(null, forumHref(), "All")}
          {categories.map((c) => chip(c.slug, categoryHref(c.slug), c.name))}
        </ul>
      </nav>
      {actions}
    </div>
  );
}
