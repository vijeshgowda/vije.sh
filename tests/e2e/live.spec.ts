import { expect, test } from "./fixtures";

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
