import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures";

const cursor = (l: Locator) => l.evaluate((el) => getComputedStyle(el).cursor);

// Issue #83: every clickable control shows the same slim hand, never the system pointer.
test("links, buttons and palette options share the themed hand cursor", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "fine pointers only");
  await page.goto("/");
  const link = page.getByRole("banner").getByRole("link").first();
  const hand = await cursor(link);
  expect(hand).toMatch(/^url\("data:image\/svg\+xml,.*"\) 9 2, pointer$/);
  expect(hand).toContain("e30613");

  await expect.poll(() => cursor(page.getByRole("button", { name: /^Jump to/ }))).toBe(hand);
  await page.getByRole("button", { name: /^Jump to/ }).click();
  await expect.poll(() => cursor(page.getByRole("option").first())).toBe(hand);
  await page.keyboard.press("Escape");

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await expect.poll(() => cursor(link)).toContain("ff4b55");
});
