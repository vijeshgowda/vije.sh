"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadLand } from "../client/globe";
import { warmIss } from "../client/iss";
import { createPreload } from "../client/preload";
import { warmWeather } from "../client/weather";

const schedule = createPreload();

/**
 * /live's big globe draws the 50m coastlines once its radius reaches 180 px (`landResFor`), which
 * its `clamp(26rem, 62vh, 40rem)` box gives on screens at least about 700 px in both directions.
 */
export const wantsDetailedLand = () => Math.min(innerWidth, innerHeight) >= 700;

/**
 * Mounted on the overview: while the hero plays, warms what /live loads in the browser (route,
 * coastlines, ISS position and track, weather) into the caches its cards read. Renders nothing,
 * so visitors without JavaScript see no difference.
 */
export function LivePreload() {
  const router = useRouter();
  useEffect(
    () =>
      schedule([
        () => router.prefetch("/live"),
        () => loadLand(wantsDetailedLand() ? "50m" : "110m"),
        warmIss,
        warmWeather,
      ]),
    [router],
  );
  return null;
}
