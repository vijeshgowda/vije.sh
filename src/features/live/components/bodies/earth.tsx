"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { NaturalEvent, Quake, QuakeFeed } from "../../types";
import { p2, sameQuake, strongest } from "../../format";
import { globeBus, publishQuakes } from "../../client/globe-bus";
import { useNow } from "../../client/use-now";
import s from "../Feeds.module.css";
import { Ago, Big, List, Note, Row } from "./parts";

const hover = (q: Quake | null) => globeBus.set({ quakeHover: q });

export function Quakes({ data, at }: { data: QuakeFeed; at: number }) {
  const now = useNow(30_000);
  const o = useSyncExternalStore(globeBus.subscribe, globeBus.get, globeBus.get);
  useEffect(() => {
    publishQuakes(data, at);
  }, [data, at]);
  const big = strongest(data.events);
  const picked = o.quakePick?.quake;
  const meta = (q: Quake) => (
    <>
      depth {Math.round(q.depth)} km &middot; <Ago t={q.time} now={now} />
    </>
  );
  return (
    <>
      <Big value={data.total} red={(big?.mag ?? 0) >= 6}>
        in 24 h{big && <> &middot; strongest M{big.mag.toFixed(1)}</>}
      </Big>
      <List>
        {data.events.slice(0, 6).map((q, i) =>
          o.globes ? (
            <li
              key={`${q.time}-${q.place}`}
              data-on={sameQuake(q, picked) || undefined}
              onMouseEnter={() => hover(q)}
              onMouseLeave={() => hover(null)}
            >
              <div>
                <span className={s.i}>{p2(i + 1)}</span>
                <button
                  type="button"
                  className={s.padb}
                  aria-pressed={sameQuake(q, picked)}
                  onFocus={() => hover(q)}
                  onBlur={() => hover(null)}
                  onClick={() => globeBus.set({ quakePick: { quake: q, focus: true } })}
                >
                  <b>{q.place}</b>
                  <small>{meta(q)}</small>
                  <span className="vh">, magnitude {q.mag.toFixed(1)}. Show on the globe</span>
                </button>
                <span className={`${s.v} ${q.mag >= 6 ? s.r : ""}`} aria-hidden="true">
                  M{q.mag.toFixed(1)}
                </span>
              </div>
            </li>
          ) : (
            <Row
              key={`${q.time}-${q.place}`}
              n={i + 1}
              href={q.url}
              title={q.place}
              meta={meta(q)}
              value={`M${q.mag.toFixed(1)}`}
              red={q.mag >= 6}
            />
          ),
        )}
      </List>
      <Note>
        {o.globes
          ? "Pick one to see it on the LF-01 globe."
          : "Also marked in orange on the LF-01 globe."}
      </Note>
    </>
  );
}

export function Events({ data }: { data: NaturalEvent[] }) {
  const now = useNow(30_000);
  return (
    <List>
      {data.map((e, i) => (
        <Row
          key={e.title}
          n={i + 1}
          href={e.url}
          title={e.title}
          meta={
            <>
              {e.category}
              {e.date && (
                <>
                  {" "}
                  &middot; <Ago t={Date.parse(e.date)} now={now} />
                </>
              )}
            </>
          }
          value={e.magnitude}
        />
      ))}
    </List>
  );
}
