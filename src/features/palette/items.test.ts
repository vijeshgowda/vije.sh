import { describe, expect, it } from "vitest";
import { FEEDS } from "@/features/live/catalog";
import { PAGES } from "@/config/site";
import {
  buildItems,
  filterItems,
  MAX_RESULTS,
  PALETTE_THREADS,
  readThreads,
  SECTIONS,
  type PaletteItem,
  type PaletteThread,
} from "./items";

const notes = [
  { id: "AN-002", slug: "a b", title: "Quality per GB", category: "AI", date: "2026-10-05" },
  { id: "AN-001", slug: "first", title: "Planning this site", category: "Web", date: "2026-10-01" },
];

const build = (over: Partial<Parameters<typeof buildItems>[0]> = {}) =>
  buildItems({
    notes,
    pinned: ["hn"],
    dark: false,
    path: "/lab",
    formatDate: (d) => `on ${d}`,
    ...over,
  });

const titles = (items: PaletteItem[]) => items.map((i) => i.title);

describe("buildItems", () => {
  it("lists pages, sections, notes, feeds and commands in that order", () => {
    const items = build();
    const groups = [...new Set(items.map((i) => i.group))];
    expect(groups).toEqual(["Page", "Section", "Note", "Feed", "Command"]);
    expect(items.filter((i) => i.group === "Page")).toHaveLength(PAGES.length);
    expect(items.filter((i) => i.group === "Section")).toHaveLength(SECTIONS.length);
    expect(items.filter((i) => i.group === "Feed")).toHaveLength(FEEDS.length);
  });

  it("links notes, sections and feeds to the right places", () => {
    const items = build();
    const note = items.find((i) => i.code === "AN-002")!;
    expect(note.sub).toBe("AI \u00b7 on 2026-10-05");
    expect(note.action).toEqual({ type: "go", href: "/blog/a%20b" });
    expect(items.find((i) => i.title === "Cluster")!.action).toEqual({
      type: "go",
      href: "/",
      selector: "#cluster",
    });
    const hn = items.find(
      (i) => i.group === "Feed" && i.action.type === "go" && i.action.selector === "#feed-hn",
    )!;
    expect(hn.sub).toMatch(/on overview$/);
    expect(hn.action).toMatchObject({ href: "/live", showAllFeeds: true });
  });

  it("words the theme command for the current theme and shows the current path", () => {
    expect(titles(build())).toContain("Switch to dark mode");
    expect(titles(build({ dark: true }))).toContain("Switch to light mode");
    expect(build().find((i) => i.code === "URL")!.sub).toBe("/lab");
    expect(build().find((i) => i.code === "FW")!.action).toMatchObject({
      selector: "#flash",
      click: true,
    });
  });
});

describe("filterItems", () => {
  const items = build();

  it("matches every word, in any field, ignoring case", () => {
    expect(titles(filterItems(items, "dark"))).toEqual(["Switch to dark mode"]);
    expect(titles(filterItems(items, "  NOTE  planning "))).toEqual(["Planning this site"]);
    expect(filterItems(items, "lf-02")[0]!.title).toBe("Launch manifest");
    expect(filterItems(items, "zzz nothing")).toEqual([]);
  });

  it("returns everything (capped) for an empty query", () => {
    expect(filterItems(items, "")).toHaveLength(Math.min(items.length, MAX_RESULTS));
  });
});

describe("forum threads", () => {
  const thread: PaletteThread = {
    id: "42",
    title: "Pooling with pg",
    slug: "engineering",
    category: "Engineering",
    date: "2026-10-06",
  };

  it("come last, as Thread entries linking to the thread", () => {
    const items = build({ threads: [thread] });
    expect(items.at(-1)).toEqual({
      group: "Thread",
      code: "0x2A",
      title: "Pooling with pg",
      sub: "Engineering \u00b7 on 2026-10-06",
      action: { type: "go", href: "/forum/engineering/42" },
    });
    expect(titles(filterItems(items, "thread pooling"))).toEqual(["Pooling with pg"]);
    // an empty query still opens on everything else
    expect(filterItems(build({ threads: Array(80).fill(thread) }), "")[0]!.group).toBe("Page");
  });

  it("reads only well-formed entries from the API body, at most PALETTE_THREADS", () => {
    expect(readThreads({ threads: [thread, { ...thread, extra: "dropped" }] })).toEqual([
      thread,
      thread,
    ]);
    for (const body of [null, 5, "x", {}, { threads: "x" }]) expect(readThreads(body)).toEqual([]);
    const bad = [
      null,
      "42",
      { ...thread, id: "0" },
      { ...thread, id: 42 },
      { ...thread, title: 1 },
      { ...thread, slug: "Bad Slug" },
      { ...thread, slug: null },
      { ...thread, category: undefined },
      { ...thread, date: "2026-10-06T12:00:00Z" },
      { ...thread, date: 1 },
    ];
    expect(readThreads({ threads: bad })).toEqual([]);
    expect(readThreads({ threads: Array(PALETTE_THREADS + 5).fill(thread) })).toHaveLength(
      PALETTE_THREADS,
    );
  });
});
