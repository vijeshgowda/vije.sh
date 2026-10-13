/** What the moderation Server Actions (actions.ts) answer to the staff islands. */

export type Failure = { ok: false; error: string };

/** A change: `message` is the toast to show; `href` where the post lives now (after a move) */
export type ModerationResult = { ok: true; message: string; href?: string } | Failure;

/** A hidden post's stored text: raw Markdown, shown in a <pre> and never rendered */
export type RevealResult =
  { ok: true; title: string | null; body: string; authorHandle: string | null } | Failure;

/** Categories a thread may be moved to by this user */
export type MoveTargetsResult =
  { ok: true; categories: { slug: string; name: string }[] } | Failure;

/** A hidden thread as its staff see it on its 404 page; `{ ok: false }` for everyone else */
export type HiddenThreadResult =
  | { ok: true; thread: { id: string; title: string; categoryName: string; hiddenAt: string } }
  | { ok: false };
