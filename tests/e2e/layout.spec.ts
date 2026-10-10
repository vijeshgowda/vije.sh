import { expect, test } from "./fixtures";

test("back to top appears after scrolling and returns to the top", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const top = page.getByRole("button", { name: "Top", exact: true });
  await expect(top).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, window.innerHeight * 2));
  await expect(top).toBeVisible();
  await top.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator("#main")).toBeFocused();
  await expect(top).toBeHidden();
});

test("going offline greys the LED and says so; coming back says that too", async ({
  page,
  context,
}) => {
  await page.goto("/work");
  await expect(page.locator("html")).not.toHaveAttribute("data-offline");
  const offline = page.getByRole("status").filter({ hasText: "Offline." });
  // an event fired before hydration is missed, so retry until the listener is there
  await expect(async () => {
    await context.setOffline(false);
    await context.setOffline(true);
    await expect(offline).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(page.locator("html")).toHaveAttribute("data-offline", "");
  await context.setOffline(false);
  await expect(page.locator("html")).not.toHaveAttribute("data-offline");
  await expect(page.getByRole("status").filter({ hasText: "Back online." })).toBeVisible();
});
