import "server-only";

/** Shown when a mutation throws; each runs in one transaction, so nothing was saved. */
export const ACTION_FAILED = "Something went wrong and nothing was saved. Try again.";

/**
 * For an admin Server Action whose mutation threw (a database error, say): logs the cause for the
 * server logs and returns a form error instead of an unhandled 500 the form can't show.
 */
export function actionFailed(action: string, err: unknown): { error: string } {
  console.error(`admin: ${action} failed`, err);
  return { error: ACTION_FAILED };
}
