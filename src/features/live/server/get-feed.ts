import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { FEED_BY_KEY, type ServerFeedKey } from "../catalog";
import type { FeedResult } from "../types";
import { LOADERS } from "./loaders";

/**
 * Cached server feed. 'use cache: remote' gives one durable cache shared by every serverless
 * instance (Vercel provides the handler), so one upstream call serves every visitor per TTL and the
 * rate limits hold (Launch Library: 15/h, GitHub: 60/h). Errors are cached briefly and never thrown,
 * so a dead upstream can't fail the build or a page.
 */
export async function getFeed<K extends ServerFeedKey>(key: K): Promise<FeedResult<K>> {
  "use cache: remote";
  cacheTag("feeds", `feed:${key}`);
  const ttl = FEED_BY_KEY[key].ttl ?? 1800;

  if (process.env.FEEDS_OFFLINE === "1") {
    cacheLife("max");
    return { ok: false, key, at: 0, error: "offline" };
  }
  try {
    const data = await LOADERS[key]();
    cacheLife({ stale: 60, revalidate: ttl, expire: Math.max(ttl * 4, 86_400) });
    return { ok: true, key, at: Date.now(), data } as FeedResult<K>;
  } catch (err) {
    console.warn(`[feeds] ${key}: ${err instanceof Error ? err.message : String(err)}`);
    // short retry window; expire >= 5 min keeps the entry eligible for prerendering
    cacheLife({ stale: 30, revalidate: 120, expire: 300 });
    return { ok: false, key, at: Date.now(), error: "upstream" };
  }
}

export async function getFeeds<K extends ServerFeedKey>(keys: readonly K[]) {
  const results = await Promise.all(keys.map((k) => getFeed(k)));
  return Object.fromEntries(results.map((r) => [r.key, r])) as { [P in K]: FeedResult<P> };
}
