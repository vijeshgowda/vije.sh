import { paletteThreads } from "@/features/palette/threads";

/**
 * Latest forum threads for the jump-to palette, fetched when it opens so pages don't carry them.
 * Prerendered from cached reads and refreshed by the forum's tags.
 */
export async function GET() {
  return Response.json({ threads: await paletteThreads() });
}
