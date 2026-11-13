"use client";

import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { useNow } from "@/features/live/client/use-now";
import { countdown, localRelease, type LocalRelease } from "../countdown";
import s from "./Overview.module.css";

const p2 = (n: number) => String(n).padStart(2, "0");

let release: LocalRelease | undefined;

/**
 * One-shot timer card counting down to GTA VI, computed in the browser (no requests). It fires at
 * midnight in the visitor's own time zone; the country is looked up from that zone, not their IP.
 */
export function GtaCountdown() {
  const now = useNow(1000);
  // null until hydrated, so prerendered HTML never depends on the server's time zone
  const r = now === null ? null : (release ??= localRelease());
  const c = r && now !== null ? countdown(r.at, now) : null;
  const where = r?.country ?? "your time zone";
  const cells: [string, string][] = [
    ["DAYS", c ? String(c.d) : "--"],
    ["HRS", c ? p2(c.h) : "--"],
    ["MIN", c ? p2(c.m) : "--"],
    ["SEC", c ? p2(c.s) : "--"],
  ];

  return (
    <Card
      className={s.full}
      code="TIM"
      meta={c?.done ? "Timer · fired" : "Timer · one-shot"}
      title="Grand Theft Auto VI"
    >
      <div className={s.gta}>
        <Image
          className={s.gtalogo}
          src="/overview/gta-vi-logo.svg"
          width={980}
          height={744}
          alt=""
          unoptimized
        />
        <div className={s.cdn} aria-hidden="true">
          {cells.map(([label, value], i) => (
            <div key={label}>
              <span className={`${s.clock} ${i === 3 ? s.ss : ""}`}>{value}</span>
              <small>{label}</small>
            </div>
          ))}
        </div>
      </div>
      <p className="vh">
        {c?.done
          ? "Grand Theft Auto VI is out."
          : c
            ? `${c.d} days, ${c.h} hours and ${c.m} minutes to go until midnight in ${where}.`
            : null}
      </p>
      <p>
        {c?.done ? (
          <>
            Fired at midnight your local time in <strong>{where}</strong>. It&rsquo;s out.
          </>
        ) : (
          <>
            Armed after two delays; fires at midnight your local time on release day
            {r && (
              <>
                {" "}
                in <strong>{where}</strong>
              </>
            )}
            .
          </>
        )}
      </p>
      <div className={s.regs}>
        <div>
          <small>RELEASE</small>
          Thu 19 Nov 2026
        </div>
        <div>
          <small>FIRES AT</small>
          {r ? `00:00 ${r.offset}` : "00:00 local"}
        </div>
        <div>
          <small>PLATFORMS</small>
          PS5 &middot; Xbox Series X|S
        </div>
      </div>
    </Card>
  );
}
