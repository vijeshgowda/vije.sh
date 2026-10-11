"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { ago, fmtDay, latLon } from "../format";
import { createGlobe, loadLand, type Globe, type IssPosition } from "../client/globe";
import { ensureQuakes, globeBus } from "../client/globe-bus";
import { useNow } from "../client/use-now";
import { Ago, Ext } from "./bodies/parts";
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
    const g = createGlobe(wrap, {
      reduceMotion,
      onPickQuake: (quake) => globeBus.set({ quakePick: { quake, focus: false } }),
    });
    globeRef.current = g;
    let alive = true;
    void loadLand().then((a) => alive && a && g.redraw());
    globeBus.set({ globes: globeBus.get().globes + 1 });

    type Overlay = ReturnType<typeof globeBus.get>;
    const apply = (o: Overlay, prev: Overlay) => {
      g.setPads(o.pads);
      g.setQuakes(o.quakes);
      const padFocus = o.highlight !== prev.highlight && o.highlight.focus;
      const quakeFocus = o.quakePick !== prev.quakePick && !!o.quakePick?.focus;
      g.highlight(o.highlight.index, padFocus);
      g.markQuakes(o.quakeHover, o.quakePick?.quake ?? null, quakeFocus);
      if (padFocus || quakeFocus) setFollow(false);
      if (quakeFocus)
        wrap.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
    };
    let prev = globeBus.get();
    apply(prev, prev);
    const unsub = globeBus.subscribe((o) => {
      apply(o, prev);
      prev = o;
    });
    // after sibling effects, so an LF-16 card on the same page publishes first
    const qt = setTimeout(() => void ensureQuakes(), 0);

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
      clearTimeout(qt);
      clearInterval(i1);
      clearInterval(i2);
      unsub();
      globeBus.set({ globes: globeBus.get().globes - 1 });
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
      <QuakePanel />
    </>
  );
}

/** Chosen earthquake and the quake layer's own freshness (USGS, cached 15 min; not live like the ISS). */
function QuakePanel() {
  const o = useSyncExternalStore(globeBus.subscribe, globeBus.get, globeBus.get);
  const now = useNow(30_000);
  const q = o.quakePick?.quake;
  return (
    <div className={s.gq}>
      <div aria-live="polite">
        {q && (
          <section className={s.gqd} aria-label="Selected earthquake">
            <b className={s.gqm}>M{q.mag.toFixed(1)}</b>
            <span>
              <b>{q.place}</b>
              <small>
                depth {Math.round(q.depth)} km &middot;{" "}
                {fmtDay(q.time, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "UTC",
                })}{" "}
                UTC &middot; <Ago t={q.time} now={now} />
              </small>
            </span>
            <span className={s.gqa}>
              {q.url && <Ext href={q.url}>USGS event</Ext>}
              <button
                type="button"
                className={s.frf}
                aria-label="Close earthquake details"
                onClick={() => globeBus.set({ quakePick: null })}
              >
                &times;
              </button>
            </span>
          </section>
        )}
      </div>
      {o.quakeMeta && (
        <p className={s.gleg}>
          <i className={s.qdot} aria-hidden="true" />
          <span>
            Earthquakes M4.5+ &middot; {o.quakeMeta.total} in 24 h &middot; USGS, updated{" "}
            {now === null ? "recently" : ago(o.quakeMeta.at, now)}
            {!o.quakePick && <> &middot; select a marker for details</>}
          </span>
        </p>
      )}
    </div>
  );
}
