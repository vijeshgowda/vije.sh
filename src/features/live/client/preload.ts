/**
 * Best-effort warm-up of another page's data while the visitor is still reading this one (the
 * overview's hero runs for about 1.5 s). Runs once per page load, when the browser is idle, and
 * never on data-saver connections.
 */

type Connection = { saveData?: boolean; effectiveType?: string };

/** Data saver, a 2G connection or `prefers-reduced-data`: don't spend bytes on a maybe */
export function wantsLessData(nav: Navigator | undefined = globalThis.navigator): boolean {
  const c = (nav as (Navigator & { connection?: Connection }) | undefined)?.connection;
  if (c?.saveData || /(^|-)2g$/.test(c?.effectiveType ?? "")) return true;
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-data: reduce)").matches;
}

/** requestIdleCallback with a deadline, or a timeout where it's missing (Safari); returns cancel */
export function whenIdle(fn: () => void, timeout = 2000): () => void {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(fn, { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(fn, Math.min(timeout, 500));
  return () => clearTimeout(id);
}

/**
 * Returns a scheduler that runs its tasks once, when idle. Cancelling before they start (an effect
 * cleanup, including React's dev double-mount) leaves it free to schedule again; once started it
 * never runs again. Task failures are swallowed.
 */
export function createPreload() {
  let started = false;
  return function schedule(tasks: (() => unknown)[], timeout?: number): () => void {
    if (started || wantsLessData()) return () => {};
    return whenIdle(() => {
      if (started) return;
      started = true;
      for (const task of tasks) {
        try {
          void Promise.resolve(task()).catch(() => {});
        } catch {
          // a warm-up must never break the page
        }
      }
    }, timeout);
  };
}
