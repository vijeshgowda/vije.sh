"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client for signed-in islands (session only; never app data). */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY)");
  return createBrowserClient(url, key);
}
