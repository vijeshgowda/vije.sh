"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { createStoredValue } from "@/lib/stored-value";
import { uart } from "@/lib/uart";
import { identity } from "@/content/profile";
import s from "./Hero.module.css";

const TAGS = [
  identity.tagline,
  "Firmware by night, backends by day.",
  "Small models, big ideas, tiny RAM.",
  "Built from the bootloader up.",
  "Compiles first try. Sometimes.",
];

/** Firmware version: each flash patches the tagline */
const fw = createStoredValue<number>("fw", 0, (v) =>
  Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0,
);

export function Tagline({ className }: { className?: string }) {
  const v = fw.use();
  return (
    <p className={className} aria-live="polite">
      {TAGS[v % TAGS.length]}
    </p>
  );
}

export function Firmware({
  className = "",
  wordmarkId,
}: {
  className?: string;
  wordmarkId: string;
}) {
  const v = fw.use();
  const [busy, setBusy] = useState(false);
  const barRef = useRef<HTMLElement>(null);

  const flash = () => {
    const bar = barRef.current;
    if (!bar || busy) return;
    setBusy(true);
    const t0 = performance.now();
    const D = matchMedia("(prefers-reduced-motion: reduce)").matches ? 300 : 1800;
    let lastA = -1;
    uart("flash: erasing 0x10000..0x30000");
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / D);
      const a = Math.floor(p * 6);
      bar.style.width = `${p * 100}%`;
      if (a !== lastA && a < 6) {
        lastA = a;
        uart(`flash: write 0x${(0x10000 + a * 0x5000).toString(16)} ${Math.round(p * 100)}%`);
      }
      if (p < 1) return void requestAnimationFrame(step);
      fw.set(v + 1);
      setBusy(false);
      const wm = document.getElementById(wordmarkId);
      if (wm) {
        wm.classList.remove(s.reflash!);
        void wm.offsetWidth;
        wm.classList.add(s.reflash!);
      }
      uart(`fw: v30.1.${v + 1} booted. tagline patched.`);
      setTimeout(() => (bar.style.width = "0"), 700);
    };
    requestAnimationFrame(step);
  };

  return (
    <div className={`${s.fw} ${className}`}>
      <span className={s.mutet}>FIRMWARE</span>
      <b>v30.1.{v}</b>
      <span className={s.fwbar} aria-hidden="true">
        <i ref={barRef} />
      </span>
      <Button size="sm" disabled={busy} onClick={flash}>
        Flash v30.1.{v + 1}
      </Button>
    </div>
  );
}
