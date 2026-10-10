import type { Route } from "next";
import { PAGES } from "@/config/site";
import { FEEDS } from "@/features/live/catalog";

/** Jump-to palette entries (prototype `palItems`): pages, overview sections, notes, feeds, commands. */

export type Group = "Page" | "Section" | "Note" | "Feed" | "Command";

export type CommandId = "theme" | "launch" | "copy" | "feeds" | "top";

export type Action =
  | { type: "go"; href: Route; selector?: string; click?: boolean; showAllFeeds?: boolean }
  | { type: "run"; command: CommandId };

export interface PaletteItem {
  group: Group;
  /** Short code in the first column: P1, §2, AN-003, LF-07, PWR... */
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
  pinned,
  dark,
  path,
  formatDate,
}: {
  notes: PaletteNote[];
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
  return [...pages, ...sections, ...posts, ...feeds, ...commands];
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
