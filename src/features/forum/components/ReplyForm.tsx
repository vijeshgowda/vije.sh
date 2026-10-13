"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "@/components/layout/toast";
import { Button } from "@/components/ui/Button";
import { can } from "@/lib/authz";
import { uart } from "@/lib/uart";
import { createReply } from "../actions";
import { useMe } from "../client/me";
import { meAsUser, postingBlock } from "../client/posting";
import type { ToolbarThread } from "../client/toolbar";
import { INITIAL_POST_STATE } from "../form-state";
import { BODY_MAX } from "../schemas";
import { PostingNotice } from "./PostingNotice";
import w from "./Write.module.css";

/**
 * The reply form under a thread (prototype `form.reply`). Members reply; locked threads take
 * replies from staff only. Guests, unfinished and banned accounts see why they can't.
 */
export function ReplyForm({
  thread,
}: {
  thread: Pick<ToolbarThread, "id" | "categoryId" | "locked">;
}) {
  const me = useMe();
  if (me === undefined) return null;
  const block = postingBlock(me);
  if (block) return <PostingNotice block={block} verb="reply" className={w.notice} />;
  const user = meAsUser(me!);
  if (!can(user, "reply.create", { categoryId: thread.categoryId, locked: thread.locked })) {
    return <p className={w.notice}>This thread is locked. Only moderators can reply.</p>;
  }
  return <Form threadId={thread.id} handle={me!.handle} locked={thread.locked} />;
}

function Form({
  threadId,
  handle,
  locked,
}: {
  threadId: string;
  handle: string | null;
  locked: boolean;
}) {
  const [state, action, pending] = useActionState(createReply, INITIAL_POST_STATE);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (state.ok && state.id) {
      document.getElementById(`reply-${state.id}`)?.scrollIntoView({ block: "center" });
      uart("bus: reply frame sent");
      toast("Reply transmitted");
    } else if (state.error) {
      area.current?.focus();
    }
  }, [state]);

  return (
    <form action={action} className={w.reply}>
      <input type="hidden" name="threadId" value={threadId} />
      <label className={w.label} htmlFor="reply-body">
        Reply
      </label>
      <textarea
        ref={area}
        id="reply-body"
        name="body"
        className={w.input}
        rows={4}
        required
        maxLength={BODY_MAX}
        defaultValue={state.ok ? "" : state.values?.body}
        aria-invalid={state.field === "body" ? true : undefined}
        aria-describedby={state.error ? "reply-hint reply-error" : "reply-hint"}
      />
      <div id="reply-error" role="alert" className={w.error}>
        {state.error}
      </div>
      <div className={w.row}>
        <span id="reply-hint" className={w.note}>
          Posting as @{handle}
          {locked ? " in a locked thread (staff)" : ""}. Markdown works; HTML is removed.
        </span>
        <Button type="submit" variant="red" size="sm" disabled={pending}>
          {pending ? "Transmitting\u2026" : "Transmit"}
        </Button>
      </div>
    </form>
  );
}
