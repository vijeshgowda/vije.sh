import { expect, expectAccessible, test } from "./fixtures";

test("Ctrl K opens the palette; Enter jumps to the chosen page", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard shortcut; the header button covers mobile");
  await page.goto("/");
  const box = page.getByRole("combobox", { name: /Search pages/ });
  // keys pressed before hydration are lost, so retry until the listener is there
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(box).toBeFocused({ timeout: 1000 });
  }).toPass();
  await box.fill("memory");
  await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/lab$/);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("the header button opens it, a feed entry scrolls to that feed on the Live page", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/work");
  await page.getByRole("button", { name: /^Jump to/ }).click();
  await expect(page.getByRole("dialog", { name: "Jump to" })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("combobox").fill("LF-07");
  await page.getByRole("option").first().click();
  await expect(page).toHaveURL(/\/live$/);
  await expect(page.locator("#feed-rel")).toBeInViewport();
});

test("commands run from the palette: theme and back to top", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("contentinfo")
    .getByRole("button", { name: /^Search/ })
    .click();
  await page.getByRole("combobox").fill("dark mode");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page
    .getByRole("contentinfo")
    .getByRole("button", { name: /^Search/ })
    .click();
  await page.getByRole("combobox").fill("back to top");
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});
