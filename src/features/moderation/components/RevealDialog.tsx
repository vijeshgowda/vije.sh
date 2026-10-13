"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PostDialog } from "@/features/forum/components/PostDialog";
import w from "@/features/forum/components/Write.module.css";
import { revealPost } from "../actions";
import type { RevealResult } from "../results";
import type { Target } from "../schemas";
import m from "./Moderation.module.css";

/**
 * A hidden post's stored text for staff, fetched when the dialog opens. Shown as plain text in a
 * <pre> (React escapes it): hidden Markdown is never rendered, so nothing in it can run or load.
 */
export function RevealDialog({
  kind,
  id,
  title,
  onClose,
}: Target & {
  /** "Hidden FRAME 03" or "Hidden thread" */
  title: string;
  onClose: () => void;
}) {
  const [source, setSource] = useState<RevealResult | null>(null);
  const heading = `reveal-${kind}-${id}-heading`;

  useEffect(() => {
    let live = true;
    revealPost({ kind, id }).then(
      (s) => live && setSource(s),
      () => live && setSource({ ok: false, error: "Could not load the post. Please try again." }),
    );
    return () => {
      live = false;
    };
  }, [kind, id]);

  return (
    <PostDialog labelledBy={heading} onClose={onClose}>
      <div className={w.form}>
        <h2 id={heading}>{title}</h2>
        {source === null && (
          <p role="status" className={w.note}>
            Loading&hellip;
          </p>
        )}
        {source && !source.ok && (
          <p role="alert" className={w.error}>
            {source.error}
          </p>
        )}
        {source?.ok && (
          <>
            <p className={w.note}>
              {source.authorHandle ? `By @${source.authorHandle}` : "By a deleted account"}
              {" \u00b7 "}raw Markdown as stored, staff only
            </p>
            {source.title !== null && <p className={m.rawTitle}>{source.title}</p>}
            <pre className={m.raw} tabIndex={0} aria-label="Hidden text">
              {source.body}
            </pre>
          </>
        )}
        <div className={w.row}>
          <Button size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </PostDialog>
  );
}
