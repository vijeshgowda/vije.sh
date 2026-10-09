"use client";

import { useEffect, useState } from "react";
import { fmtDay, kpLabel, tminus, xclass } from "../../format";
import type { Article, Crew, Launch, SpaceWeather, XRays } from "../../types";
import { globeBus } from "../../client/globe-bus";
import { useNow } from "../../client/use-now";
import s from "../Feeds.module.css";
import { Ago, Big, List, Note, Row } from "./parts";

export function Launches({ data }: { data: Launch[] }) {
  const now = useNow(1000);
  const [on, setOn] = useState(-1);
  useEffect(() => {
    globeBus.set({ pads: data });
  }, [data]);
  const hover = (i: number) => {
    setOn(i);
    globeBus.set({ highlight: { index: i, focus: false } });
  };
  if (!data.length) return <Note>No launches scheduled in the next few days.</Note>;
  return (
    <List>
      {data.map((l, i) => (
        <li
          key={`${l.name}-${l.net}`}
          data-on={on === i || undefined}
          onMouseEnter={() => hover(i)}
          onMouseLeave={() => hover(-1)}
        >
          <div>
            <span className={s.i}>{String(i + 1).padStart(2, "0")}</span>
            <button
              type="button"
              className={s.padb}
              aria-label={`${l.name}. Show ${l.location} on the globe`}
              onClick={() => globeBus.set({ highlight: { index: i, focus: true } })}
            >
              <b>{l.name}</b>
              <small>
                {l.provider} &middot; {l.location.split(",")[0]}
                {l.orbit && <> &middot; {l.orbit}</>} &middot;{" "}
                {fmtDay(l.net, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "UTC",
                })}{" "}
                UTC
              </small>
            </button>
            <span className={s.v}>
              <span className={s.tm}>{now === null ? "T-" : tminus(l.net, now)}</span>
              <br />
              <span className={s.go} data-go={l.status === "Go" || undefined} title={l.statusName}>
                {l.status || "TBD"}
              </span>
            </span>
          </div>
        </li>
      ))}
    </List>
  );
}

export function CrewList({ data }: { data: Crew }) {
  return (
    <>
      <Big value={data.count} red>
        humans off-planet &middot; ISS Expedition {data.expedition}
      </Big>
      <List>
        {data.people.map((p, i) => (
          <Row
            key={p.name}
            n={i + 1}
            href={p.url}
            title={p.name}
            meta={`${p.agency} · ${p.craft}`}
            value={`${p.days} d`}
          />
        ))}
      </List>
    </>
  );
}

export function SpaceWeatherChart({ data }: { data: SpaceWeather }) {
  const k = data.kp;
  const now = k[k.length - 1]?.[1] ?? 0;
  const bw = 100 / Math.max(1, k.length);
  const y5 = 40 - (5 / 9) * 40;
  return (
    <>
      <Big value={`Kp ${now.toFixed(1)}`} red={now >= 5}>
        {kpLabel(now)}
        {data.windKmS !== null && <> &middot; solar wind {Math.round(data.windKmS)} km/s</>}
      </Big>
      <svg
        className={s.kpb}
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Planetary K index, last 3 days, now ${now.toFixed(1)}`}
      >
        {k.map(([t, v], i) => (
          <rect
            key={t}
            data-r={v >= 5 || undefined}
            x={(i * bw + 0.3).toFixed(2)}
            y={(40 - (v / 9) * 40).toFixed(2)}
            width={(bw - 0.6).toFixed(2)}
            height={((v / 9) * 40).toFixed(2)}
          />
        ))}
        <line x1="0" x2="100" y1={y5} y2={y5} vectorEffect="non-scaling-stroke" />
      </svg>
      <Note>Kp over the last 3 days. Dashed line: Kp 5, when aurora reaches mid latitudes.</Note>
    </>
  );
}

export function News({ data }: { data: Article[] }) {
  const now = useNow(30_000);
  return (
    <List>
      {data.map((a, i) => (
        <Row
          key={a.title}
          n={i + 1}
          href={a.url}
          title={a.title}
          meta={a.site}
          value={<Ago t={Date.parse(a.published)} now={now} />}
        />
      ))}
    </List>
  );
}

export function XRayChart({ data }: { data: XRays }) {
  const W = 300;
  const H = 96;
  const y = (f: number) => Math.max(0, Math.min(H, H - ((Math.log10(f) + 8.5) / 5) * H)).toFixed(1);
  const pts = data.points
    .map(
      ([, f], i) => `${((i / Math.max(1, data.points.length - 1)) * (W - 20)).toFixed(1)},${y(f)}`,
    )
    .join(" ");
  const now = data.points[data.points.length - 1]?.[1] ?? 0;
  const peak = Math.max(...data.points.map((x) => x[1]));
  const bands = [
    ["A", 1e-8],
    ["B", 1e-7],
    ["C", 1e-6],
    ["M", 1e-5],
    ["X", 1e-4],
  ] as const;
  return (
    <>
      <Big value={xclass(now)} red={now >= 1e-5}>
        now &middot; 6 h peak {xclass(peak)}
      </Big>
      <svg
        className={s.xrc}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`GOES X-ray flux over 6 hours: now ${xclass(now)}, peak ${xclass(peak)}`}
      >
        {bands.map(([n, b]) => (
          <g key={n}>
            <line x1="0" x2={W - 20} y1={y(b)} y2={y(b)} />
            <text x={W - 12} y={+y(b) + 3}>
              {n}
            </text>
          </g>
        ))}
        <polyline points={pts} />
      </svg>
      <Note>
        GOES 0.1&ndash;0.8 nm flux, log scale. M and X class flares can black out HF radio on the
        day side.
      </Note>
    </>
  );
}
