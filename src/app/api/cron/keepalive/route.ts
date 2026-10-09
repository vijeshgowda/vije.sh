import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import { env, hasEnv } from "@/lib/env";
import { ping } from "@/features/system/queries";

function authorised(req: Request): boolean {
  const expected = Buffer.from(`Bearer ${env("cron").CRON_SECRET}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Daily Vercel Cron (vercel.json). Keeps the free Supabase project from pausing. */
export async function GET(req: Request) {
  await connection(); // never prerender: env and secrets are read per request
  if (!hasEnv("cron") || !hasEnv("database")) {
    return Response.json({ ok: false, error: "not configured" }, { status: 503 });
  }
  if (!authorised(req)) return Response.json({ ok: false }, { status: 401 });
  try {
    return Response.json({ ok: true, categories: await ping() });
  } catch {
    return Response.json({ ok: false, error: "database" }, { status: 500 });
  }
}
