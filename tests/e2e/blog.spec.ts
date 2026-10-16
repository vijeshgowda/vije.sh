import { expect, expectAccessible, test } from "./fixtures";

test("the overview lists the three latest application notes, newest first", async ({ page }) => {
  await page.goto("/");
  const notes = page.locator("#notes");
  await expect(notes.getByRole("heading", { name: /Latest application notes/ })).toBeVisible();
  const items = notes.getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.first().getByRole("link")).toHaveAttribute(
    "href",
    "/blog/best-motorcycles-2026",
  );
  await expect(items.first()).toContainText("AN-005");
  await expect(items.nth(2)).toContainText("Enforcing access in two places");

  await notes.getByRole("link", { name: /All notes/ }).click();
  await expect(page).toHaveURL(/\/blog$/);
});

test("the blog index lists every note and opens a post with its images", async ({ page }) => {
  await page.goto("/blog");
  await expect(page.locator("#index").getByRole("listitem")).toHaveCount(5);
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

test("the motorcycle guide has working jump links, local photos and an accessible diagram", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/blog");
  await page.getByRole("link", { name: /The best motorcycles of 2026/ }).click();
  await expect(page).toHaveURL(/\/blog\/best-motorcycles-2026$/);
  const article = page.getByRole("article");
  await expect(article.getByRole("heading", { level: 1 })).toHaveText(
    "The best motorcycles of 2026: five bikes, five different jobs",
  );
  await expect(article.getByText("Application note AN-005")).toBeVisible();
  await expect(article.getByRole("table")).toBeVisible();
  await article.getByRole("link", { name: "The before-you-buy checklist", exact: true }).click();
  await expect(page).toHaveURL(/#the-before-you-buy-checklist$/);
  await expect(
    article.getByRole("heading", { name: "The before-you-buy checklist", exact: true }),
  ).toBeInViewport();

  const photos = article.locator("figure img");
  await expect(photos).toHaveCount(5);
  for (const photo of await photos.all()) {
    await photo.scrollIntoViewIfNeeded();
    await expect(photo).toHaveAttribute("src", /^\/blog\/best-motorcycles-2026\/.+\.webp$/);
    await expect(photo).toHaveAttribute("alt", /.+/);
    await expect
      .poll(() => photo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
      .toBe(true);
  }
  await expect(article.locator("figcaption")).toHaveCount(5);
  const diagram = article.getByRole("img", {
    name: /^Find your starting point in the motorcycle shortlist/,
  });
  await expect(diagram.locator("svg")).toBeVisible({ timeout: 15_000 });
  await expectAccessible(page);
  await article.getByRole("link", { name: /Older.*Planning this site/ }).click();
  await expect(page).toHaveURL(/\/blog\/planning-this-site$/);
});

test("unknown posts return the 404 page", async ({ page }) => {
  const res = await page.goto("/blog/no-such-post");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Bus fault" })).toBeVisible();
});
