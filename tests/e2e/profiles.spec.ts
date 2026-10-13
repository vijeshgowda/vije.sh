import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { testClient } from "../helpers/db";
import { createUser, deleteUser, expect, expectAccessible, test, type TestUser } from "./fixtures";

/**
 * Member profiles (/u/[handle]) and forum threads in the palette and sitemap. Profiles render on
 * their first request, so each test uses fresh users (and a fresh category for seeded threads).
 */

async function sql<T extends object = Record<string, string>>(text: string, params: unknown[]) {
  const db = testClient();
  await db.connect();
  try {
    return (await db.query<T & Record<string, unknown>>(text, params)).rows;
  } finally {
    await db.end();
  }
}

interface Seed {
  slug: string;
  author: TestUser;
  other: TestUser;
  threadId: string;
  otherThreadId: string;
  replyId: string;
}

async function seed(): Promise<Seed> {
  const tag = randomBytes(4).toString("hex");
  const slug = `e2e-u-${tag}`;
  const author = await createUser();
  const other = await createUser({ roles: ["moderator"] });
  const [cat] = await sql<{ id: string }>(
    `insert into app.categories (slug, name, position) values ($1, $2, 99)
     returning id::text as id`,
    [slug, `Profiles ${tag}`],
  );
  const thread = async (author: string, title: string, at: string, hidden = false) => {
    const [row] = await sql<{ id: string }>(
      `insert into app.threads (category_id, author_id, title, body_md, created_at, hidden_at)
       values ($1, $2, $3, 'Body', now() - $4::interval, case when $5 then now() end)
       returning id::text as id`,
      [cat!.id, author, title, at, hidden],
    );
    return row!.id;
  };
  const threadId = await thread(author.id, "Pooling with pg", "3 minutes");
  const otherThreadId = await thread(other.id, "Small models", "2 minutes");
  await thread(author.id, "Hidden thread", "1 minute", true);
  const [r] = await sql<{ id: string }>(
    `insert into app.replies (thread_id, author_id, body_md, created_at, hidden_at)
     values ($1, $2, 'Visible reply', now() - interval '90 seconds', null),
            ($1, $2, 'Hidden reply', now() - interval '30 seconds', now())
     returning id::text as id`,
    [otherThreadId, author.id],
  );
  return { slug, author, other, threadId, otherThreadId, replyId: r!.id };
}

async function cleanup(s: Seed) {
  await sql(
    "delete from app.threads where category_id = (select id from app.categories where slug = $1)",
    [s.slug],
  );
  await sql("delete from app.categories where slug = $1", [s.slug]);
  await deleteUser(s.author.id);
  await deleteUser(s.other.id);
}

async function expectNoHorizontalScroll(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

test.describe("member profiles", () => {
  let s: Seed;
  test.beforeEach(async () => {
    s = await seed();
  });
  test.afterEach(async () => {
    await cleanup(s);
  });

  test("a thread author's name opens their profile with their visible posts", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const handle = s.author.handle!;
    await page.goto(`/forum/${s.slug}/${s.threadId}`);
    await page.locator(`#thread-${s.threadId}`).getByRole("link", { name: handle }).click();

    await expect(page).toHaveURL(new RegExp(`/u/${handle}$`));
    await expect(page.getByRole("heading", { level: 1, name: handle })).toBeVisible();
    await expect(page.locator("dl").getByText("Member", { exact: true })).toBeVisible();
    const posts = page.locator("#posts li");
    await expect(posts).toHaveCount(2);
    await expect(posts.nth(0).getByRole("link")).toHaveAttribute(
      "href",
      `/forum/${s.slug}/${s.otherThreadId}#reply-${s.replyId}`,
    );
    await expect(posts.nth(0)).toContainText("Re: Small models");
    await expect(posts.nth(1)).toContainText("Pooling with pg");
    await expect(page.getByText("Hidden thread")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectAccessible(page);

    // the reply link lands on its frame in the other thread
    await posts.nth(0).getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/${s.otherThreadId}#reply-${s.replyId}$`));
    await expect(page.locator(`#reply-${s.replyId}`)).toContainText("Visible reply");
    await expect(
      page.locator(`#thread-${s.otherThreadId}`).getByText("Moderator", { exact: true }),
    ).toBeVisible();
  });

  test("handles are case-insensitive: other casings redirect to the stored one", async ({
    page,
  }) => {
    const handle = s.author.handle!;
    const res = await page.goto(`/u/${handle.toUpperCase()}`);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/u/${handle}$`));
    await expect(page.getByRole("heading", { level: 1, name: handle })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      new RegExp(`/u/${handle}$`),
    );
  });
});

test("unknown and malformed handles return 404", async ({ page }) => {
  const paths = [`/u/nobody_${randomBytes(4).toString("hex")}`, "/u/ab", "/u/a.b.c"];
  for (const path of paths) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "Bus fault" })).toBeVisible();
  }
});

test("a member's new thread shows on their profile, in the palette and in the sitemap", async ({
  page,
  asMember,
}) => {
  const tag = randomBytes(4).toString("hex");
  const title = `Palette probe ${tag}`;
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // cached before the post: no posts yet, and empty profiles stay out of search results
    await page.goto(`/u/${asMember.handle}`);
    await expect(page.getByText("No posts yet.")).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

    await page.goto("/forum/games");
    await page.getByRole("button", { name: "New thread" }).click();
    const dialog = page.getByRole("dialog", { name: "New thread" });
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Message").fill("Find me with Ctrl K.");
    await dialog.getByRole("button", { name: "Transmit" }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    const threadUrl = new URL(page.url()).pathname;

    await expect(async () => {
      await page.goto(`/u/${asMember.handle}`);
      await expect(page.locator("#posts").getByRole("link", { name: title })).toBeVisible({
        timeout: 1000,
      });
    }).toPass();

    await page.goto("/work");
    const jump = page.getByRole("button", { name: /^Jump to/ });
    await expect(async () => {
      await jump.click();
      await page.getByRole("combobox").fill(tag);
      try {
        await expect(page.getByRole("option", { name: new RegExp(title) })).toBeVisible({
          timeout: 1000,
        });
      } catch (e) {
        await page.keyboard.press("Escape");
        throw e;
      }
    }).toPass();
    await expect(page.getByRole("option").first()).toContainText("Thread");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${threadUrl}$`));

    await expect(async () => {
      const xml = await (await page.request.get("/sitemap.xml")).text();
      expect(xml).toContain(`${threadUrl}</loc>`);
    }).toPass();
  } finally {
    await sql("delete from app.threads where title = $1", [title]);
  }
});
