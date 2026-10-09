"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Fits the wordmark to the hero column: full width on mobile, capped at max(152px, 11vw) on
 * desktop. CSS gives a close first paint; this corrects it once fonts load.
 */
export function Wordmark({
  id,
  className,
  innerClassName,
  children,
}: {
  id: string;
  className: string;
  innerClassName: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const wm = ref.current;
    const inner = wm?.firstElementChild as HTMLElement | null;
    if (!wm || !inner) return;
    const fit = () => {
      wm.style.fontSize = "100px";
      const avail = wm.clientWidth - parseFloat(getComputedStyle(wm).paddingRight);
      const w = inner.getBoundingClientRect().width;
      if (!w) return;
      const fs = ((100 * avail) / w) * 0.995;
      const desktop = matchMedia("(min-width: 48rem)").matches;
      wm.style.fontSize = `${desktop ? Math.min(Math.max(152, innerWidth * 0.11), fs) : fs}px`;
    };
    fit();
    void document.fonts?.ready.then(() => wm.isConnected && fit());
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);
  return (
    <h1 ref={ref} id={id} className={className} tabIndex={-1} aria-label="vije.sh">
      <span className={innerClassName} aria-hidden="true">
        {children}
      </span>
    </h1>
  );
}
