"use client";

import { useEffect, useRef } from "react";
import s from "./Post.module.css";

/** Reading progress bar along the top of the window (prototype `mountPost`). */
export function ReadProgress() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const on = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = `${(max > 0 ? Math.min(1, window.scrollY / max) : 1) * 100}%`;
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return <div ref={ref} className={s.prog} aria-hidden="true" />;
}
