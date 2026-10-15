/** Midnight UK time on release day: 19 Nov 2026 is after BST ends, so 00:00 GMT = 00:00 UTC. */
export const GTA6_RELEASE = Date.UTC(2026, 10, 19);

export interface Countdown {
  done: boolean;
  d: number;
  h: number;
  m: number;
  s: number;
}

/** Whole days, hours, minutes and seconds left until `target`; all zero once it has passed. */
export function countdown(target: number, now: number): Countdown {
  const left = Math.max(0, Math.floor((target - now) / 1000));
  return {
    done: left === 0,
    d: Math.floor(left / 86400),
    h: Math.floor(left / 3600) % 24,
    m: Math.floor(left / 60) % 60,
    s: left % 60,
  };
}
