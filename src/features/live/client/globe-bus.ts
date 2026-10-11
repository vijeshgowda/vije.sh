"use client";

import type { FeedResult, Launch, Quake } from "../types";

/**
 * Lets feeds talk to the LF-01 globe without knowing about each other: the launch manifest
 * publishes pads, earthquakes publish rings, launch rows ask the globe to highlight a pad.
 */
export interface GlobeOverlay {
  pads: Launch[];
  quakes: Quake[];
  highlight: { index: number; focus: boolean };
}

type Listener = (o: GlobeOverlay) => void;
let state: GlobeOverlay = { pads: [], quakes: [], highlight: { index: -1, focus: false } };
const listeners = new Set<Listener>();

export const globeBus = {
  get: () => state,
  set(patch: Partial<GlobeOverlay>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l(state));
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};

/** The globe needs quakes even when LF-16 isn't on the page: load them from our cached API. */
export async function ensureQuakes(load: typeof fetch = fetch) {
  if (state.quakes.length) return;
  try {
    const r = (await (await load("/api/feeds/eq")).json()) as FeedResult<"eq">;
    if (r.ok && !state.quakes.length) globeBus.set({ quakes: r.data.events });
  } catch {
    // the overlay is optional
  }
}
