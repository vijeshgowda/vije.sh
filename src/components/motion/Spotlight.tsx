"use client";

import { useEffect } from "react";

/**
 * Card spotlight (prototype `spotlight`): one delegated listener moves the `[data-spot]` glow inside
 * the `[data-spotlight]` element under the pointer. Transform only: no inherited custom properties,
 * so nothing else restyles or repaints. Fine pointers only.
 */
export function Spotlight() {
  useEffect(() => {
    if (typeof matchMedia !== "function" || !matchMedia("(pointer: fine)").matches) return;
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.<HTMLElement>("[data-spotlight]");
      const spot = el?.querySelector<HTMLElement>(":scope > [data-spot]");
      if (!el || !spot) return;
      const r = el.getBoundingClientRect();
      spot.style.transform = `translate(${e.clientX - r.left}px, ${e.clientY - r.top}px)`;
    };
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
  return null;
}
