"use client";

import { type Ref, useEffect, useRef, useState } from "react";
import { storage } from "@/lib/storage";
import { uart } from "@/lib/uart";
import { countsAsTyping, landed, launch, typed, useLaunching } from "../launch";
import s from "./Launch.module.css";

const COUNT = ["T-3", "T-2", "T-1", "Liftoff"];
const STEP_MS = 650;
const LIFTOFF_MS = 1950;
const REDUCED_MS = 1400;

function Rocket({ className, ref }: { className: string; ref: Ref<SVGSVGElement> }) {
  return (
    <svg ref={ref} className={className} viewBox="0 0 60 180" aria-hidden="true">
      <g className={s.flame}>
        <path d="M19 132 Q30 182 41 132Z" fill="var(--red)" />
        <path d="M24 132 Q30 160 36 132Z" fill="#fff" />
      </g>
      <path d="M30 2 Q45 20 45 42 H15 Q15 20 30 2Z" fill="var(--red)" />
      <rect
        x="15"
        y="42"
        width="30"
        height="80"
        fill="var(--bg)"
        stroke="var(--ink)"
        strokeWidth="2"
      />
      <circle cx="30" cy="64" r="6" fill="var(--bg)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M15 92 L3 126 L15 122Z M45 92 L57 126 L45 122Z" fill="var(--red)" />
      <path d="M21 122 H39 L42 132 H18Z" fill="var(--ink)" />
      <text
        x="30"
        y="104"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="7"
        fontWeight="700"
        fill="var(--ink)"
        writingMode="tb"
      >
        VKG
      </text>
    </svg>
  );
}

/** Countdown, smoke, a screen shake and a rocket off the top of the screen (prototype `launch`). */
function Flight() {
  const [count, setCount] = useState("");
  const [lit, setLit] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLDivElement>(null);
  const rocket = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, f: () => void) => timers.push(setTimeout(f, ms));
    let stopped = false;
    uart("launch: sequence start. T-3.");

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      after(0, () => setCount("Liftoff"));
      after(REDUCED_MS, () => {
        uart("launch: nominal.");
        landed();
      });
      return () => timers.forEach(clearTimeout);
    }

    COUNT.forEach((t, i) =>
      after(i * STEP_MS, () => {
        setCount(t);
        countRef.current?.animate?.(
          [
            { opacity: 0, scale: 1.4 },
            { opacity: 1, scale: 1 },
          ],
          { duration: 280, easing: "ease-out" },
        );
      }),
    );

    const finish = () => {
      if (stopped) return;
      const n = storage.get<number>("launches", 0) + 1;
      storage.set("launches", n);
      uart(`launch: nominal. orbit reached (probably). flights: ${n}`);
      const fade = overlay.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], {
        duration: 400,
        fill: "forwards",
      });
      if (fade) fade.onfinish = landed;
      else landed();
    };

    after(LIFTOFF_MS, () => {
      setLit(true);
      const ov = overlay.current;
      for (let i = 0; ov && i < 16; i++) {
        const p = document.createElement("span");
        p.className = s.puff!;
        ov.append(p);
        const dx = (Math.random() - 0.5) * 520;
        const size = 0.6 + Math.random() * 1.6;
        p.animate?.(
          [
            { transform: "translate(0,0) scale(.3)", opacity: 0.7 },
            {
              transform: `translate(${dx}px,${-20 - Math.random() * 90}px) scale(${size})`,
              opacity: 0,
            },
          ],
          {
            duration: 1400 + Math.random() * 900,
            delay: i * 40,
            easing: "ease-out",
            fill: "forwards",
          },
        );
      }
      document
        .getElementById("main")
        ?.animate?.(
          [
            { transform: "translate(0,0)" },
            { transform: "translate(-2px,1px)" },
            { transform: "translate(2px,-1px)" },
            { transform: "translate(0,0)" },
          ],
          { duration: 90, iterations: 7 },
        );
      const climb = rocket.current?.animate?.(
        [
          { transform: "translate(-50%,0)" },
          { transform: "translate(-50%,6px)", offset: 0.08 },
          { transform: "translate(-50%,-130vh)" },
        ],
        { duration: 2600, easing: "cubic-bezier(.55,0,.85,.55)", fill: "forwards" },
      );
      if (climb) climb.onfinish = finish;
      else finish();
    });

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div ref={overlay} className={s.launch}>
      <div ref={countRef} className={s.count} role="status">
        {count}
      </div>
      <Rocket className={`${s.rocket} ${lit ? s.go : ""}`} ref={rocket} />
    </div>
  );
}

/** Mount once per page: listens for the typed word and shows the flight while one is active. */
export function Launch() {
  const flying = useLaunching();

  useEffect(() => {
    let buffer = "";
    const onKey = (e: KeyboardEvent) => {
      if (!countsAsTyping(e)) return;
      const r = typed(buffer, e.key);
      buffer = r.buffer;
      if (r.hit) launch();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return flying ? <Flight /> : null;
}
