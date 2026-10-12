import { expect, test } from "./fixtures";

test("main nav and chip pins navigate between pages", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) {
    const menu = page.getByRole("button", { name: /Menu, current page: Overview/ });
    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
  }
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Live/ }).click();
  await expect(page).toHaveURL(/\/live$/);
  await expect(page.getByRole("heading", { level: 1, name: "Live feeds" })).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "P3: Lab" }).click();
  await expect(page).toHaveURL(/\/lab$/);
});

test("dark mode is opt-in and survives a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
  const dark = page.getByRole("button", { name: "Dark" });
  // a click before hydration is lost, so retry until the toggle reports pressed
  await expect(async () => {
    if ((await dark.getAttribute("aria-pressed")) !== "true") await dark.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark", { timeout: 1000 });
  }).toPass();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  // the browser bar follows the theme from first paint (browsers use the first theme-color meta)
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute(
    "content",
    "#0c0d0f",
  );
});

test("flashing firmware patches the tagline and logs to the UART", async ({ page, isMobile }) => {
  test.skip(isMobile, "the firmware strip and UART are desktop-only");
  await page.goto("/");
  await page.getByRole("button", { name: "Flash v30.1.1" }).click();
  await expect(page.getByText("v30.1.1", { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText("Firmware by night, backends by day.")).toBeVisible();
  await expect(page.getByText("fw: v30.1.1 booted. tagline patched.")).toBeVisible();
});

test("the cluster reconciles and replaces a deleted pod", async ({ page }) => {
  await page.goto("/");
  const cluster = page.locator("#cluster");
  await cluster.scrollIntoViewIfNeeded();
  await expect(cluster.getByText(/^6\/6 ready/)).toBeVisible({ timeout: 10_000 });
  await cluster
    .getByRole("button", { name: /^Pod web-/ })
    .first()
    .click();
  await expect(cluster.getByText(/^6\/6 ready/)).toBeVisible({ timeout: 10_000 });
  await cluster.getByRole("button", { name: "Drain node-b" }).click();
  await expect(cluster.getByText("SchedulingDisabled")).toBeVisible();
});
