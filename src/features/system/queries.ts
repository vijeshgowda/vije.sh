import "server-only";
import { query } from "@/lib/db";

/** Cheap query that counts as activity, so the free Supabase project doesn't pause (7 days idle). */
export async function ping(): Promise<number> {
  const { rows } = await query<{ n: number }>("select count(*)::int as n from app.categories");
  return rows[0]?.n ?? 0;
}
