# vije.sh: Design

The production design is **V18.1.1 "Datasheet, usable"**: the site as the datasheet of a chip,
VKG-04. Prototypes and their specs live in gitignored `.local/variations/`, not in tracked
documentation. These local references are not included in fresh clones; this document records
the production design and implementation status.

| File | What it is |
| --- | --- |
| `.local/variations/18.1.1-datasheet.html` | The working prototype (one file; open it in a browser, it loads `shared/content.js`). **The source of truth for look and behaviour.** |
| `.local/variations/docs/18.1-datasheet.md` | Spec of the base design: tokens, page structure, components, interactions, algorithms |
| `.local/variations/docs/18.1.1-datasheet.md` | What 18.1.1 changes on top of 18.1: one shadow scale, self-fitting header, Ctrl K palette, 19 feeds |
| `.local/variations/docs/live-data.md` | Every live-feed endpoint, rate limit and cache time |
| `.local/variations/docs/shared-content.md` | Sample copy (bio, career, work, posts, forum threads) |

The prototype is a single-page hash-routed file with `v1811-` storage keys; the app uses real routes
(`/work`, not `#/work`) and the `vj:` storage prefix. Paths inside the spec files (`../...`) refer
to the local prototype folder.

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
| Skills ticker, Features, Cluster (`mountCluster`), Peripherals + RTC (`mountRtc`) + GTA VI countdown (TIM card, computed, 00:00 UK on 19 Nov 2026; logo self-hosted from Wikimedia Commons), Ratings | `src/features/overview/components/*` | Done |
| Live telemetry + Live page, 19 feeds, globe, pins, filters | `src/features/live/**` | Done (server-cached, see below; the overview warms /live's browser data when idle: `LivePreload`) |
| Latest application notes (overview section 5) | `src/features/blog/server/catalog.ts`, `components/NoteList.tsx` | Done (git posts and published DB notes) |
| Work: rack, timing diagram, KPIs (`pWork`, `timingSVG`) | `src/features/work` | Done ("now" marker cached daily) |
| Lab: memory calculator, bit register (`pLab`) | `src/features/lab` | Done |
| Photo: procedural gallery, viewfinder, lightbox (`pPhoto`) | `src/features/photo` | To do |
| Blog index and post (`pBlog`, `pPost`) | `src/features/blog`, `src/lib/markdown.ts` | Done: git posts (Markdown + images) and DB notes (sanitised), application.md section 9; notes are written in `/admin/notes`; Mermaid diagrams (client island, 9.3.1; not in the prototype); posts fill the centred page wrap rather than the prototype's 42rem left column, with type that scales up on wide screens and images capped to the screen height (#68) |
| Forum (`pForum`, `pThread`) | `src/features/forum` (`ThreadList`, `ForumBar`, `FrameList`, `ThreadIntro`, `NewThread`, `ReplyForm`, `FrameToolbar`) | Done: `/forum`, `/forum/[category]` (chips as links), `/forum/[category]/[thread]` with frames and sanitised Markdown; new-thread dialog, `form.reply` and edit own post (30 min) as client islands, rate-limited (PR6). Everyone reads staff-only categories; only their staff start threads there |
| Sign-in, onboarding, user menu (not in the prototype) | `src/features/auth` (`/login`, `/welcome`, `/guidelines`, `UserMenu` in the header) | Done (OAuth via Supabase; Turnstile on `/welcome`). Guest "Sign in" uses the shared outlined button with a 44 px minimum height; theme switch unchanged (#66) |
| Admin area (not in the prototype; nav uses the forum's category chips) | `src/app/(site)/admin`, `src/features/admin` (`AdminNav`, `AdminStats`, `MemberTable`, `MemberProfile`, `MemberForms`; categories from `src/features/admin/categories`; reports and log from `src/features/moderation/reports`; notes from `src/features/blog/notes/components`) | Done: overview stats (notes = git posts + database notes) and members (search, roles, bans; PR5), notes (`/admin/notes`, new, `[id]` editor with sanitised preview, publish/unpublish/delete; PR4), categories (create, rename, reorder, staff-only toggle, delete empty; PR7), reports and log (PR9) |
| Jump-to palette, Ctrl K (`palItems`, `goTo`) | `src/features/palette` (header "Jump to" + footer "Search", mounted by `SiteFooter`) | Done, including the 50 latest forum threads, fetched from `/api/palette/threads` (cached, forum tags) when the palette opens so pages don't carry them (PR10) |
| Scroll reveals (`reveal`), card spotlight (`spotlight`), number scramble | `src/components/motion` (`Reveal` / `useReveal`, `Spotlight`, `scramble`) | Done (only content below the fold on mount is hidden; `data-scramble` marks numbers). Faster than the prototype on purpose (#55): 280 ms, 30 ms stagger up to 4 steps, starts 10% before the viewport |
| Inline moderation: hide/unhide, lock, pin, move, reveal hidden text (not in the prototype) | `src/features/moderation` (`STAFF_TOOLS` in `FRAME_TOOLS`, `HiddenThreadNotice`) | Done (PR8): staff in scope get Hide, Reveal, Unhide on frames and Lock, Pin, Move on frame 00; a hidden thread is a 404 with a staff notice to reveal or unhide it |
| Reports: Report button, `/admin/reports` queue, `/admin/log` (not in the prototype) | `src/features/moderation/reports` (`reportTool` in `FRAME_TOOLS`, `ProfileReport`, `ReportQueue`, `ModerationLog`) | Done (PR9): members report threads, replies and profiles once each (reason + details, 5/20 a day); the queue groups open reports by target with Hide, Mark actioned and Dismiss; the log pages every staff action and unhides hidden threads. Moderators don't see the queue (superuser and owner only) |
| Public profiles `/u/[handle]` (not in the prototype; built from the page intro, the `.regs` strip and `ol.threads` rows) | `src/features/profile` (`getProfile`, `ProfileRegs`, `PostList`); `AuthorName` in frames links to it | Done (PR10): handle (any casing redirects to the stored one), highest global role, joined date, counts and the 20 latest visible posts; unknown or unfinished accounts 404, banned members keep theirs, empty profiles are `noindex`. The provider-prefilled display name isn't shown until members can edit it. Visible threads are in `sitemap.xml` |
| Back to top, toasts, offline LED | `src/components/layout` (`BackToTop`, `Toaster` + `toast()`, `NetStatus`) | Done |
| "launch" easter egg (typed word + footer button, rocket) | `src/features/launch` (`launch()`, `<Launch />` in the footer) | Done |

## Roadmap: roles, forum and admin

The work is split into stacked PRs in three waves. Only PR1 adds a migration (`0003_staff_roles`),
so parallel branches never collide on migration numbers. Roles: members are implicit; moderators
are global or scoped to one category; superusers are global; the owner is the single `admin` row
(labelled "Owner"). See application.md 8.7 for the permission table.

| PR | Branch | What | Status |
| --- | --- | --- | --- |
| PR1 | `feat/roles` | Migration 0003 (`superuser`, one-owner index, owner write guard, category log actions), `can()` rules, `requireUser` / `requireCan` guards, `/api/me` grants, admin skeleton, role fixtures | Merged (#40) |
| PR2 | `feat/markdown-sanitize` | `renderMarkdown(..., { mode: "sanitised" })`, pure rate-limit rules (`src/lib/rate-limit.ts`) | Merged (#37) |
| PR3 | `feat/forum-read` | `/forum`, `/forum/[category]`, `/forum/[category]/[thread]`, cached queries with `forum` / `category:<slug>` / `thread:<id>` tags | Merged (#39) |
| PR4 | `feat/notes-admin` | Part 1: notes data layer, git slug manifest, `/blog` merges notes. Part 2: `/admin/notes` list, new, editor with preview (owner only), publish e2e | In review (#38) |
| PR5 | `feat/admin-members` | `/admin` stats, `/admin/members` search (50 per page), member page: grant/revoke roles, ban/lift, each with a `moderation_log` row in one transaction | In review (#43) |
| PR6 | `feat/forum-write` | New thread, reply, edit own (30 min); limits in `forum/limits.ts`; new-thread dialog, `form.reply`, `FrameToolbar` island; staff-only categories readable by everyone | In review (#44) |
| PR7 | `feat/admin-categories` | Create, rename (slugs never change), reorder, staff-only toggle, delete empty categories; logged; revalidates `forum` | In review (#45, stacked on #38) |
| PR8 | `feat/moderation-inline` | Hide/unhide, lock, pin, move with log rows; staff reveal of hidden text as plain `<pre>`; `StaffControls` | In review (#47, stacked on #44) |
| PR9 | `feat/reports` | Report button (thread, reply, profile), `/admin/reports` queue, `/admin/log` with unhide | In review (#48, stacked on #47 with #43 and #46 merged in) |
| PR10 | `feat/profiles` | `/u/[handle]` (tag `profile:<id>`), forum threads in the palette and sitemap, this table | In review (#46, stacked on #44) |

Owner steps outside the code:

- [ ] Make yourself owner in dev, then prod (database.md, first admin: handle `vijesh`, then the
      three checks and `/api/me`).
- [ ] Apply migration 0003 with `npx supabase db push --db-url <url>` on dev, check `/admin` on a
      preview deploy, then prod.
- [ ] Keep prod sign-ups off until the forum launches (application.md 8.4).
- [ ] Phase L: turn prod sign-ups back on, sign in on a preview deploy with each provider, open the
      forum.

Open decisions:

- Settled in PR6: staff-only categories (e.g. Announcements) are read by everyone, members reply
  there, and only staff (global or category moderators, superusers, the owner) start threads; the
  new-thread picker leaves them out for everyone else (database.md `staff_only`).
- Reports wait for a superuser or the owner, because moderators have no `/admin`; an inline
  "Reported" badge for moderators can come later.
- Thread URLs stay id-only (`/forum/engineering/42`).

Out of scope for now: forum search, account and bio editing, account deletion, notifications and
image uploads.

## Live feeds in production

The prototype fetched every feed from the visitor's browser. The app serves them from its own
origin instead: each feed is a `'use cache: remote'` loader (`src/features/live/server`) exposed as
`/api/feeds/[key]` and prerendered into the Live page and the overview, so one upstream call per
cache period serves every visitor and the rate limits hold. Only the ISS position (LF-01, every 5 s)
and the visitor's weather (LF-13) are fetched by the browser; the Moon (LF-14) is computed. While
the overview's hero plays, `LivePreload` (idle, skipped on data saver) warms those two into the
caches the Live cards read (`client/iss.ts` in memory, `client/weather.ts` in localStorage), plus
the big globe's coastlines, so a visit to /live renders them without another round trip. Set
`GITHUB_TOKEN` (no scopes) in Vercel to lift the GitHub limit from 60 to 5,000 an hour.

The Live page departs from the prototype's grid on purpose (issue #19): LF-01 spans two columns
with a bigger globe (50m coastlines, finer dot grid and graticule) and a side column for readouts,
the picked earthquake, layer toggles and view controls; the launch manifest sits beside it in one
column, earthquakes (LF-16) fill the second row and Hacker News takes LF-16's old place
(`LIVE_ORDER` / `liveSize()` in `src/features/live/catalog.ts`). The overview keeps the
prototype's layout. Earthquake markers use their own `--quake` token so they never read as the
red ISS. LF-02 shows how many launches have a target date in the current UTC month next to its
title (a second Launch Library call, `limit=1`, reading `count`) and lists the nearest 5 of the
next 15, with "Show 10 more".
