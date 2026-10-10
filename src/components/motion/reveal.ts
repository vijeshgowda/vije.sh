/**
 * Scroll reveals (prototype `reveal`) and the number scramble (`scramble`). Content is server
 * rendered and visible without JavaScript; only elements still below the fold when the page
 * mounts are hidden, then faded and lifted in as they scroll into view.
 */

export type RevealOptions = {
  /** Reveal the element itself instead of each of its children */
  self?: boolean;
  /** Also draw the element's red ::after rule (section headings) */
  rule?: boolean;
};

const STEP_MS = 70;
const MAX_STEPS = 8;
const EASE = "cubic-bezier(.2,.8,.2,1)";

export const revealDelay = (index: number) => Math.min(index, MAX_STEPS) * STEP_MS;

export function prefersReducedMotion(): boolean {
  // no matchMedia (tests, very old browsers): treat as reduced, content stays put
  return typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Rolls an all-digit text node through random digits before settling; returns a stop function. */
export function scramble(el: Element, random: () => number = Math.random): () => void {
  const node = el.childNodes.length === 1 ? el.firstChild : null;
  const final = node?.nodeType === Node.TEXT_NODE ? (node.nodeValue ?? "") : "";
  if (!node || !/^\d+$/.test(final)) return () => {};
  let n = 0;
  // writes the existing text node (not textContent) so React keeps its reference to it
  const stop = () => {
    clearInterval(iv);
    node.nodeValue = final;
  };
  const iv = setInterval(() => {
    if (++n > 12) return stop();
    node.nodeValue = final.replace(/\d/g, () => String(Math.floor(random() * 10)));
  }, 45);
  return stop;
}

export function setupReveal(root: HTMLElement, { self = false, rule = false }: RevealOptions = {}) {
  if (prefersReducedMotion()) return () => {};
  const targets = self ? [root] : (Array.from(root.children) as HTMLElement[]);
  const delays = new Map<HTMLElement, number>();
  targets.forEach((el, i) => {
    // already on screen (or hidden): leave it alone so the first paint never flickers
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.style.opacity = "0";
    delays.set(el, revealDelay(i));
  });
  if (!delays.size) return () => {};

  const stops: (() => void)[] = [];
  const show = (el: HTMLElement, delay: number) => {
    el.style.opacity = "";
    el.animate?.(
      [
        { opacity: 0, translate: "0 18px" },
        { opacity: 1, translate: "0 0" },
      ],
      { duration: 650, delay, easing: EASE, fill: "backwards" },
    );
    if (rule) {
      el.animate?.([{ width: "0" }, { width: "4rem" }], {
        pseudoElement: "::after",
        duration: 1000,
        delay: delay + 200,
        easing: "cubic-bezier(.6,0,.2,1)",
        fill: "backwards",
      });
    }
    const nums = [el, ...el.querySelectorAll("[data-scramble]")].filter((n) =>
      n.matches("[data-scramble]"),
    );
    nums.forEach((n) => stops.push(scramble(n)));
  };

  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target as HTMLElement;
        io.unobserve(el);
        show(el, delays.get(el) ?? 0);
        delays.delete(el);
      }),
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
  );
  delays.forEach((_, el) => io.observe(el));

  return () => {
    io.disconnect();
    delays.forEach((_, el) => (el.style.opacity = ""));
    stops.forEach((s) => s());
  };
}
