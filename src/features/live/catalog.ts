/**
 * Feed catalogue: metadata only, safe to import from client and server code.
 * Data sources and limits: docs/design/live-data.md. Server loaders live in ./server/sources.
 */

export type FeedCategory = "space" | "earth" | "dev" | "ai" | "ops";

/** Where the data comes from: our cached API, the visitor's browser, or computed locally. */
export type FeedSource = "server" | "browser" | "computed";

export interface FeedMeta {
  key: string;
  code: string;
  title: string;
  host: string;
  cat: FeedCategory;
  source: FeedSource;
  /** Server cache lifetime in seconds (server feeds only) */
  ttl?: number;
  /** Grid span: w2 = two columns, w3 = full row */
  size?: "w2" | "w3";
}

const MIN = 60;
const HOUR = 3600;

export const FEEDS = [
  {
    key: "iss",
    code: "LF-01",
    title: "ISS, live",
    host: "wheretheiss.at",
    cat: "space",
    source: "browser",
  },
  {
    key: "man",
    code: "LF-02",
    title: "Launch manifest",
    host: "thespacedevs.com",
    cat: "space",
    source: "server",
    ttl: 30 * MIN,
    size: "w2",
  },
  {
    key: "hn",
    code: "LF-03",
    title: "Downlink: Hacker News",
    host: "news.ycombinator.com",
    cat: "dev",
    source: "server",
    ttl: 10 * MIN,
    size: "w3",
  },
  {
    key: "crew",
    code: "LF-04",
    title: "People in space",
    host: "corquaid.github.io",
    cat: "space",
    source: "server",
    ttl: 6 * HOUR,
  },
  {
    key: "kp",
    code: "LF-05",
    title: "Space weather",
    host: "swpc.noaa.gov",
    cat: "space",
    source: "server",
    ttl: 30 * MIN,
  },
  {
    key: "sfn",
    code: "LF-06",
    title: "Spaceflight news",
    host: "spaceflightnewsapi.net",
    cat: "space",
    source: "server",
    ttl: 30 * MIN,
  },
  {
    key: "rel",
    code: "LF-07",
    title: "Release radar",
    host: "api.github.com",
    cat: "dev",
    source: "server",
    ttl: 6 * HOUR,
  },
  {
    key: "eol",
    code: "LF-08",
    title: "Runtime lifecycle",
    host: "endoflife.date",
    cat: "dev",
    source: "server",
    ttl: 24 * HOUR,
  },
  {
    key: "stat",
    code: "LF-09",
    title: "Upstream status",
    host: "statuspage.io",
    cat: "ops",
    source: "server",
    ttl: 5 * MIN,
  },
  {
    key: "hf",
    code: "LF-10",
    title: "Trending LLMs",
    host: "huggingface.co",
    cat: "ai",
    source: "server",
    ttl: 30 * MIN,
  },
  {
    key: "pap",
    code: "LF-11",
    title: "Daily AI papers",
    host: "huggingface.co/papers",
    cat: "ai",
    source: "server",
    ttl: 2 * HOUR,
  },
  {
    key: "npm",
    code: "LF-12",
    title: "npm weekly downloads",
    host: "api.npmjs.org",
    cat: "dev",
    source: "server",
    ttl: 24 * HOUR,
  },
  {
    key: "wx",
    code: "LF-13",
    title: "Ambient conditions",
    host: "open-meteo.com",
    cat: "earth",
    source: "browser",
  },
  {
    key: "moon",
    code: "LF-14",
    title: "Moon phase",
    host: "computed in your browser",
    cat: "space",
    source: "computed",
  },
  {
    key: "xr",
    code: "LF-15",
    title: "Solar X-rays",
    host: "swpc.noaa.gov",
    cat: "space",
    source: "server",
    ttl: 15 * MIN,
  },
  {
    key: "eq",
    code: "LF-16",
    title: "Earthquakes, M4.5+",
    host: "earthquake.usgs.gov",
    cat: "earth",
    source: "server",
    ttl: 15 * MIN,
  },
  {
    key: "eo",
    code: "LF-17",
    title: "Natural events",
    host: "eonet.gsfc.nasa.gov",
    cat: "earth",
    source: "server",
    ttl: HOUR,
  },
  {
    key: "sec",
    code: "LF-18",
    title: "Security advisories",
    host: "github.com/advisories",
    cat: "ops",
    source: "server",
    ttl: 6 * HOUR,
  },
  {
    key: "show",
    code: "LF-19",
    title: "Show HN",
    host: "news.ycombinator.com",
    cat: "dev",
    source: "server",
    ttl: 30 * MIN,
  },
] as const satisfies readonly FeedMeta[];

export type FeedKey = (typeof FEEDS)[number]["key"];
export type ServerFeedKey = Extract<(typeof FEEDS)[number], { source: "server" }>["key"];

export const FEED_BY_KEY: Record<FeedKey, FeedMeta> = Object.fromEntries(
  FEEDS.map((f) => [f.key, f]),
) as Record<FeedKey, FeedMeta>;

export const SERVER_FEED_KEYS = FEEDS.filter((f) => f.source === "server").map(
  (f) => f.key,
) as ServerFeedKey[];

export const isFeedKey = (k: string): k is FeedKey => k in FEED_BY_KEY;
export const isServerFeedKey = (k: string): k is ServerFeedKey =>
  isFeedKey(k) && FEED_BY_KEY[k].source === "server";

/** Shown on the overview until the visitor picks their own */
export const DEFAULT_PINS: FeedKey[] = ["iss", "man", "hn"];

export const CATEGORIES: { id: FeedCategory | "" | "pinned"; label: string }[] = [
  { id: "", label: "All" },
  { id: "space", label: "Space" },
  { id: "earth", label: "Earth" },
  { id: "dev", label: "Dev" },
  { id: "ai", label: "AI" },
  { id: "ops", label: "Ops" },
  { id: "pinned", label: "On overview" },
];
