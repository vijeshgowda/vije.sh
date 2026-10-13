"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useMe } from "@/features/forum/client/me";
import { useReturnFocus } from "@/features/forum/components/PostDialog";
import { fmtDateTime, parseThreadId, threadAddress } from "@/features/forum/format";
import { hiddenThread, unhidePost } from "../actions";
import { reloadPage } from "../client/reload";
import { hasStaffGrant } from "../client/staff";
import { useModerate } from "../client/use-moderate";
import type { HiddenThreadResult } from "../results";
import { RevealDialog } from "./RevealDialog";
import m from "./Moderation.module.css";

type Thread = Extract<HiddenThreadResult, { ok: true }>["thread"];

/**
 * On a thread's 404 page: if the thread is hidden and the visitor moderates its category, says so
 * and offers Reveal and Unhide. Everyone else (and every other 404) gets nothing: the island asks
 * the server only for signed-in staff, and the server answers only to staff in scope.
 */
export function HiddenThreadNotice() {
  const params = useParams<{ thread?: string }>();
  const raw = params?.thread;
  const id = typeof raw === "string" ? parseThreadId(raw) : null;
  const me = useMe();
  const staff = !!me && me.onboarded && !me.banned && hasStaffGrant({ roles: me.grants });
  const [thread, setThread] = useState<Thread | null>(null);

  useEffect(() => {
    if (!staff || !id) return;
    let live = true;
    hiddenThread({ id }).then(
      (r) => live && setThread(r.ok ? r.thread : null),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [staff, id]);

  if (!thread) return null;
  return <Notice thread={thread} />;
}

function Notice({ thread }: { thread: Thread }) {
  const { pending, error, run } = useModerate();
  const [revealing, setRevealing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useReturnFocus(revealing, trigger);
  const heading = `hidden-thread-${thread.id}`;

  return (
    <section className={m.notice} aria-labelledby={heading}>
      <header>
        <span>{threadAddress(thread.id)}</span>
        <span>{thread.categoryName}</span>
        <span>
          Hidden <time dateTime={thread.hiddenAt}>{fmtDateTime(new Date(thread.hiddenAt))}</time>
        </span>
      </header>
      <h2 id={heading}>{thread.title}</h2>
      <p>Staff only: this thread is hidden, so everyone else gets this 404.</p>
      <div className={m.tools}>
        <Button ref={trigger} size="sm" aria-haspopup="dialog" onClick={() => setRevealing(true)}>
          Reveal
        </Button>
        <Button
          size="sm"
          variant="red"
          disabled={pending}
          onClick={() => run(() => unhidePost({ kind: "thread", id: thread.id }), reloadPage)}
        >
          {pending ? "Unhiding\u2026" : "Unhide thread"}
        </Button>
      </div>
      {error && (
        <p role="alert" className={m.error}>
          {error}
        </p>
      )}
      {revealing && (
        <RevealDialog
          kind="thread"
          id={thread.id}
          title="Hidden thread"
          onClose={() => setRevealing(false)}
        />
      )}
    </section>
  );
}
