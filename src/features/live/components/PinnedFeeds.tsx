"use client";

import { Reveal } from "@/components/motion/Reveal";
import { FEEDS, type ServerFeedKey } from "../catalog";
import type { FeedResult } from "../types";
import { pins } from "../client/prefs";
import { FeedCard } from "./FeedCard";
import s from "./Feeds.module.css";

type Initial = Partial<Record<ServerFeedKey, FeedResult>>;

/** Overview: the visitor's pinned feeds (defaults LF-01 to LF-03 until they choose). */
export function PinnedFeeds({ initial }: { initial: Initial }) {
  const picked = pins.use();
  const keys = FEEDS.map((f) => f.key).filter((k) => picked.includes(k));
  if (!keys.length) return <p className={s.fmsg}>No feeds pinned. Pick some on the Live page.</p>;
  return (
    <Reveal className={s.feeds}>
      {keys.map((k) => (
        <FeedCard key={k} feedKey={k} initial={initial[k as ServerFeedKey]} />
      ))}
    </Reveal>
  );
}
