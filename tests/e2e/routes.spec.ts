import type { Page } from "@playwright/test";
import { expect, expectAccessible, test } from "./fixtures";
import { createUser, deleteUser } from "./fixtures";
import { testClient } from "../helpers/db";

// Every route in the app (docs/application.md 13.5): a route without a feature test fails here.
const ROUTES = [
  { path: "/", h1: "vije.sh" },
  { path: "/work", h1: "Deployments" },
  { path: "/lab", h1: "Lab" },
  { path: "/photo", h1: "Contact sheet" },
  { path: "/blog", h1: "Application notes" },
  { path: "/blog/planning-this-site", h1: "Planning this site" },
  { path: "/forum", h1: "Forum" },
  { path: "/forum/engineering", h1: "Engineering" },
  { path: "/live", h1: "Live feeds" },
  { path: "/login", h1: "Sign in" },
  { path: "/welcome", h1: "Welcome" },
  { path: "/guidelines", h1: "Community guidelines" },
];

// Staff routes, checked as the owner; tests/e2e/admin.spec.ts covers who may open them.
const ADMIN_ROUTES = [
  { path: "/admin", h1: "Overview" },
  { path: "/admin/members", h1: "Members" },
  { path: "/admin/reports", h1: "Reports" },
  { path: "/admin/log", h1: "Moderation log" },
  { path: "/admin/notes", h1: "Notes" },
  { path: "/admin/categories", h1: "Categories" },
  { path: "/admin/notes/new", h1: "New note" },
];

async function expectRoute(page: Page, r: { path: string; h1: string }) {
  // intro animations fade text in; axe would measure contrast mid-fade
  await page.emulateMedia({ reducedMotion: "reduce" });
  const res = await page.goto(r.path);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: r.h1 })).toBeVisible();
  await expect(page.getByRole("banner")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expectAccessible(page);
}

for (const r of ROUTES) {
  test(`${r.path} renders, has no a11y violations and no horizontal scroll`, async ({ page }) => {
    await expectRoute(page, r);
  });
}

for (const r of ADMIN_ROUTES) {
  test(`${r.path} (owner) renders, has no a11y violations and no horizontal scroll`, async ({
    page,
    asOwner,
  }) => {
    expect(asOwner.handle).toBeTruthy();
    await expectRoute(page, r);
  });
}

test("unknown routes return a 404 page", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Bus fault" })).toBeVisible();
});

test("security headers are set", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});

test("robots, sitemap and the feeds API", async ({ request }) => {
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /api/");
  expect(await (await request.get("/sitemap.xml")).text()).toContain("/live</loc>");
  const feed = await request.get("/api/feeds/hn");
  expect(feed.status()).toBe(200);
  expect(await feed.json()).toMatchObject({ key: "hn", ok: false, error: "offline" });
  expect((await request.get("/api/feeds/nope")).status()).toBe(404);
});

test("coastline data is cached by the browser", async ({ request }) => {
  for (const res of ["110m", "50m"]) {
    const r = await request.get(`/data/land-${res}.json`);
    expect(r.status()).toBe(200);
    expect(r.headers()["cache-control"]).toContain("max-age=604800");
  }
});

test("/admin/members/[handle] and a member search (owner) render accessibly", async ({
  page,
  asOwner,
}) => {
  expect(asOwner.handle).toBeTruthy();
  const member = await createUser({ roles: [{ role: "moderator", category: "games" }] });
  try {
    await expectRoute(page, { path: `/admin/members/${member.handle}`, h1: `@${member.handle}` });
    await expectRoute(page, { path: `/admin/members?q=${member.handle}`, h1: "Members" });
  } finally {
    await deleteUser(member.id);
  }
});

// Member profiles render on first request; a fresh member's has no posts yet.
test("/u/[handle] renders, has no a11y violations and no horizontal scroll", async ({
  page,
  asMember,
}) => {
  await expectRoute(page, { path: `/u/${asMember.handle}`, h1: asMember.handle! });
});

// The report queue and the log with something in them: open thread and profile reports, a
// resolved one, and a hidden thread's log row (with its Unhide button).
test("/admin/reports and /admin/log with entries (owner) render accessibly", async ({
  page,
  asOwner,
}) => {
  const author = await createUser();
  const reporter = await createUser();
  const db = testClient();
  await db.connect();
  let threadId = "0";
  try {
    const { rows } = await db.query<{ id: string }>(
      `insert into app.threads (category_id, author_id, title, body_md, hidden_at)
       select id, $1, 'Routes report check', 'Body.', now() from app.categories where slug = 'games'
       returning id::text as id`,
      [author.id],
    );
    threadId = rows[0]!.id;
    await db.query(
      `insert into app.reports (reporter_id, thread_id, profile_id, reason)
       values ($1, $2, null, 'Spam or advertising'), ($1, null, $3, 'Harassment or abuse')`,
      [reporter.id, threadId, author.id],
    );
    await db.query(
      `insert into app.reports (reporter_id, profile_id, reason, status, resolved_by, resolved_at)
       values ($1, $2, 'Spam or advertising', 'dismissed', $3, now())`,
      [author.id, reporter.id, asOwner.id],
    );
    await db.query(
      `insert into app.moderation_log (actor_id, action, thread_id, note)
       values ($1, 'hide', $2, 'Routes check')`,
      [asOwner.id, threadId],
    );
    await expectRoute(page, { path: "/admin/reports", h1: "Reports" });
    await expect(page.getByRole("article").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "Resolved reports" })).toBeVisible();
    await expectRoute(page, { path: "/admin/log", h1: "Moderation log" });
    await expect(page.getByRole("button", { name: /^Unhide thread/ }).first()).toBeVisible();
  } finally {
    await db.query("delete from app.threads where id = $1", [threadId]);
    await db.end();
    await deleteUser(author.id);
    await deleteUser(reporter.id);
  }
});
