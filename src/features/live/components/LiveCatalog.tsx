"use client";

import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import {
  CATEGORIES,
  DEFAULT_PINS,
  FEED_BY_KEY,
  FEEDS,
  type FeedKey,
  type ServerFeedKey,
} from "../catalog";
import type { FeedResult } from "../types";
import { liveFilter, pins } from "../client/prefs";
import { FeedCard } from "./FeedCard";
import s from "./Feeds.module.css";

type Initial = Partial<Record<ServerFeedKey, FeedResult>>;

/** Live page: every feed, category filter chips, and pin toggles that decide the overview. */
export function LiveCatalog({ initial }: { initial: Initial }) {
  const picked = pins.use();
  const cat = liveFilter.use();
  const shows = (k: FeedKey) =>
    !cat || (cat === "pinned" ? picked.includes(k) : FEED_BY_KEY[k].cat === cat);
  const count = (id: string) =>
    !id ? FEEDS.length : id === "pinned" ? picked.length : FEEDS.filter((f) => f.cat === id).length;
  const toggle = (k: FeedKey) =>
    pins.set(picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k]);
  const visible = FEEDS.filter((f) => shows(f.key)).length;

  return (
    <>
      <div className={s.bar}>
        <span>
          On overview:{" "}
          {FEEDS.filter((f) => picked.includes(f.key))
            .map((f) => f.code)
            .join(", ") || "none"}
        </span>
        <Button size="sm" onClick={() => pins.set(DEFAULT_PINS)}>
          Reset to LF-01 to LF-03
        </Button>
      </div>
      <div className={s.chips} role="group" aria-label="Filter feeds">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={cat === c.id}
            onClick={() => liveFilter.set(c.id)}
          >
            {c.label} <span className={s.cn}>{count(c.id)}</span>
          </button>
        ))}
      </div>
      <p className="vh" role="status">
        {visible} of {FEEDS.length} feeds shown
      </p>
      <Reveal className={s.feeds}>
        {FEEDS.map((f) => (
          <FeedCard
            key={f.key}
            feedKey={f.key}
            initial={initial[f.key as ServerFeedKey]}
            picker
            hidden={!shows(f.key)}
            pinned={picked.includes(f.key)}
            onTogglePin={() => toggle(f.key)}
          />
        ))}
      </Reveal>
    </>
  );
}
