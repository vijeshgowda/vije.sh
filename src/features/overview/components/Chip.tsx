"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import s from "./Chip.module.css";

const LEFT: [Route, string][] = [
  ["/", "Overview"],
  ["/work", "Work"],
  ["/lab", "Lab"],
];
const RIGHT: [Route, string][] = [
  ["/photo", "Photo"],
  ["/blog", "Blog"],
  ["/forum", "Forum"],
];
const CS = [146, 164, 182, 200, 218, 236, 254];
const NETS = ["VCC", "CLK", "RST", "TX"];
const GND = ["GND", "RX", "SDA"];
const SVG_NS = "http://www.w3.org/2000/svg";

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const d = (n: number) => ({ "--d": `${n.toFixed(2)}s` }) as React.CSSProperties;

/**
 * The VKG-04 pinout: six labelled pins link to pages. On load the traces draw in, then red packets
 * travel along random traces (SMIL animateMotion); the chip tilts toward a fine pointer.
 */
export function Chip({ active = "/" }: { active?: Route }) {
  const router = useRouter();
  const ref = useRef<SVGSVGElement>(null);
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    const chip = ref.current;
    if (!chip || reduceMotion()) return;
    const t = setTimeout(() => setIntro(false), 2600);
    const send = (p: Element | null) => {
      const path = p?.getAttribute("d");
      if (!path) return;
      const c = document.createElementNS(SVG_NS, "circle");
      const m = document.createElementNS(SVG_NS, "animateMotion");
      c.setAttribute("r", "3");
      c.setAttribute("class", s.pkt!);
      m.setAttribute("dur", ".8s");
      m.setAttribute("path", path);
      m.setAttribute("fill", "freeze");
      m.setAttribute("begin", "indefinite");
      c.append(m);
      chip.append(c);
      (m as SVGAnimationElement).beginElement();
      setTimeout(() => c.remove(), 850);
    };
    const paths = [...chip.querySelectorAll(`.${s.tr}, .${s.trd}`)];
    let vis = true;
    const io = new IntersectionObserver((e) => {
      vis = e[0]?.isIntersecting ?? false;
    });
    io.observe(chip);
    const started = performance.now();
    const iv = setInterval(() => {
      if (vis && !document.hidden && performance.now() - started > 2600) {
        send(paths[Math.floor(Math.random() * paths.length)] ?? null);
      }
    }, 650);
    const pins = [...chip.querySelectorAll(`.${s.pin}`)];
    const onPin = (e: Event) => send((e.currentTarget as Element).querySelector(`.${s.tr}`));
    pins.forEach((a) => a.addEventListener("mouseenter", onPin));

    // tilt toward the pointer (fine pointers only)
    const host = chip.parentElement;
    const fine = matchMedia("(pointer: fine)").matches;
    const mv = (e: PointerEvent) => {
      if (!host) return;
      const r = host.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      chip.style.setProperty("--ry", `${(x * 10).toFixed(2)}deg`);
      chip.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
      chip.style.setProperty("--sx", `${(-x * 14).toFixed(1)}px`);
      chip.style.setProperty("--sy", `${(6 - y * 10).toFixed(1)}px`);
    };
    const out = () => ["--rx", "--ry", "--sx", "--sy"].forEach((p) => chip.style.removeProperty(p));
    if (fine && host) {
      host.addEventListener("pointermove", mv);
      host.addEventListener("pointerleave", out);
    }
    return () => {
      clearTimeout(t);
      clearInterval(iv);
      io.disconnect();
      pins.forEach((a) => a.removeEventListener("mouseenter", onPin));
      host?.removeEventListener("pointermove", mv);
      host?.removeEventListener("pointerleave", out);
    };
  }, []);

  // SVG <a> can't be a next/link, so route client-side by hand (modifier clicks still open tabs)
  const go = (href: Route) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    router.push(href);
  };

  const pin = (
    href: Route,
    label: string,
    n: number,
    c: number,
    side: "l" | "r",
    delay: number,
  ) => {
    const on = href === active;
    const cls = `${s.pin} ${on ? s.on : ""}`;
    return side === "l" ? (
      <a
        key={href}
        className={cls}
        href={href}
        aria-label={`P${n}: ${label}`}
        onClick={go(href)}
        style={d(delay)}
      >
        <rect className={s.hit} x="0" y={c - 18} width="130" height="28" />
        <rect className={s.stub} x="118" y={c - 3} width="12" height="6" />
        <path className={s.tr} pathLength={1} d={`M118 ${c} H34`} />
        <circle className={s.pad} cx="27" cy={c} r="6" />
        <text className={s.l} x="112" y={c - 6} textAnchor="end">
          {label.toUpperCase()}
        </text>
        <text className={s.pnum} x="136" y={c + 3}>
          P{n}
        </text>
      </a>
    ) : (
      <a
        key={href}
        className={cls}
        href={href}
        aria-label={`P${n}: ${label}`}
        onClick={go(href)}
        style={d(delay)}
      >
        <rect className={s.hit} x="270" y={c - 18} width="130" height="28" />
        <rect className={s.stub} x="270" y={c - 3} width="12" height="6" />
        <path className={s.tr} pathLength={1} d={`M282 ${c} H366`} />
        <circle className={s.pad} cx="373" cy={c} r="6" />
        <text className={s.l} x="288" y={c - 6}>
          {label.toUpperCase()}
        </text>
        <text className={s.pnum} x="264" y={c + 3} textAnchor="end">
          P{n}
        </text>
      </a>
    );
  };

  return (
    <svg
      ref={ref}
      className={`${s.chip} ${intro ? s.intro : ""} probe`}
      viewBox="0 0 400 400"
      role="group"
      aria-label="Pinout: each labelled pin links to a page"
    >
      {CS.map((c, k) => {
        const x = c + (k - 3) * 14;
        if (k % 2 === 0) {
          const y = 34 + ((k * 13) % 28);
          return (
            <g key={c}>
              <rect className={s.stub} x={c - 3} y="118" width="6" height="12" />
              <rect className={s.stub} x={c - 3} y="270" width="6" height="12" />
              <g style={d(k * 0.08)}>
                <path className={s.trd} pathLength={1} d={`M${c} 118 V104 L${x} 90 V${y + 6}`} />
                <circle className={s.via} cx={x} cy={y} r="5" />
                <text className={s.net} x={x} y={y - 9} textAnchor="middle">
                  {NETS[k / 2]}
                </text>
              </g>
              <rect className={s.stub} x="118" y={c - 3} width="12" height="6" />
              <rect className={s.stub} x="270" y={c - 3} width="12" height="6" />
            </g>
          );
        }
        const i = (k - 1) / 2;
        const y = 350 + ((k * 11) % 24);
        const [lh, ll] = LEFT[i]!;
        const [rh, rl] = RIGHT[i]!;
        return (
          <g key={c}>
            <rect className={s.stub} x={c - 3} y="118" width="6" height="12" />
            <rect className={s.stub} x={c - 3} y="270" width="6" height="12" />
            <g style={d(0.1 + k * 0.08)}>
              <path className={s.trd} pathLength={1} d={`M${c} 282 V296 L${x} 310 V${y - 6}`} />
              <circle className={s.via} cx={x} cy={y} r="5" />
              <text className={s.net} x={x} y={y + 16} textAnchor="middle">
                {GND[(k - 1) / 2]}
              </text>
            </g>
            {pin(lh, ll, i + 1, c, "l", 0.15 + i * 0.12)}
            {pin(rh, rl, i + 4, c, "r", 0.2 + i * 0.12)}
          </g>
        );
      })}
      <rect className={s.body} x="130" y="130" width="140" height="140" rx="6" />
      <circle className={s.p1} cx="146" cy="146" r="4" />
      <text className={s.ct} x="200" y="196" fontSize="24" fontWeight="700">
        VKG-04
      </text>
      <text className={s.ct} x="200" y="216" fontSize="11">
        vije.sh
      </text>
      <text className={s.ct} x="200" y="234" fontSize="8" opacity=".6">
        2641 &#183; RED &#183; e3
      </text>
      <path className={s.trd} pathLength={1} style={d(0.9)} d="M330 254 V300" />
      <circle className={s.led} cx="330" cy="310" r="7" />
      <text className={s.net} x="342" y="313">
        D1
      </text>
    </svg>
  );
}
