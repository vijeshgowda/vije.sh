"use client";

import { type CSSProperties, useState } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { uart } from "@/lib/uart";
import { labPrefs } from "../prefs";
import {
  BITS,
  type Bits,
  bitsLabel,
  cellFill,
  FITS,
  formatGb,
  gigabytes,
  type LabState,
  PARAMS,
  sizing,
} from "../sizing";
import s from "./Lab.module.css";

const CELLS = Array.from({ length: 16 }, (_, k) => k);

/** Lab section 8 (prototype `pLab`/`mountLab`): parameter slider, bit width, register, bars, fits. */
export function MemoryLab() {
  const st = labPrefs.use();
  // counters remount the animated nodes so each change replays its keyframes
  const [bump, setBump] = useState(0);
  const [flip, setFlip] = useState(0);
  const r = sizing(st.p, st.b);
  const text = formatGb(r.gb);

  const update = (next: LabState) => {
    if (formatGb(gigabytes(next.p, next.b)) !== text) setBump((n) => n + 1);
    labPrefs.set(next);
  };
  const pick = (b: Bits) => {
    update({ ...st, b });
    setFlip((n) => n + 1);
    uart(`npu: requantised to ${b} bits`);
  };

  return (
    <div className={s.lab}>
      <div>
        <div className={s.eq}>
          M<sub>GB</sub> = P<sub>B</sub> &times; b &divide; 8
        </div>
        <label className={s.rng} htmlFor="lab-params">
          <span>Parameters</span>
          <span>
            <output htmlFor="lab-params">{st.p}</output> B
          </span>
        </label>
        <input
          className={s.range}
          type="range"
          id="lab-params"
          min={PARAMS.min}
          max={PARAMS.max}
          step={1}
          value={st.p}
          onChange={(e) => update({ ...st, p: Number(e.target.value) })}
        />
        <p className={`${s.rng} ${s.rngGap}`}>
          <span>Bits per weight (b)</span>
        </p>
        <div className={s.bits} role="group" aria-label="Bits per weight">
          {BITS.map((b) => (
            <button key={b} type="button" aria-pressed={b === st.b} onClick={() => pick(b)}>
              {bitsLabel(b)}
            </button>
          ))}
        </div>
        <div className={s.big} aria-live="polite">
          <span key={bump} className={bump ? s.bump : undefined} data-testid="lab-gb">
            {text}
          </span>
          <small>GB</small>
        </div>
        <p className={s.note}>{r.note}</p>
      </div>
      <div>
        <p className={s.mini}>Bits used per 16-bit word</p>
        <div className={s.reg} aria-hidden="true">
          {CELLS.map((k) => (
            <i
              key={`${flip}-${k}`}
              className={flip ? s.flip : undefined}
              style={
                {
                  "--f": cellFill(st.b, k),
                  animationDelay: `${k * 22}ms`,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <div className={s.reglbl} aria-hidden="true">
          <span>bit 0</span>
          <span>bit 15</span>
        </div>
        <p className={`${s.mini} ${s.miniGap}`}>Same model at every bit width</p>
        <Reveal className={s.bars}>
          {BITS.map((b) => (
            <div key={b} className={`${s.bar} ${b === st.b ? s.on : ""}`}>
              <span>{b}-bit</span>
              <span className={s.tr}>
                <i style={{ width: `${(b / 16) * 100}%` }} />
              </span>
              <span className={s.v}>{formatGb(gigabytes(st.p, b))} GB</span>
            </div>
          ))}
        </Reveal>
        <p className={`${s.mini} ${s.miniGap}`} id="lab-fits">
          Fits in
        </p>
        <ul className={s.fits} aria-labelledby="lab-fits">
          {FITS.map((f) => {
            const ok = r.gb <= f.gb;
            return (
              <li key={f.name} className={ok ? s.ok : undefined}>
                {f.name}
                <span className="sr-only">{ok ? ": fits" : ": too small"}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
