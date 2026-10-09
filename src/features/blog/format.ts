const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-05" -> "5 Oct 2026", independent of the runtime's locale data. */
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Application note number: the oldest post is AN-001, so numbers never change as posts are added. */
export function noteId(index: number, total: number): string {
  return `AN-${String(total - index).padStart(3, "0")}`;
}
