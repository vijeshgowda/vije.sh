import "server-only";
import { query } from "@/lib/db";

/** First sign-in: creates the profile; later sign-ins leave it untouched. */
export async function upsertProfile(p: {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
}): Promise<void> {
  await query(
    `insert into app.profiles (id, display_name, avatar_url) values ($1, $2, $3)
     on conflict (id) do nothing`,
    [p.id, p.displayName, p.avatarUrl],
  );
}

export class HandleTakenError extends Error {
  constructor() {
    super("handle taken");
    this.name = "HandleTakenError";
  }
}

/**
 * Sets the handle and makes the user a member. False when there's no profile or it's already
 * onboarded. Throws HandleTakenError when another profile has the handle in any letter case.
 */
export async function completeOnboarding(userId: string, handle: string): Promise<boolean> {
  try {
    const { rowCount } = await query(
      `update app.profiles set handle = $2, onboarded_at = now()
        where id = $1 and onboarded_at is null`,
      [userId, handle],
    );
    return rowCount === 1;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new HandleTakenError();
    throw err;
  }
}
