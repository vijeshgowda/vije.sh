<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on vije.sh

Personal site + blog + forum. Next.js 16 App Router (Cache Components on), TypeScript strict,
Tailwind v4 + CSS Modules, Supabase Postgres via `pg`, Supabase Auth for identity only, Vercel.
Several agents work in parallel on separate branches; keep changes inside your feature's folder.

## Read first

- [docs/application.md](docs/application.md): stack, structure, auth, caching, testing rules.
- [docs/database.md](docs/database.md): schema, migrations, `pg` conventions.
- [docs/design.md](docs/design.md): the chosen design (V18.1.1), what's ported, what's left. The
  prototype [docs/design/18.1.1-datasheet.html](docs/design/18.1.1-datasheet.html) is the source of
  truth for look and behaviour: port from it, don't redesign.

## Commands

```
npm run dev            # http://localhost:3000
npm run check          # lint + typecheck + format check + unit/component tests (run before every PR)
npm run test:e2e       # Playwright on a production build (FEEDS_OFFLINE=1, third-party requests blocked)
npm run db:test:setup  # rebuild the local test database (needs TEST_DATABASE_URL, see .env.test.example)
npm run test:int       # integration tests against that database
npm run format         # Prettier
```

## Where things go

| You are adding | Put it in |
| --- | --- |
| A page | `src/app/(site)/<route>/page.tsx` (thin: fetch + compose) |
| Feature code (queries, actions, components) | `src/features/<feature>/` (see application.md section 6) |
| A shared design primitive | `src/components/ui/` (+ `.module.css`) |
| Colours, shadows, spacing | `src/styles/tokens.css` only |
| Site-wide config (pages, nav, storage prefix) | `src/config/site.ts` |
| Profile copy | `src/content/profile.ts` |
| A table or column | new `supabase/migrations/NNNN_name.sql` + `src/db/types.ts` in the same PR |
| An env var | `src/lib/env.ts` (zod group) + `.env.example` |
| A live feed | `src/features/live/`: catalog entry, loader + parser, body component, test |
| A UART log line | `uart("...")` from `src/lib/uart.ts` |

Feature folders that exist or are planned: `overview`, `live`, `work`, `lab`, `photo`, `blog`,
`forum`, `auth`, `moderation`, `palette`, `launch`, `system`. Shared files (`src/config/site.ts`,
`src/components/**`, `src/styles/**`, `globals.css`, `next.config.ts`, `package.json`) are merge
hot spots: change them in small, separate commits and say so in the PR.

## Rules

- **Server first.** Pages are static or cached. Never read cookies/headers in a page (it makes the
  route dynamic); signed-in UI is a client island. Use `"use client"` only for interactive leaves.
- **Cache Components is on.** Uncached data and request-time APIs must sit under `<Suspense>` or
  inside `'use cache'`. Don't call `Date.now()`/`Math.random()` while rendering; read time in
  effects or use `useNow()` (`src/features/live/client/use-now.ts`) so prerendered HTML is stable.
- **SQL only in `features/*/queries.ts` and `mutations.ts`**, parameterised (`$1`), via
  `@/lib/db`. ESLint blocks `@/lib/db` imports from pages and components.
- **Server Actions:** parse (zod) -> current user -> `can()` (`src/lib/authz.ts`) -> rate limit ->
  mutation -> `revalidateTag(tag, "max")` / `updateTag(tag)`.
- **Untrusted data:** upstream JSON goes through the readers in `features/live/server/json.ts`;
  URLs through `safeUrl()` (http/https only); database Markdown is sanitised. Never use
  `dangerouslySetInnerHTML` with user or API data.
- **External links:** `target="_blank" rel="noopener noreferrer" aria-describedby="newtab"`.
- **Motion:** gate animations with `@media (prefers-reduced-motion: no-preference)`; everything
  must still work without motion.
- **Accessibility:** every route passes axe (serious/critical) in `tests/e2e/routes.spec.ts`; add new
  routes to that list. No single-key shortcuts (WCAG 2.1.4).
- **Storage keys** use `storage` / `createStoredValue` from `src/lib` (prefix `vj:`).
- **Tests come with the change:** unit tests next to the code (`*.test.ts`), component tests
  (`*.test.tsx`), integration (`*.int.test.ts`), a Playwright spec for new user flows. Coverage
  limits in `vitest.config.mts` only go up. No `.only` / `.skip`.
- **CSS:** Tailwind for layout and spacing; CSS Modules for signature pieces. Define keyframes in the
  module that uses them (module animation names are scoped).
- Small PRs, one feature each. Don't edit migrations that have been applied.
- Shell is fish on the owner's machine: avoid bash-only syntax in scripts and docs.

## Workflow and current state

- Branch from `main` as `feat/<feature>` (or `fix/...`, `docs/...`), commit, push, open a PR with
  `gh pr create`. CI (`.github/workflows/ci.yml`) must pass; the owner reviews and merges.
- What's built and what's left, per feature folder: the status table in
  [docs/design.md](docs/design.md). Update that table in the PR that ports a piece.
- Decisions already made (don't reopen without asking): 7 real routes; live feeds cached on the
  server (`'use cache: remote'` + `/api/feeds/[key]`), only ISS and weather fetched by the browser;
  Supabase Auth for identity only, roles in `app.user_roles`; `pg` with raw SQL, no ORM; hybrid
  blog (Markdown in git + DB notes); Vercel Hobby, Cloudflare DNS-only.
