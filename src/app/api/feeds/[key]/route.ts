import { isServerFeedKey, SERVER_FEED_KEYS } from "@/features/live/catalog";
import { getFeed } from "@/features/live/server/get-feed";

// Every feed is prerendered at build and refreshed in the background (ISR) by its cacheLife.
export function generateStaticParams() {
  return SERVER_FEED_KEYS.map((key) => ({ key }));
}

export async function GET(_req: Request, ctx: RouteContext<"/api/feeds/[key]">) {
  const { key } = await ctx.params;
  if (!isServerFeedKey(key)) return Response.json({ error: "unknown feed" }, { status: 404 });
  return Response.json(await getFeed(key));
}
