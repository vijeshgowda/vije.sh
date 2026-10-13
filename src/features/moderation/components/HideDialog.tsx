"use client";

import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { PostDialog, useReturnFocus } from "@/features/forum/components/PostDialog";
import type { ToolbarFrame } from "@/features/forum/client/toolbar";
import w from "@/features/forum/components/Write.module.css";
import { frameLabel } from "@/features/forum/format";
import { hidePost } from "../actions";
import { useModerate } from "../client/use-moderate";
import { NOTE_MAX } from "../schemas";

const what = (f: ToolbarFrame) => (f.kind === "thread" ? "thread" : frameLabel(f.no));

/** "Hide thread" on frame 00, "Hide" on a reply; asks for confirmation and an optional reason. */
export function HideButton({ frame }: { frame: ToolbarFrame }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useReturnFocus(open, trigger);
  return (
    <>
      <Button ref={trigger} size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {frame.kind === "thread" ? "Hide thread" : "Hide"}
      </Button>
      {open && <HideDialog frame={frame} onClose={() => setOpen(false)} />}
    </>
  );
}

function HideDialog({ frame, onClose }: { frame: ToolbarFrame; onClose: () => void }) {
  const { pending, error, run } = useModerate();
  const id = `hide-${frame.key}`;
  const thread = frame.kind === "thread";

  // onSubmit, not a form action: React would clear the reason after an error
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const note = String(new FormData(e.currentTarget).get("note") ?? "");
    run(
      () => hidePost({ kind: frame.kind, id: frame.id, note }),
      () => onClose(),
    );
  }

  return (
    <PostDialog labelledBy={`${id}-heading`} onClose={onClose}>
      <form onSubmit={submit} className={w.form}>
        <h2 id={`${id}-heading`}>Hide {what(frame)}</h2>
        <p className={w.note}>
          {thread
            ? "The thread leaves the forum: members get a 404. Its staff can reveal or unhide it from its address."
            : "Members see a placeholder instead of the reply. Staff can reveal or unhide it."}
        </p>
        <label className={w.label} htmlFor={`${id}-note`}>
          Reason (optional, logged)
        </label>
        <textarea
          id={`${id}-note`}
          name="note"
          className={w.input}
          rows={3}
          maxLength={NOTE_MAX}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <div id={`${id}-error`} role="alert" className={w.error}>
          {error}
        </div>
        <div className={w.row}>
          <Button type="submit" variant="red" size="sm" disabled={pending}>
            {pending ? "Hiding\u2026" : "Hide"}
          </Button>
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </PostDialog>
  );
}
