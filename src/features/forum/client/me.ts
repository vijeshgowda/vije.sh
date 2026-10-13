"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fetchMe, type Me } from "@/features/auth/components/UserMenu";

/**
 * The signed-in user from /api/me, shared by every forum island on the page (one request, not one
 * per frame). undefined while loading and during prerender/hydration, null for guests. Refetched
 * when an island mounts and the answer is older than FRESH_MS.
 */
const FRESH_MS = 15_000;

let me: Me | null | undefined;
let at = 0;
let inflight: Promise<void> | null = null;
const subs = new Set<() => void>();

function load() {
  if (inflight || (me !== undefined && Date.now() - at < FRESH_MS)) return;
  inflight = fetchMe().then((u) => {
    me = u;
    at = Date.now();
    inflight = null;
    subs.forEach((f) => f());
  });
}

const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => void subs.delete(cb);
};

export function useMe(): Me | null | undefined {
  const value = useSyncExternalStore(
    subscribe,
    () => me,
    () => undefined,
  );
  useEffect(load, []);
  return value;
}

/** Tests only: forget the cached answer */
export function resetMe() {
  me = undefined;
  at = 0;
  inflight = null;
}
