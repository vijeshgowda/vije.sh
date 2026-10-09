"use client";

import { useEffect } from "react";
import { SYNODIC, fmtDay, moonAt, moonPath, phaseName } from "../format";
import { useNow } from "../client/use-now";
import type { FeedStatus } from "./FeedCard";
import { Big, Note, Regs } from "./bodies/parts";
import s from "./Feeds.module.css";

/** LF-14. Computed locally from the mean synodic month; no requests. */
export function MoonFeed({ onStatus }: { onStatus: (s: FeedStatus) => void }) {
  const now = useNow(60_000);
  useEffect(() => onStatus({ kind: "computed" }), [onStatus]);
  if (now === null) return null;
  const m = moonAt(now);
  const when = (days: number) =>
    fmtDay(now + days * 864e5, { weekday: "short", day: "numeric", month: "short" });
  return (
    <>
      <div className={s.mwrap}>
        <svg className={s.moon} viewBox="-48 -48 96 96" aria-hidden="true">
          <circle r="40" className={s.mdk} />
          <path d={moonPath(m.e)} className={s.mlt} />
          <circle r="40" className={s.mrim} />
        </svg>
        <div>
          <Big value={`${Math.round(m.illum * 100)}%`}>lit</Big>
          <p className={s.mph}>
            {phaseName(m.age)} &middot; day {m.age.toFixed(1)}
          </p>
        </div>
      </div>
      <Regs
        items={[
          ["NEXT FULL", when((SYNODIC / 2 - m.age + SYNODIC) % SYNODIC)],
          ["NEXT NEW", when(SYNODIC - m.age)],
          ["REQUESTS", "0"],
        ]}
      />
      <Note>
        Mean synodic month counted from the new moon of 6 Jan 2000, good to about half a day. Drawn
        as seen from the northern hemisphere.
      </Note>
    </>
  );
}
