# Live data used by variations 18.1, 18.3 and 18.4

Every feed is a free, public HTTP GET that works from a browser with no key or account. All of them send CORS headers that allow a `file://` page (origin `null`), checked with `curl -H 'Origin: null'` on 6 Oct 2026. Nothing here needs a server; in production, see "Production advice" at the end.

## Rate limits and how the prototypes stay inside them

"Published limit" is what the provider documents. Where a provider publishes nothing, the column says so; treat those as "be polite" and keep the cache.

| Feed | Endpoint (GET) | Published limit | Response | Cache TTL (localStorage) | Calls per open page | Used in |
|---|---|---|---|---|---|---|
| ISS position | `https://api.wheretheiss.at/v1/satellites/25544` | About 1 request per second per IP | ~350 B, fast | none (live) | 1 every 5 s while the tab is visible (720/h max) | 18.1 LF-01, 18.3, 18.4 |
| ISS ground track | `https://api.wheretheiss.at/v1/satellites/25544/positions?timestamps=t0,…,t9` (10 timestamps, 10 min apart) | Same as above; at most 10 timestamps per call | ~3 KB | none | 1 every 5 min (12/h) | 18.1, 18.3, 18.4 |
| Launch manifest | `https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=6&mode=normal` | **15 requests per hour per IP** for anonymous use (Launch Library 2 free tier); HTTP 429 after that | ~60 KB, **about 10 s** to answer | 30 min | ≤ 2/h, shared across tabs | 18.1 LF-02, 18.3, 18.4 |
| Hacker News top stories | `https://hacker-news.firebaseio.com/v0/topstories.json` then `/v0/item/{id}.json` for the first 8 (6 in 18.4) | None published (Firebase) | ~4 KB + ~0.5 KB per item | 10 min | ≤ 6 refreshes/h × 9 calls = 54/h | 18.1 LF-03, 18.3, 18.4 |
| Trending models | `https://huggingface.co/api/models?pipeline_tag=text-generation&sort=trendingScore&direction=-1&limit=8` (`limit=6` in 18.1) | Anonymous Hub API calls are rate limited per IP (HTTP 429); HF does not promise fixed numbers, check their docs | ~3 KB | 30 min | ≤ 2/h | 18.1 LF-10, 18.3 Lab |
| Model parameter count | `https://huggingface.co/api/models/{org}/{name}?expand%5B%5D=safetensors` → `safetensors.total` | As above | ~200 B | 24 h per model | 1 per "Size it" click | 18.3 Lab |
| Daily AI papers | `https://huggingface.co/api/daily_papers?limit=20` | As above | ~60 KB | 2 h | ≤ 1/h | 18.1 LF-11 |
| People in space | `https://corquaid.github.io/international-space-station-APIs/JSON/people-in-space.json` | Static file on GitHub Pages (soft limit: 100 GB bandwidth a month for the whole site) | ~6 KB | 6 h | ≤ 1 per 6 h | 18.1 LF-04, 18.4 orbit card |
| Planetary K index | `https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json` | None published (NOAA SWPC); data updates every 3 h | ~5 KB | 30 min | ≤ 2/h | 18.1 LF-05 |
| Solar wind speed | `https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json` | None published; updates every minute | ~60 B | 10 min | ≤ 6/h | 18.1 LF-05 |
| Spaceflight news | `https://api.spaceflightnewsapi.net/v4/articles/?limit=6` | None published for anonymous use | ~6 KB | 30 min | ≤ 2/h | 18.1 LF-06 |
| Latest releases | `https://api.github.com/repos/{owner}/{repo}/releases/latest` for kubernetes/kubernetes, nodejs/node, istio/istio, godotengine/godot, espressif/esp-idf | **60 requests per hour per IP** unauthenticated (GitHub REST core); HTTP 403/429 after that | ~5 to 30 KB each | 6 h per repo | ≤ 5 per 6 h | 18.1 LF-07 |
| Runtime lifecycle | `https://endoflife.date/api/nodejs.json`, `https://endoflife.date/api/kubernetes.json` | None published | ~5 KB each | 24 h | ≤ 2 per day | 18.1 LF-08 |
| Upstream status | `{base}/api/v2/status.json` for githubstatus.com, cloudflarestatus.com, vercel-status.com, status.supabase.com, status.npmjs.org (Atlassian Statuspage) | None published for public pages | ~300 B each | 5 min | ≤ 12 refreshes/h × 5 = 60/h | 18.1 LF-09 |
| npm downloads | `https://api.npmjs.org/downloads/point/last-week/react,next,express,typescript,vite` | None published; bulk queries take up to 128 unscoped packages (scoped packages are not allowed in bulk) | ~600 B | 24 h | ≤ 1 per day | 18.1 LF-12 |
| Coastlines | `https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json` (TopoJSON) | CDN, no practical limit; browser HTTP cache handles repeats | ~50 KB | browser cache | 1 per page load | 18.1, 18.3, 18.4, 18.5 OLED |

### Added in 18.1.1 (checked with `Origin: null` on 6 Oct 2026)

| Feed | Endpoint (GET) | Published limit | Response | Cache TTL | Used in |
|---|---|---|---|---|---|
| Ambient conditions | `https://api.open-meteo.com/v1/forecast?latitude…&longitude…&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,pressure_msl&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1` | Free for non-commercial use, 10,000 calls a day per IP | ~700 B | 15 min per 0.1° cell | 18.1.1 LF-13 |
| Location for LF-13 | `https://geocoding-api.open-meteo.com/v1/search?name={time zone city}&count=1`, or the browser's location on a button press (rounded to 0.01°) | As above | ~400 B | kept in `v1811-loc` | 18.1.1 LF-13 |
| Moon phase | none, computed (mean synodic month from 6 Jan 2000 18:14 UTC) | n/a | n/a | n/a | 18.1.1 LF-14, 18.4, 18.5 |
| Solar X-rays | `https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json` (filtered to 0.1–0.8 nm, every 4th point kept) | None published | ~155 KB raw, ~3 KB stored | 15 min | 18.1.1 LF-15 |
| Earthquakes | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson` | None published (static feed, updated every minute) | ~12 KB | 15 min | 18.1.1 LF-16 (also rings on the LF-01 globe), 18.5 |
| Natural events | `https://eonet.gsfc.nasa.gov/api/v3/events?limit=6&status=open` | None published, no key | ~9 KB | 1 h | 18.1.1 LF-17 |
| Security advisories | `https://api.github.com/advisories?per_page=6&ecosystem=npm&severity=critical` | Counts against GitHub's **60 an hour** | ~40 KB | 6 h | 18.1.1 LF-18 |
| Show HN | `https://hacker-news.firebaseio.com/v0/showstories.json` then 6 items | None published | ~1 KB + items | 30 min | 18.1.1 LF-19 |

Rejected for 18.1.1: Hugging Face trending Spaces and datasets (top entries were NSFW model demos), Wikipedia "on this day" (unfiltered events include violence). LF-10 now drops model ids matching `uncensor|abliterat|nsfw|erotic|lewd` and keeps the first 6 of 16.

In 18.1.1 a feed only starts when its card comes within 300 px of the viewport, so the Live page no longer fires every request on open; the refresh button ignores the cache once (and refuses if the data is under a minute old).

Tried and rejected: `https://lobste.rs/hottest.json` (no CORS header), `http://api.open-notify.org/*` (HTTP only, blocked as mixed content on an HTTPS site), Google Cloud `incidents.json` (whole incident history, too large), NASA APIs (need a key; `DEMO_KEY` is limited to 30 calls an hour).

## Shared client code
All three variations use the same small helpers (copied into each file; no shared script):

```js
async function getJSON(url, ms = 12000) {             // AbortController timeout; 30 000 ms for Launch Library
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
async function cached(key, ttl, fn) {                  // { d, src: 'live' | 'cache' | 'stale', t }
  const c = store.get(key, null);
  if (c && Date.now() - c.t < ttl) return { d: c.d, src: 'cache', t: c.t };
  try { const d = await fn(); store.set(key, { t: Date.now(), d }); return { d, src: 'live', t: Date.now() }; }
  catch (e) { if (c) return { d: c.d, src: 'stale', t: c.t }; throw e; }
}
```

- **Map before storing**: `fn` returns only the fields the UI needs (strings coerced with `String()`, numbers with `+`), so localStorage stays small and nothing unexpected is kept.
- **Status labels**: each panel shows LIVE, CACHED n min ago, STALE n min ago (fetch failed, old copy shown) or NO SIGNAL (failed, nothing cached) with a coloured dot.
- **Failure**: a panel that cannot load shows a short message and a Retry button; the rest of the page keeps working.
- **Polling** only runs while the tab is visible (`document.hidden` check) and, in 18.4, only when the orbit levels are near (`z ≥ 4.2`).
- **Safety**: all text goes through `esc()` before `innerHTML`. External URLs (HN story links, wiki links, release pages) pass `safeUrl()`, which keeps only `http:`/`https:`; otherwise the link falls back to the provider's own page. Hugging Face ids are encoded per path segment. External links use `target="_blank" rel="noopener noreferrer"`.

## Storage keys
| Variation | Keys |
|---|---|
| 18.1 | `v181-ll`, `v181-hn`, `v181-crew`, `v181-kp`, `v181-sw`, `v181-sfn`, `v181-rel-{owner/repo}`, `v181-eol-{product}`, `v181-st-{service}`, `v181-hf`, `v181-pap`, `v181-npm`, plus `v181-feeds` (pinned feed ids) |
| 18.3 | `v183-ll`, `v183-hn`, `v183-hf-llm`, `v183-hfp-{model id}` |
| 18.4 | `v184-ll`, `v184-hn`, `v184-crew` |
| 18.1.1 | as 18.1 with `v1811-`, plus `v1811-wx-{lat,lon}`, `v1811-loc`, `v1811-xr`, `v1811-eq`, `v1811-eo`, `v1811-sec`, `v1811-show`, `v1811-lf` (Live filter) |
| 18.5 | `v185-ll`, `v185-hn`, `v185-st-{service}`, `v185-crew`, `v185-kp`, `v185-eq` |

Clearing site data resets every cache.

## Production advice
In the browser every limit is per visitor IP, which is fine for a personal site, but two feeds deserve a server-side cache if this ships:

1. **Launch Library 2** (15 calls an hour, ~10 s responses): fetch it from a scheduled edge function or cron every 15 to 30 minutes, store the trimmed JSON, and serve that from the site's own origin. One upstream call then serves every visitor, and the slow response never blocks a page.
2. **GitHub releases** (60 calls an hour per IP): same pattern, refreshed every few hours; an authenticated server token raises the limit to 5,000 an hour.

The rest can stay client-side with the caches above. Keep the timeouts, the stale fallback and the "NO SIGNAL" state, and add the provider hosts to the CSP `connect-src` list.
