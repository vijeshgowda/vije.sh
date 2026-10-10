import "server-only";
import type { ServerFeedKey } from "../catalog";
import type { FeedDataMap } from "../types";
import { getJSON, githubHeaders } from "./http";
import * as P from "./parse";

const HN = "https://hacker-news.firebaseio.com/v0";

async function hnList(kind: "topstories" | "showstories", n: number) {
  const ids = (await getJSON(`${HN}/${kind}.json`)) as unknown[];
  const items = await Promise.all(
    (Array.isArray(ids) ? ids : [])
      .slice(0, n)
      .map((id) => getJSON(`${HN}/item/${Number(id)}.json`).then(P.parseStory, () => null)),
  );
  return items.filter((s) => s !== null);
}

export const STATUS_PAGES = [
  ["GitHub", "https://www.githubstatus.com"],
  ["Cloudflare", "https://www.cloudflarestatus.com"],
  ["Vercel", "https://www.vercel-status.com"],
  ["Supabase", "https://status.supabase.com"],
  ["npm", "https://status.npmjs.org"],
] as const;

export const REPOS = [
  ["kubernetes/kubernetes", "Kubernetes"],
  ["nodejs/node", "Node.js"],
  ["istio/istio", "Istio"],
  ["godotengine/godot", "Godot"],
  ["espressif/esp-idf", "ESP-IDF"],
] as const;

export const NPM_PACKAGES = ["react", "next", "express", "typescript", "vite"] as const;

type Loaders = { [K in ServerFeedKey]: () => Promise<FeedDataMap[K]> };

/** One upstream loader per server feed. Endpoints and limits: .local/variations/docs/live-data.md */
export const LOADERS: Loaders = {
  man: async () =>
    P.parseLaunches(
      await getJSON("https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=6&mode=normal", {
        timeoutMs: 30_000,
      }),
      Date.now(),
    ),
  hn: () => hnList("topstories", 8),
  show: async () =>
    (await hnList("showstories", 6)).map((s) => ({
      ...s,
      title: s.title.replace(/^Show HN:\s*/i, ""),
    })),
  crew: async () =>
    P.parseCrew(
      await getJSON(
        "https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json",
      ),
    ),
  kp: async () => {
    const [kp, wind] = await Promise.all([
      getJSON("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json"),
      getJSON("https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json").catch(
        () => null,
      ),
    ]);
    const parsed = P.parseKp(kp);
    if (!parsed.length) throw new Error("no Kp data");
    return { kp: parsed, windKmS: P.parseSolarWind(wind) };
  },
  sfn: async () =>
    P.parseArticles(await getJSON("https://api.spaceflightnewsapi.net/v4/articles/?limit=6")),
  rel: async () => {
    const rs = await Promise.all(
      REPOS.map(([repo, name]) =>
        getJSON(`https://api.github.com/repos/${repo}/releases/latest`, {
          headers: githubHeaders(),
        }).then(
          (raw) => P.parseRelease(raw, repo, name),
          () => P.parseRelease(null, repo, name),
        ),
      ),
    );
    if (rs.every((r) => !r.tag)) throw new Error("no releases");
    return rs;
  },
  eol: async () => {
    const now = Date.now();
    const [node, k8s] = await Promise.all([
      getJSON("https://endoflife.date/api/nodejs.json"),
      getJSON("https://endoflife.date/api/kubernetes.json"),
    ]);
    return [...P.parseCycles(node, "Node.js", now), ...P.parseCycles(k8s, "Kubernetes", now)];
  },
  stat: async () => {
    const rs = await Promise.all(
      STATUS_PAGES.map(([name, base]) =>
        getJSON(`${base}/api/v2/status.json`, { timeoutMs: 8_000 }).then(
          (raw) => P.parseStatus(raw, name, base),
          () => P.parseStatus(null, name, base),
        ),
      ),
    );
    if (rs.every((r) => r.indicator === "unknown")) throw new Error("no status");
    return rs;
  },
  hf: async () =>
    P.parseModels(
      await getJSON(
        "https://huggingface.co/api/models?pipeline_tag=text-generation&sort=trendingScore&direction=-1&limit=16",
      ),
    ),
  pap: async () => P.parsePapers(await getJSON("https://huggingface.co/api/daily_papers?limit=20")),
  npm: async () =>
    P.parseDownloads(
      await getJSON(`https://api.npmjs.org/downloads/point/last-week/${NPM_PACKAGES.join(",")}`),
      NPM_PACKAGES,
    ),
  xr: async () => {
    const x = P.parseXRays(
      await getJSON("https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json"),
    );
    if (!x.points.length) throw new Error("no flux");
    return x;
  },
  eq: async () =>
    P.parseQuakes(
      await getJSON("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"),
    ),
  eo: async () =>
    P.parseEvents(
      await getJSON("https://eonet.gsfc.nasa.gov/api/v3/events?limit=6&status=open", {
        timeoutMs: 15_000,
      }),
    ),
  sec: async () =>
    P.parseAdvisories(
      await getJSON(
        "https://api.github.com/advisories?per_page=6&ecosystem=npm&severity=critical",
        {
          headers: githubHeaders(),
        },
      ),
    ),
};
