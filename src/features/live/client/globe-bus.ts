"use client";

import type { Launch, Quake } from "../types";

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
