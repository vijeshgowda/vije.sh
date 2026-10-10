import { expect, test } from "./fixtures";

test("typing launch flies the rocket and counts the flight", async ({ page, isMobile }) => {
  test.skip(isMobile, "typing needs a keyboard; the footer button covers mobile");
  await page.goto("/work");
  const count = page.locator("footer [role=status]");
  // keys typed before hydration are lost, so retry until the listener is there
  await expect(async () => {
    await page.keyboard.type("launch");
    await expect(count).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(count).toHaveText("Liftoff");
  await expect(count).toBeHidden({ timeout: 8000 });
  expect(await page.evaluate(() => localStorage.getItem("vj:launches"))).toBe("1");
});

test("the footer button launches, with reduced motion too", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab");
  await page.getByRole("contentinfo").getByRole("button", { name: "Launch" }).click();
  const count = page.locator("footer [role=status]");
  await expect(count).toHaveText("Liftoff");
  await expect(count).toBeHidden({ timeout: 4000 });
});
