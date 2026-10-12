import { connection } from "next/server";
import { getCurrentUser } from "@/features/auth/session";

/**
 * The signed-in user for client islands (UserMenu, /welcome). Same origin, so the CSP never has to
 * allow the Supabase host. Never cached: the answer is per user. The user id stays on the server;
 * islands match authors by handle.
 */
export async function GET() {
  await connection();
  const user = await getCurrentUser();
  const body = user
    ? {
        user: {
          handle: user.handle,
          displayName: user.displayName,
          onboarded: user.onboarded,
          banned: user.banned,
          roles: [...new Set(user.roles.map((r) => r.role))],
          grants: user.roles.map((r) => ({ role: r.role, categoryId: r.categoryId })),
        },
      }
    : { user: null };
  return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
