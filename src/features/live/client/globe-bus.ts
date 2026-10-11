"use client";

import type { FeedResult, Launch, Quake, QuakeFeed } from "../types";

/**
 * Lets feeds talk to the LF-01 globe without knowing about each other: the launch manifest
 * publishes pads, earthquakes publish rings, launch and quake rows ask the globe to highlight one.
 */
export interface GlobeOverlay {
  pads: Launch[];
  quakes: Quake[];
  /** Events in the last 24 h and when our server fetched them */
  quakeMeta: { total: number; at: number } | null;
  highlight: { index: number; focus: boolean };
  /** Hovered quake row: marker highlight only */
  quakeHover: Quake | null;
  /** Chosen quake: details panel. With focus (picked from a list) the globe centres on it. */
  quakePick: { quake: Quake; focus: boolean } | null;
  /** Globes mounted on the page; quake rows only offer "show on globe" when there is one */
  globes: number;
}

type Listener = (o: GlobeOverlay) => void;
let state: GlobeOverlay = {
  pads: [],
  quakes: [],
  quakeMeta: null,
  highlight: { index: -1, focus: false },
  quakeHover: null,
  quakePick: null,
  globes: 0,
};
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

export function publishQuakes(data: QuakeFeed, at: number) {
  globeBus.set({ quakes: data.events, quakeMeta: { total: data.total, at } });
}

/** The globe needs quakes even when LF-16 isn't on the page: load them from our cached API. */
export async function ensureQuakes(load: typeof fetch = fetch) {
  if (state.quakes.length) return;
  try {
    const r = (await (await load("/api/feeds/eq")).json()) as FeedResult<"eq">;
    if (r.ok && !state.quakes.length) publishQuakes(r.data, r.at);
  } catch {
    // the overlay is optional
  }
}
