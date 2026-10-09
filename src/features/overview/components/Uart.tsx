"use client";

import { useEffect } from "react";
import { bootUart, useUart } from "@/lib/uart";
import s from "./Hero.module.css";

const BOOT = [
  "ESP-ROM:vkg04-20261006",
  "vije.sh bootloader v30.1",
  "psram: 8 yrs experience mapped",
  "fs: mounted /blog",
  "k8s: 3/3 nodes Ready",
  "rtc: 32.768 kHz xtal locked",
  "net: link up, https only",
  "ready.",
];

export function Uart() {
  const { lines, seq } = useUart();
  useEffect(() => {
    bootUart(BOOT, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 240);
  }, []);
  const shown = lines.slice(-8);
  return (
    <div className={s.uart}>
      <div className={s.uartH}>
        <span>UART0 &middot; /dev/ttyVKG0</span>
        <span>115200 8N1</span>
      </div>
      <pre aria-live="off">
        {shown.map((l, i) => (
          <span key={seq - shown.length + i} className={i === shown.length - 1 ? s.new : undefined}>
            {l}
          </span>
        ))}
      </pre>
    </div>
  );
}
