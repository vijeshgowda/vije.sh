const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-05" -> "5 Oct 2026", independent of the runtime's locale data. */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * List order: newest date first. On the same day git posts come first, the later one (higher
 * publish number) on top, then notes by slug, so the order is total and stable.
 */
export function newestFirst(
  a: { date: string; slug: string; seq?: number },
  b: { date: string; slug: string; seq?: number },
): number {
  const bySeq = (b.seq ?? 0) - (a.seq ?? 0);
  return b.date.localeCompare(a.date) || bySeq || a.slug.localeCompare(b.slug);
}

/** Application note number: the oldest post is AN-001, so numbers never change as posts are added. */
export function noteId(index: number, total: number): string {
  return `AN-${String(total - index).padStart(3, "0")}`;
}
