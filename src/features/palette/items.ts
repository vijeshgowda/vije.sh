import type { Route } from "next";
import { PAGES } from "@/config/site";
import { isCategorySlug, parseThreadId, threadAddress, threadHref } from "@/features/forum/format";
import { FEEDS } from "@/features/live/catalog";

/**
 * Jump-to palette entries (prototype `palItems`): pages, overview sections, notes, feeds, commands,
 * then the latest forum threads (fetched when the palette opens).
 */

export type Group = "Page" | "Section" | "Note" | "Feed" | "Command" | "Thread";

export type CommandId = "theme" | "launch" | "copy" | "feeds" | "top";

export type Action =
  | {
      type: "go";
      href: Route;
      selector?: string;
      click?: boolean;
      showAllFeeds?: boolean;
      document?: true;
    }
  | { type: "run"; command: CommandId };

export interface PaletteItem {
  group: Group;
  /** Short code in the first column: P1, §2, AN-003, LF-07, PWR, 0x2A... */
  code: string;
  title: string;
  sub: string;
  action: Action;
}

export interface PaletteNote {
  id: string;
  slug: string;
  title: string;
  category: string;
  date: string;
}

/** A recently active forum thread, as served by /api/palette/threads */
export interface PaletteThread {
  id: string;
  title: string;
  slug: string;
  category: string;
  /** Last activity, "2026-10-05" */
  date: string;
}

/** Threads the palette fetches when it opens (application.md 7: bounded, cached on the server) */
export const PALETTE_THREADS = 50;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isThread(v: unknown): v is PaletteThread {
  if (typeof v !== "object" || v === null) return false;
  const { id, title, slug, category, date } = v as Record<string, unknown>;
  return (
    typeof id === "string" &&
    parseThreadId(id) !== null &&
    typeof title === "string" &&
    typeof slug === "string" &&
    isCategorySlug(slug) &&
    typeof category === "string" &&
    typeof date === "string" &&
    DAY.test(date)
  );
}

/** The /api/palette/threads body, keeping only well-formed entries; [] for anything else. */
export function readThreads(body: unknown): PaletteThread[] {
  const list = (body as { threads?: unknown } | null)?.threads;
  if (!Array.isArray(list)) return [];
  return list
    .filter(isThread)
    .slice(0, PALETTE_THREADS)
    .map(({ id, title, slug, category, date }) => ({ id, title, slug, category, date }));
}

export const SECTIONS = [
  ["features", "Features"],
  ["cluster", "Cluster"],
  ["telemetry", "Live telemetry"],
  ["peripherals", "Peripherals"],
  ["notes", "Latest application notes"],
  ["ratings", "Absolute maximum ratings"],
] as const;

export function buildItems({
  notes,
  threads = [],
  pinned,
  dark,
  path,
  formatDate,
}: {
  notes: PaletteNote[];
  threads?: PaletteThread[];
  pinned: readonly string[];
  dark: boolean;
  path: string;
  formatDate: (iso: string) => string;
}): PaletteItem[] {
  const pages = PAGES.map<PaletteItem>((p) => ({
    group: "Page",
    code: p.code,
    title: p.label,
    sub: p.description,
    action: { type: "go", href: p.href },
  }));
  const labTools: PaletteItem[] = [
    {
      group: "Page",
      code: "RTC",
      title: "Omni",
      sub: "Encrypted calls, chat and file transfer",
      action: { type: "go", href: "/lab/omni", document: true },
    },
  ];
  const sections = SECTIONS.map<PaletteItem>(([id, title], i) => ({
    group: "Section",
    code: `\u00a7${i + 1}`,
    title,
    sub: "Overview",
    action: { type: "go", href: "/", selector: `#${id}` },
  }));
  const posts = notes.map<PaletteItem>((n) => ({
    group: "Note",
    code: n.id,
    title: n.title,
    sub: `${n.category} \u00b7 ${formatDate(n.date)}`,
    action: { type: "go", href: `/blog/${encodeURIComponent(n.slug)}` as Route },
  }));
  const feeds = FEEDS.map<PaletteItem>((f) => ({
    group: "Feed",
    code: f.code,
    title: f.title,
    sub: f.host + (pinned.includes(f.key) ? " \u00b7 on overview" : ""),
    action: { type: "go", href: "/live", selector: `#feed-${f.key}`, showAllFeeds: true },
  }));
  const run = (command: CommandId): Action => ({ type: "run", command });
  const commands = (
    [
      ["PWR", dark ? "Switch to light mode" : "Switch to dark mode", "Theme", run("theme")],
      [
        "FW",
        "Flash the firmware",
        "Patches the tagline",
        { type: "go", href: "/", selector: "#flash", click: true },
      ],
      [
        "K8S",
        "Kill a pod",
        "Chaos monkey on the cluster",
        { type: "go", href: "/", selector: "#k8s-chaos", click: true },
      ],
      ["GO", "Launch the rocket", 'or type "launch" anywhere', run("launch")],
      ["URL", "Copy a link to this page", path, run("copy")],
      ["LF", "Reset overview feeds", "Back to LF-01 to LF-03", run("feeds")],
      ["TOP", "Back to top", "Scroll", run("top")],
    ] as const
  ).map<PaletteItem>(([code, title, sub, action]) => ({
    group: "Command",
    code,
    title,
    sub,
    action,
  }));
  // last, so an empty query still opens on pages, notes, feeds and commands
  const forum = threads.map<PaletteItem>((t) => ({
    group: "Thread",
    code: threadAddress(t.id),
    title: t.title,
    sub: `${t.category} \u00b7 ${formatDate(t.date)}`,
    action: { type: "go", href: threadHref(t.slug, t.id) },
  }));
  return [...pages, ...labTools, ...sections, ...posts, ...feeds, ...commands, ...forum];
}

export const MAX_RESULTS = 60;

/** Every word of the query must appear in the code, title, subtitle or group (case-insensitive). */
export function filterItems(items: PaletteItem[], query: string): PaletteItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items
    .filter((it) => {
      const hay = `${it.code} ${it.title} ${it.sub} ${it.group}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, MAX_RESULTS);
}
