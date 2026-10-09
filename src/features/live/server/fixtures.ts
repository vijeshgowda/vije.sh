/** Small upstream samples (shapes as of Oct 2026) for parser, loader and route tests. */
const FUTURE = "2099-01-01T00:00:00Z";

export const UPSTREAM: Record<string, unknown> = {
  "ll.thespacedevs.com": {
    results: [
      {
        name: "Falcon 9 | Starlink",
        net: FUTURE,
        status: { abbrev: "Go", name: "Go for Launch" },
        launch_service_provider: { name: "SpaceX" },
        pad: {
          latitude: "28.56",
          longitude: "-80.57",
          location: { name: "Cape Canaveral, FL, USA" },
        },
        mission: { orbit: { abbrev: "LEO" } },
      },
      { name: "Old", net: "2000-01-01T00:00:00Z" },
    ],
  },
  "topstories.json": [1, 2, "bad"],
  "showstories.json": [3],
  "item/1.json": { id: 1, title: "Hello", url: "https://example.com/a", score: 10, descendants: 2 },
  "item/2.json": { id: 2, title: "Ask HN", url: "javascript:alert(1)", score: 5 },
  "item/3.json": {
    id: 3,
    title: "Show HN: A thing",
    url: "https://thing.dev",
    score: 7,
    descendants: 1,
  },
  "item/NaN.json": null,
  "people-in-space.json": {
    number: 2,
    iss_expedition: 74,
    people: [
      { name: "A", spacecraft: "ISS", agency: "NASA", days_in_space: 100, url: "https://x.org" },
    ],
  },
  "noaa-planetary-k-index.json": [
    { time_tag: "2026-10-09T00:00:00", Kp: 2.33 },
    { time_tag: "2026-10-09T03:00:00", Kp: "5.67" },
  ],
  "solar-wind-speed.json": [{ proton_speed: 412 }],
  "spaceflightnewsapi.net": {
    results: [{ title: "News", url: "https://n.example", news_site: "SFN", published_at: FUTURE }],
  },
  "releases/latest": {
    tag_name: "v1.2.3",
    published_at: FUTURE,
    html_url: "https://github.com/x/y/releases/v1.2.3",
  },
  "api/nodejs.json": [
    { cycle: "26", latest: "26.1.0", lts: false, eol: "2099-04-30" },
    { cycle: "24", latest: "24.9.0", lts: "2025-10-28", eol: "2099-04-30" },
    { cycle: "18", latest: "18.20.0", lts: "2022-10-25", eol: "2025-04-30" },
  ],
  "api/kubernetes.json": [{ cycle: "1.36", latest: "1.36.1", lts: false, eol: false }],
  "status.json": { status: { indicator: "minor", description: "Minor outage" } },
  "huggingface.co/api/models": [
    { id: "org/small-1b", downloads: 1200, likes: 30 },
    { id: "org/uncensored-7b", downloads: 1, likes: 1 },
  ],
  daily_papers: [
    { title: "Paper A", paper: { id: "2610.01234", upvotes: 5 } },
    { paper: { id: "2610.05678", title: "Paper B", upvotes: 9 } },
    { title: "Bad id", paper: { id: "../x", upvotes: 99 } },
  ],
  "downloads/point": { react: { downloads: 10 }, next: { downloads: 30 } },
  "xrays-6-hour.json": [
    { time_tag: "t0", energy: "0.1-0.8nm", flux: 1e-6 },
    { time_tag: "t1", energy: "0.05-0.4nm", flux: 1e-7 },
    { time_tag: "t2", energy: "0.1-0.8nm", flux: 0 },
  ],
  "4.5_day.geojson": {
    features: [
      {
        properties: { mag: 6.1, place: "Somewhere", time: 1, url: "https://usgs.gov/e" },
        geometry: { coordinates: [10, 20, 30] },
      },
    ],
  },
  "eonet.gsfc.nasa.gov": {
    events: [
      {
        title: "Storm",
        categories: [{ title: "Severe Storms" }],
        sources: [{ url: "https://eonet.example" }],
        geometry: [
          { date: "2026-10-01" },
          { date: "2026-10-08", magnitudeValue: 65, magnitudeUnit: "kts" },
        ],
      },
      { title: "Fire", geometry: [] },
    ],
  },
  "api.github.com/advisories": [
    {
      summary: "x".repeat(120),
      vulnerabilities: [{ package: { name: "left-pad" } }],
      published_at: FUTURE,
      html_url: "https://github.com/advisories/1",
    },
  ],
};

/** fetch stand-in: the first key contained in the URL wins */
export function fakeFetch(overrides: Record<string, unknown> = {}) {
  const table = { ...UPSTREAM, ...overrides };
  return async (input: string | URL) => {
    const url = String(input);
    const hit = Object.keys(table)
      .sort((a, b) => b.length - a.length)
      .find((k) => url.includes(k));
    if (!hit || table[hit] instanceof Error) return new Response("nope", { status: 503 });
    return Response.json(table[hit]);
  };
}
