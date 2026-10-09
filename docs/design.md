# vije.sh: Design

The production design is **V18.1.1 "Datasheet, usable"**: the site as the datasheet of a chip,
VKG-04. Everything needed to build any page is in [`docs/design/`](design/):

| File | What it is |
| --- | --- |
| [18.1.1-datasheet.html](design/18.1.1-datasheet.html) | The working prototype (one file; open it in a browser, it loads `shared/content.js`). **The source of truth for look and behaviour.** |
| [18.1-datasheet.md](design/18.1-datasheet.md) | Spec of the base design: tokens, page structure, components, interactions, algorithms |
| [18.1.1-datasheet.md](design/18.1.1-datasheet.md) | What 18.1.1 changes on top of 18.1: one shadow scale, self-fitting header, Ctrl K palette, 19 feeds |
| [live-data.md](design/live-data.md) | Every live-feed endpoint, rate limit and cache time |
| [shared-content.md](design/shared-content.md) | Sample copy (bio, career, work, posts, forum threads) |

The prototype is a single-page hash-routed file with `v1811-` storage keys; the app uses real routes
(`/work`, not `#/work`) and the `vj:` storage prefix. Paths inside the spec files (`../...`) refer
to the old prototype folder.

## Tokens

All colours, shadows and spacing live in [`src/styles/tokens.css`](../src/styles/tokens.css) and are
mapped to Tailwind utilities in [`src/app/globals.css`](../src/app/globals.css) (`bg-paper`,
`text-ink`, `border-line`, `shadow-2`, `font-mono`...). Fonts are Space Grotesk and JetBrains Mono,
self-hosted by `next/font`. Light is the default and ignores the OS; dark is opt-in
(`<html data-theme="dark">`).

## Status: what is ported

| Piece (prototype function) | Where | Status |
| --- | --- | --- |
| Header: self-fitting nav, menu button, theme switch (`fitNav`) | `src/components/layout/SiteHeader.tsx` | Done |
| Footer site map | `src/components/layout/SiteFooter.tsx` | Done |
| Running head/foot, page intro, numbered sections | `src/components/ui/Datasheet.tsx` | Done |
| Buttons (cut-corner red), cards, shadows, cursors | `src/components/ui/*`, `src/styles/*` | Done |
| Hero: fitted wordmark, letter rise, dot pop, rule draw (`fitWm`, landing motion) | `src/features/overview/components/Hero.tsx`, `Wordmark.tsx` | Done |
| Chip pinout: trace draw-in, packets, tilt (`chipSVG`, `landingMotion`, `tiltChip`) | `src/features/overview/components/Chip.tsx` | Done |
| UART console (`uart`, `boot`) | `src/lib/uart.ts` (any feature can log), `Uart.tsx` | Done |
| Firmware flash + tagline patch | `src/features/overview/components/Firmware.tsx` | Done |
| Skills ticker, Features, Cluster (`mountCluster`), Peripherals + RTC (`mountRtc`), Ratings | `src/features/overview/components/*` | Done |
| Live telemetry + Live page, 19 feeds, globe, pins, filters | `src/features/live/**` | Done (server-cached, see below) |
| Latest application notes (overview section 5) | `src/features/blog/posts.ts`, `components/NoteList.tsx` | Done (git posts; DB notes join with the notes feature) |
| Work: rack, timing diagram, KPIs (`pWork`, `timingSVG`) | `src/features/work` | Done ("now" marker cached daily) |
| Lab: memory calculator, bit register (`pLab`) | `src/features/lab` | Done |
| Photo: procedural gallery, viewfinder, lightbox (`pPhoto`) | `src/features/photo` | To do |
| Blog index and post (`pBlog`, `pPost`) | `src/features/blog`, `src/lib/markdown.ts` | Done for git posts (Markdown + images, application.md section 9); DB notes to do |
| Forum (`pForum`, `pThread`) | `src/features/forum` | To do (needs auth) |
| Jump-to palette, Ctrl K (`palItems`, `goTo`) | `src/features/palette` | To do |
| Scroll reveals (`reveal`), card spotlight (`spotlight`), number scramble | `src/components/motion` | To do |
| Back to top, toasts, offline LED | `src/components/layout` | To do |
| "launch" easter egg (typed word + footer button, rocket) | `src/features/launch` | To do |

## Live feeds in production

The prototype fetched every feed from the visitor's browser. The app serves them from its own
origin instead: each feed is a `'use cache: remote'` loader (`src/features/live/server`) exposed as
`/api/feeds/[key]` and prerendered into the Live page and the overview, so one upstream call per
cache period serves every visitor and the rate limits hold. Only the ISS position (LF-01, every 5 s)
and the visitor's weather (LF-13) are fetched by the browser; the Moon (LF-14) is computed. Set
`GITHUB_TOKEN` (no scopes) in Vercel to lift the GitHub limit from 60 to 5,000 an hour.
