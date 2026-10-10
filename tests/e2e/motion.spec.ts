import { expect, test } from "./fixtures";

test("sections below the fold fade in as they scroll into view", async ({ page }) => {
  await page.goto("/");
  const ratings = page.locator("#ratings tbody tr").first();
  await expect(ratings).toHaveCSS("opacity", "0");
  await ratings.scrollIntoViewIfNeeded();
  await expect(ratings).toHaveCSS("opacity", "1");
  // the scramble settles back on the real values
  await expect(page.locator("#ratings tbody tr").nth(2).locator("td").nth(4)).toHaveText("45");
});

test("with reduced motion nothing is hidden", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#ratings tbody tr").first()).toHaveCSS("opacity", "1");
});

test("cards track the pointer for the spotlight", async ({ page, isMobile }) => {
  test.skip(isMobile, "fine pointers only");
  await page.goto("/");
  const card = page.locator("#peripherals article").first();
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 20);
  await expect
    .poll(() => card.evaluate((el) => (el as HTMLElement).style.getPropertyValue("--mx")))
    .toMatch(/^(29|30|31)(\.\d+)?px$/);
});
