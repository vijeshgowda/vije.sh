import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { testClient } from "../helpers/db";
import {
  createUser,
  deleteUser,
  expect,
  expectAccessible,
  signInAs,
  test,
  type TestUser,
} from "./fixtures";

/**
 * Reports (application.md 8.7): members report a reply, a thread or a profile once; superusers
 * and the owner work through /admin/reports and read /admin/log, where hidden threads can be
 * unhidden. Everything a test seeds carries its tag and is deleted afterwards.
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
test.beforeEach(() => {
  tag = randomBytes(4).toString("hex");
  users = [];
});
test.afterEach(async () => {
  await sql("delete from app.threads where title like $1", [`%${tag}%`]);
  for (const u of users) await deleteUser(u.id);
});

async function member(): Promise<TestUser> {
  const u = await createUser();
  users.push(u);
  return u;
}

async function seedThread(author: TestUser, title: string, hidden = false) {
  const [row] = await sql<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md, hidden_at)
     select id, $1, $2, 'Seeded body.', case when $3 then now() end
       from app.categories where slug = 'games'
     returning id::text as id`,
    [author.id, `${title} ${tag}`, hidden],
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

const reportsBy = (reporter: TestUser) =>
  sql<{ kind: string; reason: string; status: string }>(
    `select case when reply_id is not null then 'reply' when thread_id is not null then 'thread'
                 else 'profile' end as kind, reason, status::text as status
       from app.reports where reporter_id = $1 order by id`,
    [reporter.id],
  );

/** The session has loaded once the reply box names the poster */
async function signedInView(page: Page, path: string, who: TestUser) {
  await page.goto(path);
  await expect(page.getByText(`Posting as @${who.handle}`)).toBeVisible();
}

async function sendReport(page: Page, dialogName: string, reason?: string, details?: string) {
  const dialog = page.getByRole("dialog", { name: dialogName });
  if (reason) await dialog.getByRole("radio", { name: reason }).check();
  if (details) await dialog.getByLabel(/Details/).fill(details);
  await dialog.getByRole("button", { name: "Send report" }).click();
  return dialog;
}

test("a member reports a reply and a profile, once each", async ({ page, asMember }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const author = await member();
  const id = await seedThread(author, "Reported thread");
  const replyId = await seedReply(id, author, "Buy cheap stuff");
  const path = `/forum/games/${id}`;

  await signedInView(page, path, asMember);
  const frame = page.locator(`#reply-${replyId}`);
  await frame.getByRole("button", { name: "Report" }).click();
  const dialog = page.getByRole("dialog", { name: "Report FRAME 01" });
  await expect(dialog.getByRole("radio", { name: "Spam or advertising" })).toBeFocused();
  await expectAccessible(page);
  await sendReport(page, "Report FRAME 01", "Harassment or abuse", "Name-calling");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Report sent. Thank you.")).toBeVisible();
  await expect(frame.getByRole("button", { name: "Reported" })).toBeFocused();

  // again, after a reload: already reported
  await signedInView(page, path, asMember);
  await frame.getByRole("button", { name: "Report" }).click();
  const again = await sendReport(page, "Report FRAME 01");
  await expect(again.getByRole("alert")).toHaveText(
    "You already reported this. Staff will review it.",
  );
  await again.getByRole("button", { name: "Close" }).click();
  await expect(frame.getByRole("button", { name: "Reported" })).toBeVisible();

  // a member's own posts and profile have no Report
  await expect(
    page.locator(`#thread-${id}`).getByRole("button", { name: "Report thread" }),
  ).toBeVisible();
  await page.goto(`/u/${asMember.handle}`);
  await expect(page.getByRole("heading", { level: 1, name: asMember.handle! })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Report profile" })).toHaveCount(0);

  await page.goto(`/u/${author.handle}`);
  await page.getByRole("button", { name: "Report profile" }).click();
  await sendReport(page, `Report ${author.handle}`, "Something else", "Impersonating staff");
  await expect(page.getByText("Report sent. Thank you.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reported" })).toBeVisible();

  expect(await reportsBy(asMember)).toEqual([
    { kind: "reply", reason: "Harassment or abuse: Name-calling", status: "open" },
    { kind: "profile", reason: "Something else: Impersonating staff", status: "open" },
  ]);
});

test("a superuser works through the queue: hide, mark actioned, dismiss", async ({
  page,
  context,
  baseURL,
  asSuperuser,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const author = await member();
  const reporter = await member();
  const title = `Queued thread ${tag}`;
  const id = await seedThread(author, "Queued thread");
  const replyId = await seedReply(id, author, "Spam spam spam");
  await sql(
    `insert into app.reports (reporter_id, reply_id, reason) values ($1, $2, 'Spam or advertising')`,
    [reporter.id, replyId],
  );
  await sql(
    `insert into app.reports (reporter_id, profile_id, reason) values ($1, $2, 'Harassment or abuse')`,
    [reporter.id, author.id],
  );
  expect(asSuperuser.handle).toBeTruthy();

  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { level: 1, name: "Reports" })).toBeVisible();
  const replyCard = page.getByRole("article", { name: `Reply in \u201c${title}\u201d` });
  await expect(replyCard).toContainText("Spam or advertising");
  await expect(replyCard).toContainText(`by @${reporter.handle}`);
  await expect(
    replyCard.getByRole("link", { name: `Reply in \u201c${title}\u201d` }),
  ).toHaveAttribute("href", `/forum/games/${id}#reply-${replyId}`);
  await expectAccessible(page);

  // let every request from loading the page finish before a write (see moderation.spec.ts)
  await page.waitForLoadState("networkidle");
  await replyCard.getByRole("button", { name: "Hide reply" }).click();
  await expect(page.getByText("Reply hidden")).toBeVisible();
  await expect(replyCard.getByText("Hidden", { exact: true })).toBeVisible();
  await replyCard.getByRole("button", { name: "Mark actioned" }).click();
  await expect(page.getByText("Report marked actioned")).toBeVisible();
  await expect(replyCard).toHaveCount(0);

  const profileCard = page.getByRole("article", { name: `@${author.handle}` });
  await expect(profileCard.getByRole("link", { name: "Member page" })).toHaveAttribute(
    "href",
    `/admin/members/${author.handle}`,
  );
  await profileCard.getByRole("button", { name: "Dismiss" }).click();
  await expect(page.getByText("Report dismissed")).toBeVisible();
  await expect(profileCard).toHaveCount(0);

  const resolved = page.getByRole("region", { name: "Resolved reports" });
  await expect(resolved.getByRole("row", { name: new RegExp(title) })).toContainText("Actioned");
  expect(await reportsBy(reporter)).toEqual([
    { kind: "reply", reason: "Spam or advertising", status: "actioned" },
    { kind: "profile", reason: "Harassment or abuse", status: "dismissed" },
  ]);
  const log = await sql<{ action: string; note: string | null }>(
    `select action, note from app.moderation_log
      where reply_id = $1 or profile_id = $2 order by id`,
    [replyId, author.id],
  );
  expect(log.map((l) => l.action)).toEqual(["hide", "report_resolve", "report_resolve"]);
  expect(log[1]!.note).toMatch(/^actioned: report #\d+$/);
  expect(log[2]!.note).toMatch(/^dismissed: report #\d+$/);

  // the hidden reply is a placeholder for members now
  const reader = await member();
  await signInAs(context, baseURL!, reader);
  await page.goto(`/forum/games/${id}`);
  await expect(page.locator(`#reply-${replyId}`)).toContainText(
    "This reply was hidden by a moderator.",
  );
});

test("/admin/log lists staff actions and unhides a hidden thread", async ({
  page,
  asSuperuser,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const author = await member();
  const title = `Hidden thread ${tag}`;
  const id = await seedThread(author, "Hidden thread", true);
  await sql(
    `insert into app.moderation_log (actor_id, action, thread_id, note) values ($1, 'hide', $2, $3)`,
    [asSuperuser.id, id, `Off topic ${tag}`],
  );

  await page.goto("/admin/log");
  await expect(page.getByRole("heading", { level: 1, name: "Moderation log" })).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(`Off topic ${tag}`) });
  await expect(row).toContainText("Hide");
  await expect(row).toContainText(`@${asSuperuser.handle}`);
  await expect(row.getByRole("link", { name: title })).toHaveAttribute(
    "href",
    `/forum/games/${id}`,
  );
  await expectAccessible(page);

  await page.waitForLoadState("networkidle");
  await row.getByRole("button", { name: `Unhide thread \u201c${title}\u201d` }).click();
  await expect(page.getByText("Thread visible again")).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("row", { name: new RegExp(`Unhide .*${title}`) })).toHaveCount(1);
  expect(await sql("select hidden_at from app.threads where id = $1", [id])).toEqual([
    { hidden_at: null },
  ]);

  const res = await page.goto(`/forum/games/${id}`);
  expect(res?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
});

test("moderators get a 404 on /admin/reports and /admin/log", async ({ page, asModerator }) => {
  expect(asModerator.handle).toBeTruthy();
  for (const path of ["/admin/reports", "/admin/log"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: "Bus fault" }), path).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(0);
  }
});
