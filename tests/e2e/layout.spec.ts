import { expect, test } from "./fixtures";

// Issue #35: the compact header pushed the menu button off-screen on phones.
for (const handle of [null, "abcdefghijklmnopqrstuvwx"]) {
  test(`compact header keeps the menu button on screen (${handle ? "long handle" : "guest"})`, async ({
    page,
    context,
    baseURL,
  }) => {
    if (handle) {
      // a session cookie makes the header ask /api/me; answer it without a database
      await context.addCookies([{ name: "test_session", value: "x", url: baseURL! }]);
      await page.route("**/api/me", (route) =>
        route.fulfill({
          json: { user: { handle, displayName: null, onboarded: true, roles: [] } },
        }),
      );
    }
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    const account = handle
      ? page.getByLabel(`Account: @${handle}`)
      : page.getByRole("link", { name: "Sign in", exact: true });
    await expect(account).toBeVisible();
    const menu = page.getByRole("button", { name: "Menu, current page: Overview" });
    for (const width of [320, 375, 390, 430, 440, 744]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(page.getByRole("banner")).toHaveAttribute("data-fit", "compact");
      await expect
        .poll(() => menu.evaluate((b) => b.getBoundingClientRect().right), `${width}px`)
        .toBeLessThanOrEqual(width);
      const row = await menu.evaluate((b) => ({
        scroll: b.parentElement!.scrollWidth,
        client: b.parentElement!.clientWidth,
      }));
      expect(row.scroll, `${width}px header row`).toBeLessThanOrEqual(row.client);
      // plain hamburger on phones, page label on tablets
      const label = menu.getByText("Overview");
      if (width > 640) await expect(label).toBeVisible();
      else await expect(label).toBeHidden();
    }
    await menu.click();
    await expect(page.getByRole("link", { name: /P2\s*Work/ })).toBeVisible();
  });
}

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
