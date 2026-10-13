import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { testClient } from "../helpers/db";
import {
  createUser,
  deleteUser,
  expect,
  expectAccessible,
  MODERATED_CATEGORY,
  signInAs,
  test,
  type TestUser,
} from "./fixtures";

/**
 * Inline moderation (application.md 8.7): staff in scope hide and unhide posts, reveal hidden text
 * as plain text, lock, pin and move threads; members see the result and no controls. Every thread
 * a test seeds carries the test's tag in its title and is deleted afterwards.
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

let tag = "";
let users: TestUser[] = [];
let slugs: string[] = [];
test.beforeEach(() => {
  tag = randomBytes(4).toString("hex");
  users = [];
  slugs = [];
});
test.afterEach(async () => {
  await sql("delete from app.threads where title like $1", [`%${tag}%`]);
  for (const s of slugs) await sql("delete from app.categories where slug = $1", [s]);
  for (const u of users) await deleteUser(u.id);
});

async function member(): Promise<TestUser> {
  const u = await createUser();
  users.push(u);
  return u;
}

/** A thread written straight to the database; returns its id */
async function seedThread(author: TestUser, title: string, slug: string, body = "Seeded body.") {
  const [row] = await sql<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md)
     select id, $2, $3, $4 from app.categories where slug = $1
     returning id::text as id`,
    [slug, author.id, `${title} ${tag}`, body],
  );
  return row!.id;
}

async function seedReply(threadId: string, author: TestUser, body: string) {
  const [row] = await sql<{ id: string }>(
    `insert into app.replies (thread_id, author_id, body_md) values ($1, $2, $3)
     returning id::text as id`,
    [threadId, author.id, body],
  );
  return row!.id;
}

/**
 * A fresh category for list assertions. Shared lists aren't safe here: a render of a list that
 * started before another worker's write and finished after it can keep that list stale for a while.
 */
async function seedCategory(suffix = ""): Promise<{ slug: string; name: string }> {
  const slug = `mod-${tag}${suffix}`;
  const name = `Mod ${tag}${suffix}`;
  await sql(
    `insert into app.categories (slug, name, description, position)
     values ($1, $2, 'Seeded by moderation.spec.ts.', 98)`,
    [slug, name],
  );
  slugs.push(slug);
  return { slug, name };
}

/** Lets the router's refetches and prefetches after an action finish before the next step */
const settle = (page: Page) => page.waitForLoadState("networkidle");

const log = (threadId: string) =>
  sql<{ action: string; reply_id: string | null; note: string | null }>(
    `select l.action, l.reply_id::text as reply_id, l.note from app.moderation_log l
      where l.thread_id = $1 or l.reply_id in (select id from app.replies where thread_id = $1)
      order by l.id`,
    [threadId],
  );

/** The session has loaded once the reply box names the poster */
async function signedInView(page: Page, path: string, who: TestUser) {
  await page.goto(path);
  await expect(page.getByText(`Posting as @${who.handle}`)).toBeVisible();
}

const SECRET = "<b>not bold</b> **raw** secret";
const PLACEHOLDER = "This reply was hidden by a moderator.";

test("a moderator hides a reply; members see a placeholder; staff reveal it and unhide it", async ({
  page,
  context,
  baseURL,
  asCategoryModerator,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const author = await member();
  const id = await seedThread(author, "Reply to hide", MODERATED_CATEGORY);
  const replyId = await seedReply(id, author, SECRET);
  const path = `/forum/${MODERATED_CATEGORY}/${id}`;

  await signedInView(page, path, asCategoryModerator);
  const frame = page.locator(`#reply-${replyId}`);
  await frame.getByRole("button", { name: "Hide" }).click();
  const dialog = page.getByRole("dialog", { name: "Hide FRAME 01" });
  await dialog.getByLabel("Reason (optional, logged)").fill("Spam link");
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Hide" }).click();
  await expect(dialog).toBeHidden();
  await expect(frame).toContainText(PLACEHOLDER);
  await expect(page.getByText("Reply hidden")).toBeVisible();
  expect(await log(id)).toEqual([{ action: "hide", reply_id: replyId, note: "Spam link" }]);

  // staff reveal the stored text as plain text
  await frame.getByRole("button", { name: "Reveal" }).click();
  const reveal = page.getByRole("dialog", { name: "Hidden FRAME 01" });
  await expect(reveal.locator("pre")).toHaveText(SECRET);
  await expect(reveal.locator("pre b")).toHaveCount(0);
  await expect(reveal).toContainText(`By @${author.handle}`);
  await expectAccessible(page);
  await reveal.getByRole("button", { name: "Close" }).click();
  await expect(frame.getByRole("button", { name: "Reveal" })).toBeFocused();

  // a member sees the placeholder only: no text, no author, no controls
  const reader = await member();
  await signInAs(context, baseURL!, reader);
  await signedInView(page, path, reader);
  await expect(frame).toContainText(PLACEHOLDER);
  await expect(frame.getByRole("button")).toHaveCount(0);
  expect(await page.content()).not.toContain("secret");

  await signInAs(context, baseURL!, asCategoryModerator);
  await signedInView(page, path, asCategoryModerator);
  await frame.getByRole("button", { name: "Unhide" }).click();
  await expect(frame).not.toContainText(PLACEHOLDER);
  await expect(frame.locator("strong")).toHaveText("raw");
  await expect(frame).toContainText(author.handle!);
  expect((await log(id)).map((l) => l.action)).toEqual(["hide", "unhide"]);
});

test("a moderator hides a thread: members get a 404; its staff reveal and unhide it there", async ({
  page,
  context,
  baseURL,
  asModerator,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const author = await member();
  const title = "Thread to hide";
  const { slug } = await seedCategory();
  const id = await seedThread(author, title, slug, SECRET);
  const path = `/forum/${slug}/${id}`;

  await signedInView(page, path, asModerator);
  await page.locator(`#thread-${id}`).getByRole("button", { name: "Hide thread" }).click();
  const dialog = page.getByRole("dialog", { name: "Hide thread" });
  await dialog.getByRole("button", { name: "Hide" }).click();
  await expect(page.getByRole("heading", { name: "Bus fault" })).toBeVisible();
  const notice = page.getByRole("region", { name: `${title} ${tag}` });
  await expect(notice).toContainText("Staff only: this thread is hidden");
  await expectAccessible(page);

  await settle(page);
  await page.goto(`/forum/${slug}`);
  await expect(page.getByRole("link", { name: new RegExp(`${title} ${tag}`) })).toHaveCount(0);

  const reader = await member();
  await signInAs(context, baseURL!, reader);
  const res = await page.goto(path);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Bus fault" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("region")).toHaveCount(0);

  await signInAs(context, baseURL!, asModerator);
  await page.goto(path);
  await notice.getByRole("button", { name: "Reveal" }).click();
  const reveal = page.getByRole("dialog", { name: "Hidden thread" });
  await expect(reveal.locator("pre")).toHaveText(SECRET);
  await expect(reveal).toContainText(`${title} ${tag}`);
  await reveal.getByRole("button", { name: "Close" }).click();
  await notice.getByRole("button", { name: "Unhide thread" }).click();
  await expect(page.getByRole("heading", { level: 1, name: `${title} ${tag}` })).toBeVisible();
  expect((await log(id)).map((l) => l.action)).toEqual(["hide", "unhide"]);
});

test("lock blocks member replies; pin lists the thread first", async ({
  page,
  context,
  baseURL,
  asModerator,
}) => {
  const { slug } = await seedCategory();
  const author = await member();
  const older = await seedThread(author, "Older", slug);
  await sql("update app.threads set last_activity_at = now() - interval '1 day' where id = $1", [
    older,
  ]);
  await seedThread(author, "Newer", slug);
  const path = `/forum/${slug}/${older}`;

  await signedInView(page, path, asModerator);
  const tools = page.locator(`#thread-${older}`);
  await tools.getByRole("button", { name: "Lock" }).click();
  await expect(tools.getByRole("button", { name: "Unlock" })).toBeVisible();
  await expect(page.getByText("Locked", { exact: true }).first()).toBeVisible();
  await settle(page);
  await tools.getByRole("button", { name: "Pin" }).click();
  await expect(tools.getByRole("button", { name: "Unpin" })).toBeVisible();
  await settle(page);
  // staff can still reply to a locked thread
  await expect(page.getByLabel("Reply")).toBeVisible();

  const reader = await member();
  await signInAs(context, baseURL!, reader);
  await page.goto(path);
  await expect(page.getByText("This thread is locked. Only moderators can reply.")).toBeVisible();
  await expect(page.getByLabel("Reply")).toHaveCount(0);
  // no staff controls; members (and staff out of scope) only get Report (reports.spec.ts)
  await expect(page.locator(`#thread-${older}`).getByRole("button")).toHaveText(["Report thread"]);

  await page.goto(`/forum/${slug}`);
  const rows = page.getByRole("link", { name: new RegExp(`(Older|Newer) ${tag}`) });
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText(`Older ${tag}`);
  await expect(rows.first()).toContainText("Pinned");
  expect((await log(older)).map((l) => l.action)).toEqual(["lock", "pin"]);
});

test("a moved thread lives at its new address and the old one redirects there", async ({
  page,
  asModerator,
}) => {
  const from = await seedCategory("a");
  const to = await seedCategory("b");
  const author = await member();
  const title = `Thread to move ${tag}`;
  const id = await seedThread(author, "Thread to move", from.slug);
  const oldPath = `/forum/${from.slug}/${id}`;
  const newPath = new RegExp(`/forum/${to.slug}/${id}$`);

  await signedInView(page, oldPath, asModerator);
  await page.locator(`#thread-${id}`).getByRole("button", { name: "Move" }).click();
  const dialog = page.getByRole("dialog", { name: "Move thread" });
  await dialog.getByLabel("Category").selectOption({ label: to.name });
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Move" }).click();
  await expect(page).toHaveURL(newPath);
  await expect(page.getByRole("link", { name: to.name }).first()).toBeVisible();
  await settle(page);

  await page.goto(oldPath);
  await expect(page).toHaveURL(newPath);
  await page.goto(`/forum/${to.slug}`);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  await page.goto(`/forum/${from.slug}`);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);
  expect(await log(id)).toEqual([
    { action: "move", reply_id: null, note: `${from.slug} -> ${to.slug}` },
  ]);
});

test("a category moderator moderates only their category; members get no controls", async ({
  page,
  context,
  baseURL,
  asCategoryModerator,
}) => {
  const author = await member();
  const own = await seedThread(author, "In scope", MODERATED_CATEGORY);
  const other = await seedThread(author, "Out of scope", "games");

  await signedInView(page, `/forum/${MODERATED_CATEGORY}/${own}`, asCategoryModerator);
  const ownTools = page.locator(`#thread-${own}`);
  await expect(ownTools.getByRole("button", { name: "Hide thread" })).toBeVisible();
  // one category: nowhere to move to
  await expect(ownTools.getByRole("button", { name: "Move" })).toHaveCount(0);

  await signedInView(page, `/forum/games/${other}`, asCategoryModerator);
  // no staff controls; members (and staff out of scope) only get Report (reports.spec.ts)
  await expect(page.locator(`#thread-${other}`).getByRole("button")).toHaveText(["Report thread"]);

  const reader = await member();
  await signInAs(context, baseURL!, reader);
  await signedInView(page, `/forum/${MODERATED_CATEGORY}/${own}`, reader);
  // no staff controls; members (and staff out of scope) only get Report (reports.spec.ts)
  await expect(page.locator(`#thread-${own}`).getByRole("button")).toHaveText(["Report thread"]);
});
