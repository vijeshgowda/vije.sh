import "server-only";
import { databaseReady, listLatestThreads } from "@/features/forum/queries";
import { PALETTE_THREADS, type PaletteThread } from "./items";

/**
 * The palette's forum threads: the most recently active visible ones, from the cached /forum list
 * (tags `forum` and every `category:<slug>`). None while the database is unavailable.
 */
export async function paletteThreads(): Promise<PaletteThread[]> {
  if (!(await databaseReady())) return [];
  const threads = await listLatestThreads();
  return threads.slice(0, PALETTE_THREADS).map((t) => ({
    id: t.id,
    title: t.title,
    slug: t.category.slug,
    category: t.category.name,
    date: t.lastActivityAt.toISOString().slice(0, 10),
  }));
}
