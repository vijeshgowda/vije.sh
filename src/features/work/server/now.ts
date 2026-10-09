import "server-only";
import { cacheLife } from "next/cache";

/** "Now" for the timing diagram: cached so the page stays prerendered, refreshed daily. */
export async function careerNow(): Promise<number> {
  "use cache";
  cacheLife("days");
  return Date.now();
}
