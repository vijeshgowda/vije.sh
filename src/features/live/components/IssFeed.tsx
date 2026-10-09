"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { latLon } from "../format";
import { createGlobe, loadLand, type Globe, type IssPosition } from "../client/globe";
import { globeBus } from "../client/globe-bus";
import type { FeedStatus } from "./FeedCard";
import s from "./Feeds.module.css";

const API = "https://api.wheretheiss.at/v1/satellites/25544";
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Reading extends IssPosition {
  altitude: number;
  velocity: number;
}

async function getJSON<T>(url: string, ms: number): Promise<T> {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** LF-01. Polled from the browser (wheretheiss.at allows ~1 request/s per IP); 5 s while visible. */
export function IssFeed({ onStatus }: { onStatus: (s: FeedStatus) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<Globe | null>(null);
  const [follow, setFollow] = useState(false);
  const [r, setR] = useState<Reading | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const g = createGlobe(wrap, { reduceMotion });
    globeRef.current = g;
    let alive = true;
    void loadLand().then((a) => alive && a && g.redraw());

    const apply = (o: ReturnType<typeof globeBus.get>, focusChanged: boolean) => {
      g.setPads(o.pads);
      g.setQuakes(o.quakes);
      g.highlight(o.highlight.index, focusChanged && o.highlight.focus);
      if (focusChanged && o.highlight.focus) setFollow(false);
    };
    apply(globeBus.get(), false);
    let lastHi = globeBus.get().highlight;
    const unsub = globeBus.subscribe((o) => {
      const changed = o.highlight !== lastHi;
      lastHi = o.highlight;
      apply(o, changed);
    });

    let fails = 0;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const d = await getJSON<Reading>(API, 6000);
        if (!alive) return;
        fails = 0;
        g.setIss(d);
        setR(d);
        onStatus({ kind: "live", at: Date.now() });
      } catch {
        if (alive && ++fails > 1) onStatus({ kind: "nosignal" });
      }
    };
    const track = async () => {
      const t = Math.floor(Date.now() / 1000);
      const ts = Array.from({ length: 10 }, (_, k) => t + k * 600).join(",");
      try {
        const p = await getJSON<IssPosition[]>(`${API}/positions?timestamps=${ts}`, 8000);
        if (alive) g.setTrack(p);
      } catch {
        // the ground track is optional
      }
    };
    onStatus({ kind: "acquiring" });
    void poll();
    void track();
    const i1 = setInterval(poll, 5000);
    const i2 = setInterval(track, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(i1);
      clearInterval(i2);
      unsub();
      g.destroy();
      globeRef.current = null;
    };
  }, [onStatus]);

  useEffect(() => {
    globeRef.current?.follow(follow);
  }, [follow]);

  return (
    <>
      <div ref={wrapRef} className={`${s.gwrap} probe`}>
        <span className={s.ghint}>drag to rotate</span>
        <div className={s.gctl}>
          <Button size="sm" aria-pressed={follow} onClick={() => setFollow((f) => !f)}>
            Follow ISS
          </Button>
        </div>
      </div>
      <div className={s.gread}>
        <div>
          <small>LAT</small>
          {r ? latLon(r.latitude, "N", "S") : "\u2014"}
        </div>
        <div>
          <small>LON</small>
          {r ? latLon(r.longitude, "E", "W") : "\u2014"}
        </div>
        <div>
          <small>ALT KM</small>
          {r ? r.altitude.toFixed(1) : "\u2014"}
        </div>
        <div>
          <small>KM/H</small>
          {r ? Math.round(r.velocity).toLocaleString("en-GB") : "\u2014"}
        </div>
      </div>
    </>
  );
}
