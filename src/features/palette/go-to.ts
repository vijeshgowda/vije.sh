"use client";

import type { Route } from "next";
import type { Action } from "./items";

type GoAction = Extract<Action, { type: "go" }>;

const TIMEOUT_MS = 5000;
const RESCROLL_MS = [400, 1000, 2000];

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Scrolls so `el` sits just below the sticky header. */
export function scrollToEl(el: HTMLElement, smooth: boolean) {
  const header = document.querySelector<HTMLElement>("header")?.offsetHeight ?? 0;
  const top = el.getBoundingClientRect().top + window.scrollY - header - 16;
  window.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
}

function ring(el: HTMLElement) {
  const red = getComputedStyle(document.documentElement).getPropertyValue("--red").trim();
  const on = `0 0 0 3px ${red || "#e30613"}`;
  el.animate?.(
    [{ boxShadow: on }, { boxShadow: on, offset: 0.3 }, { boxShadow: "0 0 0 0 transparent" }],
    {
      duration: 1600,
      easing: "ease",
    },
  );
}

function land(el: HTMLElement, action: GoAction, smooth: boolean) {
  scrollToEl(el, smooth);
  // content above can still grow (feeds, fonts) after a page change: re-aim until the visitor scrolls
  let moved = false;
  const stop = () => (moved = true);
  const events = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
  events.forEach((t) => window.addEventListener(t, stop, { once: true, passive: true }));
  RESCROLL_MS.forEach((ms) =>
    setTimeout(() => {
      if (!moved && el.isConnected) scrollToEl(el, false);
    }, ms),
  );
  setTimeout(
    () => events.forEach((t) => window.removeEventListener(t, stop)),
    RESCROLL_MS.at(-1)! + 50,
  );
  if (action.click) {
    if (!(el as HTMLButtonElement).disabled) el.click();
  } else if (!reduced()) ring(el);
}

/**
 * Prototype `goTo`: open a page, or a place on a page. With a selector it waits for the target page
 * to render the element (pages share ids, e.g. feed cards), scrolls to it, then clicks or rings it.
 */
export function goTo(push: (href: Route) => void, action: GoAction) {
  const here = window.location.pathname === action.href;
  if (!action.selector) {
    if (here) window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
    else push(action.href);
    return;
  }
  if (!here) push(action.href);
  const selector = action.selector;
  const t0 = performance.now();
  const poll = () => {
    const el =
      window.location.pathname === action.href
        ? document.querySelector<HTMLElement>(selector)
        : null;
    if (el) land(el, action, here && !reduced());
    else if (performance.now() - t0 < TIMEOUT_MS) requestAnimationFrame(poll);
  };
  poll();
}
