"use client";

import { useState } from "react";
import { career } from "@/content/profile";
import { timingLayout } from "../timing";
import s from "./Work.module.css";

/** Career as a timing diagram plus the same data as a table; hovering or focusing a row lights its signal. */
export function CareerTiming({ nowYear }: { nowYear: number }) {
  const [hi, setHi] = useState(-1);
  const t = timingLayout(career, nowYear);

  return (
    <>
      <div
        className={s.tim}
        tabIndex={0}
        role="region"
        aria-label="Career timing diagram, same data as the table below"
      >
        <svg className={s.timing} viewBox={`0 0 ${t.width} ${t.height}`} aria-hidden="true">
          {t.years.map(({ year, x }) => (
            <g key={year}>
              <line className={s.g} x1={x} y1={t.top - 6} x2={x} y2={t.height - 4} />
              <text className={s.yr} x={x} y={t.top - 12} textAnchor="middle">
                {year}
              </text>
            </g>
          ))}
          <text className={s.lbl} x={0} y={t.top + 28}>
            CLK
          </text>
          <path className={`${s.w} ${s.clk}`} pathLength={1} d={t.clock} />
          {t.signals.map((g, i) => (
            <g key={g.label} className={hi === i ? s.hi : undefined} data-signal={i}>
              <text className={s.lbl} x={0} y={g.labelY}>
                {g.label}
              </text>
              <path
                className={s.w}
                pathLength={1}
                style={{ animationDelay: `${0.15 + i * 0.15}s` }}
                d={g.d}
              />
            </g>
          ))}
          <line className={s.now} x1={t.nowX} y1={t.top - 4} x2={t.nowX} y2={t.height - 4} />
          <text className={s.nowt} x={t.nowX - 4} y={t.height - 8} textAnchor="end">
            now
          </text>
        </svg>
      </div>
      <div className={s.tw} tabIndex={0} role="region" aria-label="Career table">
        <table className={s.tbl}>
          <thead>
            <tr>
              <th scope="col">Signal</th>
              <th scope="col">Role</th>
              <th scope="col">
                t<sub>rise</sub>
              </th>
              <th scope="col">
                t<sub>fall</sub>
              </th>
            </tr>
          </thead>
          <tbody>
            {career.map((c, i) => (
              <tr
                key={c.org}
                tabIndex={0}
                onMouseEnter={() => setHi(i)}
                onFocus={() => setHi(i)}
                onMouseLeave={() => setHi(-1)}
                onBlur={() => setHi(-1)}
              >
                <td>
                  <b>{c.org}</b>
                </td>
                <td>
                  {c.role}
                  <br />
                  <span className={s.note}>{c.note}</span>
                </td>
                <td className={s.n}>{c.from}</td>
                <td className={c.to === "now" ? `${s.n} ${s.r}` : s.n}>{c.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.fn}>Career entries and starred figures are placeholders until launch.</p>
    </>
  );
}
