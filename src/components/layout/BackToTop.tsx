"use client";

import { useEffect, useState } from "react";
import styles from "./BackToTop.module.css";

/** Floating "Top" button: shown after 1.5 screens of scrolling, hidden while the footer is visible. */
export function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let footVisible = false;
    const update = () => setShow(!footVisible && window.scrollY >= window.innerHeight * 1.5);
    const foot = document.querySelector("footer");
    const io = new IntersectionObserver(([e]) => {
      footVisible = !!e?.isIntersecting;
      update();
    });
    if (foot) io.observe(foot);
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const toTop = () => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    document.getElementById("main")?.focus({ preventScroll: true });
  };

  return (
    <button type="button" className={styles.top} hidden={!show} onClick={toTop}>
      <span aria-hidden="true">&uarr;</span> Top
    </button>
  );
}
