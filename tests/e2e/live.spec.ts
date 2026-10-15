import { expect, test } from "./fixtures";

const QUAKES = {
  ok: true,
  key: "eq",
  at: Date.now(),
  data: {
    total: 42,
    events: [
      {
        mag: 6.3,
        place: "south of the Kermadec Islands",
        time: Date.now() - 3_600_000,
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/test1",
        lon: -178.4,
        lat: -32.1,
        depth: 35,
      },
      {
        mag: 4.7,
        place: "near the coast of Peru",
        time: Date.now() - 7_200_000,
        url: null,
        lon: -77.1,
        lat: -12.3,
        depth: 60,
      },
    ],
  },
};

test("picking an earthquake shows its details beside the globe", async ({ page }) => {
  await page.route("**/api/feeds/eq", (route) => route.fulfill({ json: QUAKES }));
  await page.goto("/live");
  const eq = page.locator('[data-feed="eq"]');
  await eq.scrollIntoViewIfNeeded();
  await expect(eq.getByText("42", { exact: true })).toBeVisible();
  const row = eq.getByRole("button", { name: /Kermadec.*Show on the globe/ });
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");

  const panel = page
    .locator('[data-feed="iss"]')
    .getByRole("region", { name: "Selected earthquake" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("M6.3");
  await expect(panel).toContainText("depth 35 km");
  await expect(panel.getByRole("link", { name: "USGS event" })).toHaveAttribute(
    "href",
    QUAKES.data.events[0]!.url!,
  );
  await expect(page.locator('[data-feed="iss"]')).toContainText("42 in 24 h");
  await panel.getByRole("button", { name: "Close earthquake details" }).click();
  await expect(panel).toHaveCount(0);
});

test("the Live page leads with a big globe, the manifest beside it and quakes below", async ({
  page,
}, info) => {
  test.skip(info.project.name === "mobile", "desktop grid");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/live");
  const box = (k: string) => page.locator(`[data-feed="${k}"]`).boundingBox();
  const [iss, man, eq, crew] = await Promise.all(["iss", "man", "eq", "crew"].map(box));
  expect(iss!.width).toBeGreaterThan(man!.width * 1.8);
  expect(Math.abs(iss!.y - man!.y)).toBeLessThan(2);
  expect(eq!.y).toBeGreaterThan(iss!.y + iss!.height);
  expect(eq!.width).toBeGreaterThan(iss!.width);
  expect(crew!.y).toBeGreaterThan(eq!.y);
});

test("the launch manifest counts this month and shows up to 15 launches", async ({ page }) => {
  const launches = Array.from({ length: 15 }, (_, i) => ({
    name: `Test launch ${i + 1}`,
    net: new Date(Date.now() + (i + 1) * 86_400_000).toISOString(),
    status: "Go",
    statusName: "Go for Launch",
    provider: "Test Rockets",
    location: "Cape Canaveral, FL, USA",
    lat: 28.5,
    lon: -80.6,
    orbit: "LEO",
  }));
  await page.route("**/api/feeds/man", (route) =>
    route.fulfill({
      json: {
        ok: true,
        key: "man",
        at: Date.now(),
        data: { launches, month: { start: "2026-10-01T00:00:00.000Z", count: 16 } },
      },
    }),
  );
  await page.goto("/live");
  const man = page.locator('[data-feed="man"]');
  await man.scrollIntoViewIfNeeded();
  await expect(man.getByRole("heading")).toContainText("16 launches this month");
  await expect(man.getByRole("listitem")).toHaveCount(5);
  await man.getByRole("button", { name: "Show 10 more" }).click();
  await expect(man.getByRole("listitem")).toHaveCount(15);
  await man.getByRole("button", { name: "Show fewer" }).click();
  await expect(man.getByRole("listitem")).toHaveCount(5);
});

test("globe layers and view controls", async ({ page }) => {
  await page.route("**/api/feeds/eq", (route) => route.fulfill({ json: QUAKES }));
  await page.goto("/live");
  const iss = page.locator('[data-feed="iss"]');
  const layers = iss.getByRole("group", { name: "Layers" });
  const quakes = layers.getByRole("button", { name: "Earthquakes (LF-16)" });
  await expect(quakes).toHaveAttribute("aria-pressed", "true");
  await quakes.click();
  await expect(quakes).toHaveAttribute("aria-pressed", "false");
  const pause = iss.getByRole("button", { name: "Pause rotation" });
  await pause.click();
  await expect(pause).toHaveAttribute("aria-pressed", "true");
  await iss.getByRole("button", { name: "Reset view" }).click();

  // picking a quake from the list turns its layer back on
  await page
    .locator('[data-feed="eq"]')
    .getByRole("button", { name: /Kermadec.*Show on the globe/ })
    .click();
  await expect(quakes).toHaveAttribute("aria-pressed", "true");
});

test("the globe redraws its map only while it turns", async ({ page }) => {
  await page.goto("/live");
  const iss = page.locator('[data-feed="iss"]');
  const map = iss.locator('canvas[data-layer="map"]');
  await expect(map).toHaveCount(1);
  const pixels = () =>
    map.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let h = 0;
      for (let i = 3; i < d.length; i += 4) h = (h * 31 + d[i]!) | 0;
      return h;
    });
  const changes = async () => {
    const a = await pixels();
    await page.waitForTimeout(400);
    return a !== (await pixels());
  };
  await expect.poll(changes).toBe(true);
  await iss.getByRole("button", { name: "Pause rotation" }).click();
  await page.waitForTimeout(100);
  expect(await changes()).toBe(false);
});

test("every feed shows a status, offline feeds offer a retry", async ({ page }) => {
  await page.goto("/live");
  const cards = page.locator("[data-feed]");
  await expect(cards).toHaveCount(19);
  const hn = page.locator('[data-feed="hn"]');
  await hn.scrollIntoViewIfNeeded();
  await expect(hn.getByText("NO SIGNAL", { exact: true })).toBeVisible();
  await expect(hn.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.locator('[data-feed="moon"]').getByText("COMPUTED")).toBeVisible();
});

for (const width of [390, 1280]) {
  test(`reset button clears the filter chips at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/live");
    const reset = await page.getByRole("button", { name: "Reset to LF-01 to LF-03" }).boundingBox();
    const chip = await page
      .getByRole("group", { name: "Filter feeds" })
      .getByRole("button")
      .first()
      .boundingBox();
    expect(reset!.y + reset!.height).toBeLessThanOrEqual(chip!.y);
  });
}

test("category filter and pins drive the overview", async ({ page }) => {
  await page.goto("/live");
  const filters = page.getByRole("group", { name: "Filter feeds" });
  await filters.getByRole("button", { name: /^AI/ }).click();
  await expect(page.locator("[data-feed]:visible")).toHaveCount(2);
  await filters.getByRole("button", { name: /^All/ }).click();

  const moon = page.locator('[data-feed="moon"]');
  await moon.getByRole("button", { name: "Add to overview" }).click();
  await expect(moon.getByRole("button", { name: "On overview" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.locator('[data-feed="hn"]').getByRole("button", { name: "On overview" }).click();

  await page.goto("/");
  const tele = page.locator("#telemetry");
  await expect(tele.locator('[data-feed="moon"]')).toBeVisible();
  await expect(tele.locator('[data-feed="hn"]')).toHaveCount(0);

  await page.goto("/live");
  await page.getByRole("button", { name: "Reset to LF-01 to LF-03" }).click();
  await page.goto("/");
  await expect(page.locator("#telemetry [data-feed]")).toHaveCount(3);
});

test("the overview warms /live while the hero plays", async ({ page }) => {
  // stand-ins for the browser-fetched APIs; registered after the fixture's blocker, so they win
  const calls = { iss: 0, track: 0, geo: 0, wx: 0, land: [] as string[] };
  await page.route("https://api.wheretheiss.at/**", (route) => {
    const track = route.request().url().includes("/positions");
    calls[track ? "track" : "iss"]++;
    return route.fulfill({
      json: track
        ? [{ latitude: 10, longitude: 20 }]
        : { latitude: 51.5, longitude: -0.1, altitude: 420, velocity: 27_600 },
    });
  });
  await page.route("https://geocoding-api.open-meteo.com/**", (route) => {
    calls.geo++;
    return route.fulfill({
      json: { results: [{ latitude: 48.85, longitude: 2.35, name: "Paris" }] },
    });
  });
  await page.route("https://api.open-meteo.com/**", (route) => {
    calls.wx++;
    return route.fulfill({
      json: {
        current: {
          temperature_2m: 18.4,
          relative_humidity_2m: 60,
          wind_speed_10m: 12,
          weather_code: 3,
          pressure_msl: 1015,
        },
        daily: {
          sunrise: ["2026-10-15T07:30"],
          sunset: ["2026-10-15T18:40"],
          temperature_2m_max: [20],
          temperature_2m_min: [11],
        },
      },
    });
  });
  page.on("request", (r) => {
    const m = /\/data\/land-(\w+)\.json$/.exec(r.url());
    if (m) calls.land.push(m[1]!);
  });

  await page.goto("/");
  const { width, height } = page.viewportSize()!;
  const res = Math.min(width, height) >= 700 ? "50m" : "110m";
  await expect
    .poll(() => ({ ...calls, land: calls.land.includes(res), track: calls.track > 0 }))
    .toMatchObject({ geo: 1, wx: 1, land: true, track: true });
  const before = structuredClone(calls);

  // client-side navigation keeps the warmed caches
  await page
    .locator("#telemetry")
    .getByRole("link", { name: /Pick feeds/ })
    .click();
  await expect(page).toHaveURL(/\/live$/);
  // the overview stays in the DOM (hidden) after a client navigation: look inside /live only
  const live = page.locator("#catalogue");
  const wx = live.locator('[data-feed="wx"]');
  await wx.scrollIntoViewIfNeeded();
  await expect(wx).toContainText("18.4");
  await expect(wx).toContainText("Paris");
  await expect(live.locator('[data-feed="iss"]')).not.toContainText("ACQUIRING");
  expect(calls).toMatchObject({
    geo: before.geo,
    wx: before.wx,
    track: before.track,
    land: before.land,
  });
});
