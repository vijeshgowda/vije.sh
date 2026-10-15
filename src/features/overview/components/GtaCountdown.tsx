"use client";

import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { useNow } from "@/features/live/client/use-now";
import { GTA6_RELEASE, countdown } from "../countdown";
import s from "./Overview.module.css";

const p2 = (n: number) => String(n).padStart(2, "0");

/** One-shot timer card counting down to GTA VI, computed in the browser (no requests). */
export function GtaCountdown() {
  const now = useNow(1000);
  const c = now === null ? null : countdown(GTA6_RELEASE, now);
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
            ? `${c.d} days, ${c.h} hours and ${c.m} minutes to go.`
            : null}
      </p>
      <p>
        {c?.done
          ? "Fired at midnight UK time. It's out."
          : "Armed after two delays; fires at midnight UK time on release day."}
      </p>
      <div className={s.regs}>
        <div>
          <small>RELEASE</small>
          Thu 19 Nov 2026
        </div>
        <div>
          <small>FIRES AT</small>
          00:00 UK (GMT)
        </div>
        <div>
          <small>PLATFORMS</small>
          PS5 &middot; Xbox Series X|S
        </div>
      </div>
    </Card>
  );
}
