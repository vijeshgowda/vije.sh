"use client";

import { useEffect, useRef, type HTMLAttributes, type RefObject } from "react";
import { setupReveal, type RevealOptions } from "./reveal";

/** Reveals `ref`'s children (or the element itself with `self`) as they scroll into view. */
export function useReveal(ref: RefObject<HTMLElement | null>, { self, rule }: RevealOptions = {}) {
  useEffect(() => {
    const el = ref.current;
    return el ? setupReveal(el, { self, rule }) : undefined;
  }, [ref, self, rule]);
}

type Tag = "div" | "ul" | "ol" | "tbody" | "section";

/** Server-component friendly wrapper: renders `as` (div by default) and reveals it on scroll. */
export function Reveal({
  as: As = "div",
  self,
  rule,
  ...rest
}: HTMLAttributes<HTMLElement> & RevealOptions & { as?: Tag }) {
  const ref = useRef<HTMLElement>(null);
  useReveal(ref, { self, rule });
  return <As ref={ref as RefObject<never>} {...rest} />;
}
