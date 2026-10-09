import { expect, test } from "./fixtures";

test("the overview lists the three latest application notes, newest first", async ({ page }) => {
  await page.goto("/");
  const notes = page.locator("#notes");
  await expect(notes.getByRole("heading", { name: /Latest application notes/ })).toBeVisible();
  const items = notes.getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.first().getByRole("link")).toHaveAttribute("href", "/blog/planning-this-site");
  await expect(items.first()).toContainText("AN-004");
  await expect(items.nth(2)).toContainText("Quality per GB");

  await notes.getByRole("link", { name: /All notes/ }).click();
  await expect(page).toHaveURL(/\/blog$/);
});

test("the blog index lists every note and opens a post with its images", async ({ page }) => {
  await page.goto("/blog");
  await expect(page.locator("#index").getByRole("listitem")).toHaveCount(4);
  await page.getByRole("link", { name: /Planning this site/ }).click();

  await expect(page).toHaveURL(/\/blog\/planning-this-site$/);
  await expect(page.getByRole("heading", { level: 1, name: "Planning this site" })).toBeVisible();
  await expect(page.getByText("Application note AN-004")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /What I picked/ })).toHaveAttribute(
    "id",
    "what-i-picked",
  );

  // stack.svg sits next to index.md and is served from public/blog/<slug>/
  const img = page.getByRole("img", { name: "Browser to static site to Postgres" });
  await img.scrollIntoViewIfNeeded();
  await expect(img).toHaveAttribute("src", "/blog/planning-this-site/stack.svg");
  await expect(img).toHaveAttribute("width", "640");
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(640);
  await expect(page.locator("figcaption")).toHaveText(/Static pages first/);

  await page.getByRole("link", { name: /Older.*Enforcing access/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Enforcing access in two places",
  );
});

test("unknown posts return the 404 page", async ({ page }) => {
  const res = await page.goto("/blog/no-such-post");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Bus fault" })).toBeVisible();
});
