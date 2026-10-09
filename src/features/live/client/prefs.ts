"use client";

import { createStoredValue } from "@/lib/stored-value";
import { CATEGORIES, DEFAULT_PINS, isFeedKey, type FeedKey } from "../catalog";

/** Feeds pinned to the overview (Live page toggles) */
export const pins = createStoredValue<FeedKey[]>("feeds", DEFAULT_PINS, (v) =>
  Array.isArray(v)
    ? v.filter((k): k is FeedKey => typeof k === "string" && isFeedKey(k))
    : DEFAULT_PINS,
);

/** Live page category filter */
export const liveFilter = createStoredValue<string>("lf", "", (v) =>
  typeof v === "string" && CATEGORIES.some((c) => c.id === v) ? v : "",
);
