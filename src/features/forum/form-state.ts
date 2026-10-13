import type { PostField } from "./schemas";

/** What the forum's Server Actions return to their forms (useActionState). */
export interface PostFormState {
  /** Bumped on every submit, so a form can react to each answer */
  seq: number;
  ok?: boolean;
  error?: string;
  /** The field the error belongs to */
  field?: PostField;
  /** What was typed, put back after an error (React resets a form after its action runs) */
  values?: { category?: string; title?: string; body?: string };
  /** The new reply's id */
  id?: string;
}

export const INITIAL_POST_STATE: PostFormState = { seq: 0 };

/** loadEditSource(): the post as stored, for the edit form */
export type EditSource =
  { ok: true; title: string | null; body: string } | { ok: false; error: string };
