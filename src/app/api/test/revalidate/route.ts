import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { assertAuthModeSafe, env } from "@/lib/env";

/**
 * Test mode only (AUTH_MODE=test, which env.ts refuses on Vercel; application.md 13.4). Feature
 * tests seed content straight into the test database, then expire its cache tags here, the way a
 * Server Action's revalidateTag() would after a write. Needs the TEST_AUTH_SECRET in
 * `x-test-secret`. Answers 404 in every other mode.
 */
const bodySchema = z.object({ tags: z.array(z.string().min(1).max(256)).min(1).max(20) });

export async function POST(request: Request) {
  if (process.env.AUTH_MODE !== "test") return new Response(null, { status: 404 });
  assertAuthModeSafe();
  const got = Buffer.from(request.headers.get("x-test-secret") ?? "");
  const want = Buffer.from(env("testAuth").TEST_AUTH_SECRET);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return new Response(null, { status: 403 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return new Response(null, { status: 400 });
  for (const tag of body.data.tags) revalidateTag(tag, { expire: 0 });
  return new Response(null, { status: 204 });
}
