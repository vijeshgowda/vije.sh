# vije.sh

My personal site, blog and forum, designed as the datasheet of a chip (VKG-04).
Next.js 16 (App Router, Cache Components) on Vercel, Supabase Postgres + Auth, Tailwind v4.

## Run it

```
npm install
cp .env.example .env.local   # nothing is required to run the static site and live feeds
npm run dev                  # http://localhost:3000
npm run check                # lint, types, format, unit + component tests
npm run test:e2e             # Playwright + axe on a production build
```

Integration tests need a local Postgres (`docker run --rm -p 54329:5432 -e POSTGRES_PASSWORD=test
postgres:17`), then `cp .env.test.example .env.test`, `npm run db:test:setup` and `npm run test:int`.

## Docs

- [AGENTS.md](AGENTS.md): conventions for anyone (human or agent) opening a PR
- [docs/application.md](docs/application.md): architecture, auth, caching, testing
- [docs/database.md](docs/database.md): schema and migrations
- [docs/design.md](docs/design.md): the design (V18.1.1) and what's still to port

## Deploy checklist

1. Vercel: import the repo, Node 24.x, add the env vars from `.env.example` as each feature needs
   them. Optional now: `GITHUB_TOKEN` (no scopes) for the release and advisory feeds.
2. Supabase: create `app_rw` by hand (docs/database.md section 3), then `npm run db:migrate`.
3. Cloudflare DNS: grey-cloud A/CNAME records to Vercel (docs/application.md section 4.2).
