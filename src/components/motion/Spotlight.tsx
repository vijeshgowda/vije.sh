"use client";

import { useEffect } from "react";

/**
 * Card spotlight (prototype `spotlight`): one delegated listener feeds the pointer position to any
 * `[data-spotlight]` element as --mx / --my; its CSS draws the glow. Fine pointers only.
 */
export function Spotlight() {
  useEffect(() => {
    if (typeof matchMedia !== "function" || !matchMedia("(pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>("[data-spotlight]");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
  return null;
}
