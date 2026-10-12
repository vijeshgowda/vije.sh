import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { testClient } from "../helpers/db";
import { createUser, deleteUser, expect, expectAccessible, test, type TestUser } from "./fixtures";

/**
 * Forum browsing (read-only). Lists and threads are cached and prerendered at build time, so each
 * test seeds a fresh category: a slug that wasn't prerendered renders on its first request, with
 * this data.
 */
interface Seed {
  slug: string;
  name: string;
  threadId: string;
  hiddenThreadId: string;
  users: TestUser[];
}

async function sql<T extends object = Record<string, string>>(text: string, params: unknown[]) {
  const db = testClient();
  await db.connect();
  try {
    return (await db.query<T & Record<string, unknown>>(text, params)).rows;
  } finally {
    await db.end();
  }
}

async function seed(): Promise<Seed> {
  const tag = randomBytes(4).toString("hex");
  const slug = `e2e-${tag}`;
  const name = `E2E ${tag}`;
  const mod = await createUser({ roles: ["moderator"] });
  const member = await createUser();
  const [cat] = await sql<{ id: string }>(
    `insert into app.categories (slug, name, description, position)
     values ($1, $2, 'Seeded by forum.spec.ts.', 99) returning id::text as id`,
    [slug, name],
  );
  const [t] = await sql<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md, pinned_at)
     values ($1, $2, 'Pooling with pg', $3, now()) returning id::text as id`,
    [
      cat!.id,
      mod.id,
      "Use **one** connection.\n\n[docs](https://example.com/pg)\n\n<script>window.pwned = 1</script>\n",
    ],
  );
  await sql(
    `insert into app.replies (thread_id, author_id, body_md, created_at, edited_at, hidden_at)
     values ($1, $2, 'Thanks, that *works*.', now() + interval '1 s', now() + interval '2 s', null),
            ($1, $2, 'Hidden spam', now() + interval '3 s', null, now())`,
    [t!.id, member.id],
  );
  const [hidden] = await sql<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md, hidden_at)
     values ($1, $2, 'Hidden thread', 'Gone', now()) returning id::text as id`,
    [cat!.id, member.id],
  );
  return { slug, name, threadId: t!.id, hiddenThreadId: hidden!.id, users: [mod, member] };
}

async function cleanup(s: Seed) {
  await sql(
    "delete from app.threads where category_id = (select id from app.categories where slug = $1)",
    [s.slug],
  );
  await sql("delete from app.categories where slug = $1", [s.slug]);
  for (const u of s.users) await deleteUser(u.id);
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test.describe("forum browsing", () => {
  let s: Seed;
  test.beforeEach(async () => {
    s = await seed();
  });
  test.afterEach(async () => {
    await cleanup(s);
  });

  test("a category lists its threads and opens a thread with its frames", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const res = await page.goto(`/forum/${s.slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: s.name })).toBeVisible();
    await expect(page.getByText("Seeded by forum.spec.ts.")).toBeVisible();
    const row = page.getByRole("link", { name: /Pooling with pg/ });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(
      `0x${BigInt(s.threadId).toString(16).toUpperCase().padStart(2, "0")}`,
    );
    await expect(row).toContainText("1 reply");
    await expect(page.getByRole("link", { name: /Hidden thread/ })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);

    await row.click();
    await expect(page).toHaveURL(new RegExp(`/forum/${s.slug}/${s.threadId}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Pooling with pg" })).toBeVisible();
    await expect(page.getByText(/3 frames/)).toBeVisible();

    const frames = page.locator('li[id^="thread-"], li[id^="reply-"]');
    await expect(frames).toHaveCount(3);
    await expect(frames.nth(0)).toContainText("FRAME 00");
    await expect(frames.nth(0).getByText("Moderator", { exact: true })).toBeVisible();
    await expect(frames.nth(0).locator("strong")).toHaveText("one");
    await expect(frames.nth(0).getByRole("link", { name: "docs" })).toHaveAttribute(
      "rel",
      "nofollow ugc noopener",
    );
    await expect(frames.nth(1)).toContainText("FRAME 01");
    await expect(frames.nth(1).getByText("Member", { exact: true })).toBeVisible();
    await expect(frames.nth(1)).toContainText("edited");
    await expect(frames.nth(1).locator("time").first()).toHaveAttribute("datetime", /Z$/);
    await expect(frames.nth(2)).toContainText("This reply was hidden by a moderator.");
    await expect(frames.nth(2)).not.toContainText("Hidden spam");
    expect(await page.evaluate(() => "pwned" in window)).toBe(false);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);

    await page.getByRole("link", { name: `← ${s.name}` }).click();
    await expect(page).toHaveURL(new RegExp(`/forum/${s.slug}$`));
  });

  test("a thread under another category redirects to its canonical URL", async ({ page }) => {
    await page.goto(`/forum/games/${s.threadId}`);
    await expect(page).toHaveURL(new RegExp(`/forum/${s.slug}/${s.threadId}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Pooling with pg" })).toBeVisible();
  });

  test("hidden and missing threads and unknown categories return 404", async ({ page }) => {
    for (const path of [
      `/forum/${s.slug}/${s.hiddenThreadId}`,
      `/forum/${s.slug}/999999999`,
      `/forum/${s.slug}/not-a-number`,
      "/forum/no-such-category",
      "/forum/announcements",
    ]) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByRole("heading", { name: "Bus fault" })).toBeVisible();
    }
  });
});

test("the forum index links every public category with chips", async ({ page }) => {
  await page.goto("/forum");
  await expect(page.getByRole("heading", { level: 1, name: "Forum" })).toBeVisible();
  const chips = page.getByRole("navigation", { name: "Forum categories" });
  await expect(chips.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
  await expect(chips.getByRole("link", { name: "Announcements" })).toHaveCount(0);
  await chips.getByRole("link", { name: "Local AI" }).click();
  await expect(page).toHaveURL(/\/forum\/local-ai$/);
  await expect(page.getByRole("heading", { level: 1, name: "Local AI" })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Forum categories" })
      .getByRole("link", { name: "Local AI" }),
  ).toHaveAttribute("aria-current", "page");
});
