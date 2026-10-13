"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { PostDialog, useReturnFocus } from "@/features/forum/components/PostDialog";
import w from "@/features/forum/components/Write.module.css";
import { moveThread, moveTargets } from "../actions";
import { useModerate } from "../client/use-moderate";
import type { MoveTargetsResult } from "../results";

/** "Move": moves the thread to another category the viewer moderates. */
export function MoveButton({ threadId }: { threadId: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useReturnFocus(open, trigger);
  return (
    <>
      <Button ref={trigger} size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Move
      </Button>
      {open && <MoveDialog threadId={threadId} onClose={() => setOpen(false)} />}
    </>
  );
}

function MoveDialog({ threadId, onClose }: { threadId: string; onClose: () => void }) {
  const [targets, setTargets] = useState<MoveTargetsResult | null>(null);
  const router = useRouter();
  const { pending, error, run } = useModerate();
  const id = `move-${threadId}`;

  useEffect(() => {
    let live = true;
    moveTargets({ id: threadId }).then(
      (t) => live && setTargets(t),
      () => live && setTargets({ ok: false, error: "Could not load the categories." }),
    );
    return () => {
      live = false;
    };
  }, [threadId]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const category = String(new FormData(e.currentTarget).get("category") ?? "");
    // the old address would redirect too; go straight to the new one
    run(
      () => moveThread({ id: threadId, category }),
      (r) => {
        onClose();
        if (r.href) router.replace(r.href as Route);
      },
    );
  }

  const options = targets?.ok ? targets.categories : [];
  const problem =
    error ??
    (targets && !targets.ok ? targets.error : null) ??
    (targets?.ok && options.length === 0 ? "You don't moderate another category." : null);

  return (
    <PostDialog labelledBy={`${id}-heading`} onClose={onClose}>
      <form onSubmit={submit} className={w.form}>
        <h2 id={`${id}-heading`}>Move thread</h2>
        <p className={w.note}>
          Its address keeps working: the old category&rsquo;s URL redirects to the new one.
        </p>
        {targets === null ? (
          <p role="status" className={w.note}>
            Loading&hellip;
          </p>
        ) : (
          options.length > 0 && (
            <>
              <label className={w.label} htmlFor={`${id}-category`}>
                Category
              </label>
              <select id={`${id}-category`} name="category" className={w.input} required autoFocus>
                {options.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </select>
            </>
          )
        )}
        <div id={`${id}-error`} role="alert" className={w.error}>
          {problem}
        </div>
        <div className={w.row}>
          <Button type="submit" variant="red" size="sm" disabled={pending || options.length === 0}>
            {pending ? "Moving\u2026" : "Move"}
          </Button>
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </PostDialog>
  );
}
