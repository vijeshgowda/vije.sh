"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { createThread } from "../actions";
import { useMe } from "../client/me";
import { postableCategories, postingBlock } from "../client/posting";
import { INITIAL_POST_STATE } from "../form-state";
import { BODY_MAX, TITLE_MAX, TITLE_MIN, type PostField } from "../schemas";
import type { ForumCategory } from "../types";
import { PostDialog, useReturnFocus } from "./PostDialog";
import w from "./Write.module.css";

export type NewThreadCategory = Pick<ForumCategory, "id" | "slug" | "name" | "staffOnly">;

/**
 * "New thread" in the forum bar (prototype `#newt` + `dialog#dlg`). Guests and unfinished
 * accounts get a link to sign in or finish signing up; banned accounts a "can't post" note. The
 * category picker leaves out staff-only categories unless the user moderates them.
 */
export function NewThread({
  categories,
  current,
}: {
  categories: NewThreadCategory[];
  /** Slug of the category page it sits on, preselected when allowed */
  current?: string;
}) {
  const me = useMe();
  const next = encodeURIComponent(usePathname());
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useReturnFocus(open, trigger);

  if (me === undefined) return <span className={w.slot} aria-hidden="true" />;
  switch (postingBlock(me)) {
    case "guest":
      return (
        <ButtonLink variant="red" size="sm" href={`/login?next=${next}` as Route}>
          Sign in to post
        </ButtonLink>
      );
    case "unonboarded":
      return (
        <ButtonLink variant="red" size="sm" href={`/welcome?next=${next}` as Route}>
          Finish sign-up to post
        </ButtonLink>
      );
    case "banned":
      return (
        <p className={w.cant} role="status">
          Your account can&apos;t post.
        </p>
      );
  }

  const options = postableCategories(categories, me!);
  if (options.length === 0) return null;
  return (
    <>
      <Button
        ref={trigger}
        variant="red"
        size="sm"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        New thread
      </Button>
      {open && (
        <NewThreadDialog options={options} current={current} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function NewThreadDialog({
  options,
  current,
  onClose,
}: {
  options: NewThreadCategory[];
  current?: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(createThread, INITIAL_POST_STATE);
  const form = useRef<HTMLFormElement>(null);
  const v = state.values ?? {};
  const preselect = options.some((c) => c.slug === current) ? current : options[0]!.slug;

  // after an error, put focus on the field it is about
  useEffect(() => {
    if (state.field) form.current?.querySelector<HTMLElement>(`[name="${state.field}"]`)?.focus();
  }, [state]);

  const invalid = (f: PostField) => (state.field === f ? true : undefined);
  const describe = (f: PostField, ...ids: string[]) =>
    [...ids, state.field === f ? "nt-error" : null].filter(Boolean).join(" ") || undefined;

  return (
    <PostDialog labelledBy="nt-heading" onClose={onClose}>
      <form ref={form} action={action} className={w.form}>
        <h2 id="nt-heading">New thread</h2>
        <label className={w.label} htmlFor="nt-title">
          Title
        </label>
        <input
          id="nt-title"
          name="title"
          type="text"
          className={w.input}
          required
          minLength={TITLE_MIN}
          maxLength={TITLE_MAX}
          defaultValue={v.title}
          aria-invalid={invalid("title")}
          aria-describedby={describe("title")}
        />
        <label className={w.label} htmlFor="nt-category">
          Category
        </label>
        <select
          id="nt-category"
          name="category"
          className={w.input}
          defaultValue={v.category ?? preselect}
          aria-invalid={invalid("category")}
          aria-describedby={describe("category")}
        >
          {options.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <label className={w.label} htmlFor="nt-body">
          Message
        </label>
        <textarea
          id="nt-body"
          name="body"
          className={w.input}
          rows={5}
          required
          maxLength={BODY_MAX}
          defaultValue={v.body}
          aria-invalid={invalid("body")}
          aria-describedby={describe("body", "nt-hint")}
        />
        <p id="nt-hint" className={w.note}>
          Markdown works; HTML is removed.
        </p>
        <div id="nt-error" role="alert" className={w.error}>
          {state.error}
        </div>
        <div className={w.row}>
          <Button type="submit" variant="red" size="sm" disabled={pending}>
            {pending ? "Transmitting\u2026" : "Transmit"}
          </Button>
          <Button size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </PostDialog>
  );
}
