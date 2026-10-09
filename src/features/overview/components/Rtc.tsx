"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import s from "./Overview.module.css";

const CAREER_START = new Date("2017-09-01T09:00:00");
const p2 = (n: number) => String(n).padStart(2, "0");

/** Real-time clock card: live clock, a 32.768 kHz crystal wave, career uptime and session time. */
export function Rtc() {
  const [clock, setClock] = useState<{ now: Date; t0: number } | null>(null);
  const now = clock?.now ?? null;
  const waveRef = useRef<SVGPathElement>(null);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const t0 = Date.now();
    const tick = () => setClock({ now: new Date(), t0 });
    tick();
    const iv = setInterval(tick, 1000);
    const wave = waveRef.current;
    let raf = 0;
    let vis = false;
    let ph = 0;
    const draw = () => {
      let d = "";
      for (let x = 0; x <= 150; x += 3)
        d += `${x ? "L" : "M"}${x} ${(28 + 18 * Math.sin(x / 9 + ph)).toFixed(1)}`;
      wave?.setAttribute("d", d);
    };
    const loop = () => {
      ph -= 0.12;
      draw();
      raf = vis && !document.hidden ? requestAnimationFrame(loop) : 0;
    };
    draw();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver((e) => {
      vis = e[0]?.isIntersecting ?? false;
      if (vis && !raf && !reduce) raf = requestAnimationFrame(loop);
    });
    if (cardRef.current) io.observe(cardRef.current);
    return () => {
      clearInterval(iv);
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, []);

  let uptime = "\u2014";
  let session = "0 s";
  let tz = "\u2014";
  if (clock && now) {
    const days = Math.floor((now.getTime() - CAREER_START.getTime()) / 864e5);
    const y = Math.floor(days / 365.25);
    uptime = `${y}y ${Math.floor(days - y * 365.25)}d ${p2(now.getHours())}h`;
    const sec = Math.floor((now.getTime() - clock.t0) / 1000);
    session = sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)} m ${p2(sec % 60)} s`;
    tz =
      Intl.DateTimeFormat().resolvedOptions().timeZone?.split("/").pop()?.replace(/_/g, " ") ||
      "local";
  }

  return (
    <Card
      ref={cardRef}
      className={s.wide}
      code="RTC"
      meta="Real-time clock · 32.768 kHz"
      title="Always on time"
    >
      <div className={s.rtc}>
        <div>
          <div className={s.clock} aria-hidden="true">
            {now ? p2(now.getHours()) : "00"}
            <span className={s.col}>:</span>
            {now ? p2(now.getMinutes()) : "00"}
            <span className={s.col}>:</span>
            <span className={s.ss}>{now ? p2(now.getSeconds()) : "00"}</span>
          </div>
          <p className={s.date}>
            {now?.toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>
        <div>
          <svg className={s.xtal} viewBox="0 0 150 56" aria-hidden="true">
            <path className={s.gr} d="M0 28H150M37.5 0V56M75 0V56M112.5 0V56" />
            <path ref={waveRef} d="" />
          </svg>
          <p className={s.xcap}>XTAL &middot; 32.768 kHz</p>
        </div>
      </div>
      <p>
        Keeps time while everything else sleeps. Career uptime counts from the first commit in 2017.
      </p>
      <div className={s.regs}>
        <div>
          <small>CAREER UPTIME</small>
          {uptime}
        </div>
        <div>
          <small>THIS SESSION</small>
          {session}
        </div>
        <div>
          <small>TIMEZONE</small>
          {tz}
        </div>
      </div>
    </Card>
  );
}
