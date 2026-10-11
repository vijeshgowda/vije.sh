import { expect, expectAccessible, test } from "./fixtures";

// Every route in the app (docs/application.md 13.5): a route without a feature test fails here.
const ROUTES = [
  { path: "/", h1: "vije.sh" },
  { path: "/work", h1: "Deployments" },
  { path: "/lab", h1: "Lab" },
  { path: "/photo", h1: "Contact sheet" },
  { path: "/blog", h1: "Application notes" },
  { path: "/blog/planning-this-site", h1: "Planning this site" },
  { path: "/forum", h1: "The bus" },
  { path: "/live", h1: "Live feeds" },
  { path: "/login", h1: "Sign in" },
  { path: "/welcome", h1: "Welcome" },
  { path: "/guidelines", h1: "Community guidelines" },
];

for (const r of ROUTES) {
  test(`${r.path} renders, has no a11y violations and no horizontal scroll`, async ({ page }) => {
    // intro animations fade text in; axe would measure contrast mid-fade
    await page.emulateMedia({ reducedMotion: "reduce" });
    const res = await page.goto(r.path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: r.h1 })).toBeVisible();
    await expect(page.getByRole("banner")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expectAccessible(page);
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
