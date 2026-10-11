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
