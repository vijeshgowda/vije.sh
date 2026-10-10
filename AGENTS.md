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
  prototype `.local/variations/18.1.1-datasheet.html` is the source of truth for look and
  behaviour: port from it, don't redesign. Prototypes and their specs stay in gitignored
  `.local/`, not in tracked documentation; they are not included in fresh clones.

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
| A blog post | `content/blog/<slug>/index.md`, images next to it (application.md section 9) |
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

## Subagents

- Keep planning, architecture, implementation decisions, test design and debugging with the main
  agent. Delegate only easy, bounded tasks with explicit inputs and a small result; do not offload
  work that needs broad context, substantial judgement or a large report.
- Prefer a subagent for running already-chosen tests, lint, typecheck or builds when the main
  agent only needs the outcome rather than the tool output. Other useful tasks include checking
  an explicit list of files for a known pattern or verifying a mechanical checklist.
- Use `gpt-5.6-luna` (GPT Luna) for subagent calls. If unavailable, report that limitation rather
  than silently choosing another model.
- Give each subagent the working directory, exact command or file scope, constraints, expected
  result and stopping condition. Test runners must not edit files, fix failures, install packages
  or broaden the suite unless explicitly authorised.
- Request the exact command and PASS/FAIL on completion, with test counts if available. On
  failure, require the failing test/check names and concise actionable errors; distinguish
  blocked, incomplete or skipped checks from a pass. Do not return full passing logs.
- Delegate only when it saves meaningful context or allows independent work in parallel; run
  quick checks directly when delegation costs more than it saves. Avoid duplicate runs and
  concurrent commands that write the same build/test artifacts.
- Wait for completion before claiming validation or opening a PR. The main agent interprets
  failures, makes fixes and remains responsible for the final result.

## AI commit and PR attribution

- When explicitly asked to create a commit, include AI attribution in the commit message.
  This policy does not itself authorise committing, pushing, or rewriting existing commits.
- Keep the owner's Git author, committer, credentials, and signing configuration unchanged.
  Attribute the assisting model using Git trailers, not `--author` or Git identity changes.
- Choose the co-author by the actual model provider, not the tool or account running it:
  - Anthropic models (Claude), including Claude used through Copilot:
    `Co-authored-by: Claude <noreply@anthropic.com>`
  - OpenAI models (GPT/Codex), including those used through Copilot:
    `Co-authored-by: Codex <noreply@openai.com>`
  - Other providers:
    `Co-authored-by: Copilot <copilot@github.com>`
- Add `Model: <exact model name>` alongside the co-author trailer. Use the model name exposed
  by the session or explicitly supplied by the owner, including its version when available.
  Never infer a model from the tool name or invent a model identity. If the model name or
  provider is unavailable, ask the owner before committing.
- Put trailers at the end of the commit message, separated from its body by a blank line.
  Include attribution only for models that contributed to that commit; for multiple models,
  list each distinct co-author once and each contributing model in its own `Model:` trailer.
- Preserve these trailers when preparing squash or merge commit messages. GitHub account
  linking and contributor display depend on GitHub's handling of the co-author email; these
  trailers do not authenticate as the co-author or guarantee a contributor avatar.
- Include the same provider-based co-author and exact model attribution in the PR body, without
  replacing or reordering the repository PR template. When several models contribute, identify
  each model's role; do not attribute changes to a model that only ran validation.

Example for an OpenAI model (replace the placeholder with the actual model name):

```text
fix(live): handle missing timestamps

Co-authored-by: Codex <noreply@openai.com>
Model: <exact model name>
```

## Workflow and current state

- Branch from `main` as `feat/<feature>` (or `fix/...`, `docs/...`), commit, push, open a PR with
  `gh pr create`. CI (`.github/workflows/ci.yml`) must pass; the owner reviews and merges.
- What's built and what's left, per feature folder: the status table in
  [docs/design.md](docs/design.md). Update that table in the PR that ports a piece.
- Decisions already made (don't reopen without asking): 7 real routes; live feeds cached on the
  server (`'use cache: remote'` + `/api/feeds/[key]`), only ISS and weather fetched by the browser;
  Supabase Auth for identity only, roles in `app.user_roles`; `pg` with raw SQL, no ORM; hybrid
  blog (Markdown in git + DB notes); Vercel Hobby, Cloudflare DNS-only.
