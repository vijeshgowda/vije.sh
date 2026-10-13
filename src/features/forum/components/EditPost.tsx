"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "@/components/layout/toast";
import { Button } from "@/components/ui/Button";
import { can } from "@/lib/authz";
import { uart } from "@/lib/uart";
import { editPost, loadEditSource } from "../actions";
import { handleKey } from "../client/posting";
import type { FrameTool, FrameToolProps, ToolbarFrame } from "../client/toolbar";
import { frameLabel } from "../format";
import { INITIAL_POST_STATE, type EditSource } from "../form-state";
import { BODY_MAX, TITLE_MAX, TITLE_MIN } from "../schemas";
import { PostDialog, useReturnFocus } from "./PostDialog";
import w from "./Write.module.css";

/** Edit own post (post.edit_own): the author within 30 minutes of posting, or the owner. */
export const editTool: FrameTool = {
  id: "edit",
  show: ({ user, frame, now }) =>
    !frame.hidden &&
    can(user, "post.edit_own", {
      authorId: handleKey(frame.authorHandle),
      createdAt: new Date(frame.createdAt),
      now: new Date(now),
    }),
  Tool: EditButton,
};

const editHeading = (f: ToolbarFrame) =>
  `Edit ${f.kind === "thread" ? "thread" : frameLabel(f.no)}`;

function EditButton({ frame }: FrameToolProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useReturnFocus(open, trigger);
  return (
    <>
      <Button ref={trigger} size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Edit
      </Button>
      {open && <EditDialog frame={frame} onClose={() => setOpen(false)} />}
    </>
  );
}

function EditDialog({ frame, onClose }: { frame: ToolbarFrame; onClose: () => void }) {
  const [source, setSource] = useState<EditSource | null>(null);
  const heading = `edit-${frame.key}-heading`;

  useEffect(() => {
    let live = true;
    loadEditSource({ kind: frame.kind, id: frame.id }).then(
      (s) => live && setSource(s),
      () => live && setSource({ ok: false, error: "Could not load the post. Please try again." }),
    );
    return () => {
      live = false;
    };
  }, [frame.kind, frame.id]);

  return (
    <PostDialog labelledBy={heading} onClose={onClose}>
      {source?.ok ? (
        <EditForm frame={frame} source={source} heading={heading} onClose={onClose} />
      ) : (
        <div className={w.form}>
          <h2 id={heading}>{editHeading(frame)}</h2>
          {source ? (
            <p role="alert" className={w.error}>
              {source.error}
            </p>
          ) : (
            <p role="status" className={w.note}>
              Loading&hellip;
            </p>
          )}
          <div className={w.row}>
            <Button size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </PostDialog>
  );
}

function EditForm({
  frame,
  source,
  heading,
  onClose,
}: {
  frame: ToolbarFrame;
  source: Extract<EditSource, { ok: true }>;
  heading: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(editPost, INITIAL_POST_STATE);
  const form = useRef<HTMLFormElement>(null);
  const id = `edit-${frame.key}`;
  const v = state.values ?? {};

  const done = useRef(onClose);
  useEffect(() => {
    done.current = onClose;
  });

  // runs once per answer from the action
  useEffect(() => {
    if (state.ok) {
      uart("bus: frame patched");
      toast("Edit saved");
      done.current();
    } else if (state.field) {
      form.current?.querySelector<HTMLElement>(`[name="${state.field}"]`)?.focus();
    }
  }, [state]);

  const describe = (f: "title" | "body") => (state.field === f ? `${id}-error` : undefined);

  return (
    <form ref={form} action={action} className={w.form}>
      <h2 id={heading}>{editHeading(frame)}</h2>
      <input type="hidden" name="kind" value={frame.kind} />
      <input type="hidden" name="id" value={frame.id} />
      {source.title !== null && (
        <>
          <label className={w.label} htmlFor={`${id}-title`}>
            Title
          </label>
          <input
            id={`${id}-title`}
            name="title"
            type="text"
            className={w.input}
            required
            minLength={TITLE_MIN}
            maxLength={TITLE_MAX}
            defaultValue={v.title ?? source.title}
            aria-invalid={state.field === "title" ? true : undefined}
            aria-describedby={describe("title")}
            autoFocus
          />
        </>
      )}
      <label className={w.label} htmlFor={`${id}-body`}>
        Message
      </label>
      <textarea
        id={`${id}-body`}
        name="body"
        className={w.input}
        rows={8}
        required
        maxLength={BODY_MAX}
        defaultValue={v.body ?? source.body}
        aria-invalid={state.field === "body" ? true : undefined}
        aria-describedby={describe("body")}
        autoFocus={source.title === null}
      />
      <div id={`${id}-error`} role="alert" className={w.error}>
        {state.error}
      </div>
      <div className={w.row}>
        <Button type="submit" variant="red" size="sm" disabled={pending}>
          {pending ? "Saving\u2026" : "Save"}
        </Button>
        <Button size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
