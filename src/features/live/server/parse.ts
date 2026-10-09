/**
 * Parsers: upstream JSON in, the trimmed shape the UI needs out (types.ts). Pure and synchronous so
 * they're unit-tested without the network. Only fields the UI uses are kept, so caches stay small.
 */
import { safeUrl } from "../format";
import type {
  Advisory,
  Article,
  Crew,
  Cycle,
  Downloads,
  Launch,
  Model,
  NaturalEvent,
  Paper,
  Quake,
  Release,
  SpaceWeather,
  Status,
  Story,
  XRays,
} from "../types";
import { arr, get, num, numOrNull, obj, str, type Json } from "./json";

export function parseLaunches(raw: Json, now: number): Launch[] {
  return arr(get(raw, "results"))
    .map((l) => ({
      name: str(get(l, "name")),
      net: str(get(l, "net")),
      status: str(get(l, "status", "abbrev")),
      statusName: str(get(l, "status", "name")),
      provider: str(get(l, "launch_service_provider", "name")),
      location: str(get(l, "pad", "location", "name")),
      lat: numOrNull(get(l, "pad", "latitude")),
      lon: numOrNull(get(l, "pad", "longitude")),
      orbit: str(get(l, "mission", "orbit", "abbrev")),
    }))
    .filter((l) => l.net && Date.parse(l.net) > now - 3600e3)
    .slice(0, 5);
}

export function parseStory(raw: Json): Story | null {
  const id = num(get(raw, "id"), NaN);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    title: str(get(raw, "title")),
    url: safeUrl(get(raw, "url")),
    score: num(get(raw, "score")),
    comments: num(get(raw, "descendants")),
  };
}

export function parseCrew(raw: Json): Crew {
  return {
    count: num(get(raw, "number")),
    expedition: num(get(raw, "iss_expedition")),
    people: arr(get(raw, "people"))
      .slice(0, 8)
      .map((p) => ({
        name: str(get(p, "name")),
        craft: str(get(p, "spacecraft")),
        agency: str(get(p, "agency")),
        days: num(get(p, "days_in_space")),
        url: safeUrl(get(p, "url")),
      })),
  };
}

export function parseKp(raw: Json): SpaceWeather["kp"] {
  // NOAA returns an array of objects { time_tag, Kp } (older versions: arrays with a header row)
  return arr(raw)
    .filter((k) => !Array.isArray(k))
    .slice(-24)
    .map((k) => [str(get(k, "time_tag")), num(get(k, "Kp"))] as [string, number]);
}

export function parseSolarWind(raw: Json): number | null {
  return numOrNull(get(raw, 0, "proton_speed"));
}

export function parseArticles(raw: Json): Article[] {
  return arr(get(raw, "results")).map((a) => ({
    title: str(get(a, "title")),
    url: safeUrl(get(a, "url")),
    site: str(get(a, "news_site")),
    published: str(get(a, "published_at")),
  }));
}

export function parseRelease(raw: Json, repo: string, name: string): Release {
  return {
    repo,
    name,
    tag: str(get(raw, "tag_name")) || null,
    published: str(get(raw, "published_at")) || null,
    url: safeUrl(get(raw, "html_url")),
  };
}

export function parseCycles(raw: Json, product: Cycle["product"], now: number): Cycle[] {
  return arr(raw)
    .map((x) => {
      const eol = get(x, "eol");
      const lts = get(x, "lts");
      return {
        product,
        cycle: str(get(x, "cycle")),
        latest: str(get(x, "latest")),
        lts: typeof lts === "string" ? Date.parse(lts) <= now : lts === true,
        eol: typeof eol === "string" ? eol : null,
        ended: eol === true || (typeof eol === "string" && Date.parse(eol) <= now),
      };
    })
    .filter((x) => !x.ended)
    .slice(0, 3)
    .map(({ ended: _ended, ...c }) => c);
}

const INDICATORS = new Set(["none", "minor", "major", "critical", "maintenance"]);
export function parseStatus(raw: Json, name: string, url: string): Status {
  const i = str(get(raw, "status", "indicator"));
  return {
    name,
    url,
    indicator: (INDICATORS.has(i) ? i : "unknown") as Status["indicator"],
    description: str(get(raw, "status", "description")),
  };
}

const UNSAFE_MODEL = /uncensor|abliterat|nsfw|erotic|lewd/i;
export function parseModels(raw: Json): Model[] {
  return arr(raw)
    .map((m) => ({
      id: str(get(m, "id")),
      downloads: num(get(m, "downloads")),
      likes: num(get(m, "likes")),
    }))
    .filter((m) => m.id && !UNSAFE_MODEL.test(m.id))
    .slice(0, 6);
}

export function parsePapers(raw: Json): Paper[] {
  return arr(raw)
    .map((p) => ({
      id: str(get(p, "paper", "id")),
      title: str(get(p, "title")) || str(get(p, "paper", "title")),
      upvotes: num(get(p, "paper", "upvotes")),
    }))
    .filter((p) => /^\d{4}\.\d{4,5}$/.test(p.id))
    .sort((a, b) => b.upvotes - a.upvotes)
    .slice(0, 6);
}

export function parseDownloads(raw: Json, pkgs: readonly string[]): Downloads[] {
  return pkgs
    .map((pkg) => ({ pkg, downloads: num(get(raw, pkg, "downloads")) }))
    .sort((a, b) => b.downloads - a.downloads);
}

export function parseXRays(raw: Json): XRays {
  return {
    points: arr(raw)
      .filter((x) => str(get(x, "energy")) === "0.1-0.8nm" && num(get(x, "flux")) > 0)
      .filter((_, i) => i % 4 === 0)
      .map((x) => [str(get(x, "time_tag")), num(get(x, "flux"))] as [string, number]),
  };
}

export function parseQuakes(raw: Json): Quake[] {
  return arr(get(raw, "features"))
    .slice(0, 30)
    .map((f) => ({
      mag: num(get(f, "properties", "mag")),
      place: str(get(f, "properties", "place"), "Unknown"),
      time: num(get(f, "properties", "time")),
      url: safeUrl(get(f, "properties", "url")),
      lon: num(get(f, "geometry", "coordinates", 0)),
      lat: num(get(f, "geometry", "coordinates", 1)),
      depth: num(get(f, "geometry", "coordinates", 2)),
    }));
}

export function parseEvents(raw: Json): NaturalEvent[] {
  return arr(get(raw, "events")).map((e) => {
    const geo = arr(get(e, "geometry"));
    const g = obj(geo[geo.length - 1]);
    const mv = numOrNull(g.magnitudeValue);
    return {
      title: str(get(e, "title")),
      category: str(get(e, "categories", 0, "title")),
      date: str(g.date) || null,
      url: safeUrl(get(e, "sources", 0, "url")),
      magnitude: mv === null ? "" : `${mv} ${str(g.magnitudeUnit)}`.trim(),
    };
  });
}

export function parseAdvisories(raw: Json): Advisory[] {
  return arr(raw).map((a) => {
    const s = str(get(a, "summary"));
    return {
      pkg: str(get(a, "vulnerabilities", 0, "package", "name"), "npm"),
      summary: s.length > 90 ? `${s.slice(0, 88)}\u2026` : s,
      published: str(get(a, "published_at")) || null,
      url: safeUrl(get(a, "html_url")),
    };
  });
}
