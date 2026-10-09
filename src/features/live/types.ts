import type { ServerFeedKey } from "./catalog";

/** Every URL in feed data has passed safeUrl(): http(s) only, or null. */
export type SafeUrl = string | null;

export interface Launch {
  name: string;
  net: string;
  status: string;
  statusName: string;
  provider: string;
  location: string;
  lat: number | null;
  lon: number | null;
  orbit: string;
}
export interface Story {
  id: number;
  title: string;
  url: SafeUrl;
  score: number;
  comments: number;
}
export interface Crew {
  count: number;
  expedition: number;
  people: { name: string; craft: string; agency: string; days: number; url: SafeUrl }[];
}
export interface SpaceWeather {
  /** [ISO time, Kp] for the last 24 three-hour slots */
  kp: [string, number][];
  windKmS: number | null;
}
export interface Article {
  title: string;
  url: SafeUrl;
  site: string;
  published: string;
}
export interface Release {
  repo: string;
  name: string;
  tag: string | null;
  published: string | null;
  url: SafeUrl;
}
export interface Cycle {
  product: "Node.js" | "Kubernetes";
  cycle: string;
  latest: string;
  lts: boolean;
  /** ISO date, or null when there is no end-of-life date yet */
  eol: string | null;
}
export interface Status {
  name: string;
  url: string;
  indicator: "none" | "minor" | "major" | "critical" | "maintenance" | "unknown";
  description: string;
}
export interface Model {
  id: string;
  downloads: number;
  likes: number;
}
export interface Paper {
  id: string;
  title: string;
  upvotes: number;
}
export interface Downloads {
  pkg: string;
  downloads: number;
}
export interface XRays {
  /** [ISO time, flux W/m²], 0.1-0.8 nm band, thinned */
  points: [string, number][];
}
export interface Quake {
  mag: number;
  place: string;
  time: number;
  url: SafeUrl;
  lon: number;
  lat: number;
  depth: number;
}
export interface NaturalEvent {
  title: string;
  category: string;
  date: string | null;
  url: SafeUrl;
  magnitude: string;
}
export interface Advisory {
  pkg: string;
  summary: string;
  published: string | null;
  url: SafeUrl;
}

export interface FeedDataMap {
  man: Launch[];
  hn: Story[];
  crew: Crew;
  kp: SpaceWeather;
  sfn: Article[];
  rel: Release[];
  eol: Cycle[];
  stat: Status[];
  hf: Model[];
  pap: Paper[];
  npm: Downloads[];
  xr: XRays;
  eq: Quake[];
  eo: NaturalEvent[];
  sec: Advisory[];
  show: Story[];
}

export type FeedResult<K extends ServerFeedKey = ServerFeedKey> =
  | { ok: true; key: K; at: number; data: FeedDataMap[K] }
  | { ok: false; key: K; at: number; error: string };
