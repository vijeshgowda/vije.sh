"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { ago, fmtDay, latLon } from "../format";
import { createGlobe, type Globe, type Layers } from "../client/globe";
import { ensureQuakes, globeBus } from "../client/globe-bus";
import { cachedIss, cachedTrack, fetchIss, fetchTrack, issStore } from "../client/iss";
import { useNow } from "../client/use-now";
import { Ago, Ext } from "./bodies/parts";
import type { FeedStatus } from "./FeedCard";
import s from "./Feeds.module.css";

let motionQuery: MediaQueryList | undefined;
// one MediaQueryList: the globe asks every animation frame
const reduceMotion = () => (motionQuery ??= matchMedia("(prefers-reduced-motion: reduce)")).matches;
const noReading = () => null;

/**
 * LF-01. Polled from the browser (wheretheiss.at allows ~1 request/s per IP); 5 s while the globe
 * is on screen. The last position and track (client/iss.ts, shared with the overview preload)
 * show at once while the first poll is in flight.
 * `wide` (Live page): a bigger, more detailed globe with readouts, layers and view controls beside it.
 */
export function IssFeed({
  onStatus,
  wide = false,
}: {
  onStatus: (s: FeedStatus) => void;
  wide?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<Globe | null>(null);
  const [follow, setFollow] = useState(false);
  const [paused, setPaused] = useState(false);
  const [layers, setLayers] = useState<Layers>({ iss: true, pads: true, quakes: true });
  const r = useSyncExternalStore(issStore.subscribe, issStore.get, noReading)?.d ?? null;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let alive = true;
    let visible = true;
    let lastPoll = 0;
    const g = createGlobe(wrap, {
      reduceMotion,
      detail: wide,
      onPickQuake: (quake) => globeBus.set({ quakePick: { quake, focus: false } }),
      onVisible: (v) => {
        visible = v;
        if (v && Date.now() - lastPoll > 5000) void poll();
      },
    });
    globeRef.current = g;
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
      if (padFocus) setLayers((l) => (l.pads ? l : { ...l, pads: true }));
      if (quakeFocus) {
        setLayers((l) => (l.quakes ? l : { ...l, quakes: true }));
        wrap.scrollIntoView({ block: "nearest", behavior: reduceMotion() ? "auto" : "smooth" });
      }
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
      if (document.hidden || !visible) return;
      lastPoll = Date.now();
      try {
        const d = await fetchIss();
        if (!alive) return;
        fails = 0;
        g.setIss(d);
        onStatus({ kind: "live", at: Date.now() });
      } catch {
        if (alive && ++fails > 1) onStatus({ kind: "nosignal" });
      }
    };
    const track = async () => {
      try {
        const p = await fetchTrack();
        if (alive) g.setTrack(p);
      } catch {
        // the ground track is optional
      }
    };
    const last = issStore.get();
    const fresh = cachedIss();
    if (last) g.setIss(last.d);
    onStatus(
      fresh
        ? { kind: "live", at: fresh.at }
        : last
          ? { kind: "stale", at: last.at }
          : { kind: "acquiring" },
    );
    void poll();
    const seedTrack = cachedTrack();
    if (seedTrack) g.setTrack(seedTrack);
    else void track();
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
  }, [onStatus, wide]);

  useEffect(() => {
    globeRef.current?.follow(follow);
  }, [follow]);
  useEffect(() => {
    globeRef.current?.pause(paused);
  }, [paused]);
  useEffect(() => {
    globeRef.current?.setLayers(layers);
  }, [layers]);

  const readouts = (
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
  );
  const toggle = (k: keyof Layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  return (
    <div className={wide ? s.gwide : s.gstack}>
      <div ref={wrapRef} className={`${s.gwrap} probe`}>
        <span className={s.ghint}>drag to rotate</span>
        <div className={s.gctl}>
          <Button size="sm" aria-pressed={follow} onClick={() => setFollow((f) => !f)}>
            Follow ISS
          </Button>
        </div>
      </div>
      <div className={s.gside}>
        {readouts}
        <QuakePanel />
        {wide && (
          <>
            <fieldset className={s.glay}>
              <legend>Layers</legend>
              <button type="button" aria-pressed={layers.iss} onClick={() => toggle("iss")}>
                <i className={s.kiss} aria-hidden="true" />
                ISS and ground track
              </button>
              <button type="button" aria-pressed={layers.pads} onClick={() => toggle("pads")}>
                <i className={s.kpad} aria-hidden="true" />
                Launch pads (LF-02)
              </button>
              <button type="button" aria-pressed={layers.quakes} onClick={() => toggle("quakes")}>
                <i className={s.qdot} aria-hidden="true" />
                Earthquakes (LF-16)
              </button>
              <small>Ring size grows with magnitude; the strongest pulses.</small>
            </fieldset>
            <div className={s.gbtns}>
              <Button size="sm" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
                Pause rotation
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setFollow(false);
                  globeRef.current?.reset();
                }}
              >
                Reset view
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
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
