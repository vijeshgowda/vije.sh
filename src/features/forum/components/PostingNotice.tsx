"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { PostingBlock } from "../client/posting";

/** Why this visitor can't post here, with the way forward: sign in or finish signing up. */
export function PostingNotice({
  block,
  verb,
  className,
}: {
  block: PostingBlock;
  /** "reply", "start a thread" */
  verb: string;
  className?: string;
}) {
  const next = encodeURIComponent(usePathname());
  switch (block) {
    case "guest":
      return (
        <p className={className}>
          <Link href={`/login?next=${next}` as Route}>Sign in</Link> to {verb}.
        </p>
      );
    case "unonboarded":
      return (
        <p className={className}>
          <Link href={`/welcome?next=${next}` as Route}>Finish signing up</Link> to {verb}.
        </p>
      );
    case "banned":
      return (
        <p className={className} role="status">
          Your account can&apos;t post. You can still read the forum.
        </p>
      );
  }
}
