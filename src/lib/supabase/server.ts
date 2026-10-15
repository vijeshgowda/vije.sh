import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { env } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers. Used for AUTH ONLY
 * (identity, sessions); app data goes through @/lib/db. Reading cookies makes a route dynamic, so
 * never call this from a static page: signed-in UI is a client island (application.md section 7).
 */
export async function createSupabaseServerClient() {
  // request data first: while prerendering, cookies() never resolves, so a build without the
  // Supabase variables (previews) doesn't fail here; a request without them still does
  const store = await cookies();
  // the client reads Date.now() while loading the session; under partial prefetching that throws
  // in the runtime prerender stage, so wait for the dynamic stage first
  await connection();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY } = env("supabase");
  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components can't set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}
