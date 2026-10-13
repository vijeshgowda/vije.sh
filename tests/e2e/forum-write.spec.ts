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
 * Posting in the forum (application.md 8.7 and 10.3). Threads go into the seeded categories, whose
 * lists were prerendered at build: seeing a new thread there proves the actions refresh the cached
 * pages. Every thread a test creates has the test's tag in its title and is deleted afterwards.
 * Test users are under 24 hours old, so the new-account limits apply (1 thread, 5 replies an hour).
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
test.beforeEach(() => {
  tag = randomBytes(4).toString("hex");
});
test.afterEach(async () => {
  await sql("delete from app.threads where title like $1", [`%${tag}%`]);
});

/** A thread written straight to the database (not cached anywhere yet) */
async function seedThread(
  author: TestUser,
  title: string,
  { minutesAgo = 0, slug = "games" } = {},
) {
  const [row] = await sql<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md, created_at, last_activity_at)
     select id, $2, $3, 'Seeded body.', now() - $4::int * interval '1 minute',
            now() - $4::int * interval '1 minute'
       from app.categories where slug = $1
     returning id::text as id`,
    [slug, author.id, title, minutesAgo],
  );
  return `/forum/${slug}/${row!.id}`;
}

async function openNewThread(page: Page) {
  await page.getByRole("button", { name: "New thread" }).click();
  const dialog = page.getByRole("dialog", { name: "New thread" });
  await expect(dialog.getByLabel("Title")).toBeFocused();
  return dialog;
}

async function startThread(page: Page, title: string, body: string, category?: string) {
  const dialog = await openNewThread(page);
  await dialog.getByLabel("Title").fill(title);
  if (category) await dialog.getByLabel("Category").selectOption({ label: category });
  await dialog.getByLabel("Message").fill(body);
  await dialog.getByRole("button", { name: "Transmit" }).click();
  return dialog;
}

const frames = (page: Page) => page.locator('li[id^="thread-"], li[id^="reply-"]');

test("a member starts a thread and replies; the cached lists show both", async ({
  page,
  asMember,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/forum/games");
  const dialog = await openNewThread(page);
  await expect(dialog.getByLabel("Category")).toHaveValue("games");
  await expect(
    dialog.getByLabel("Category").locator("option", { hasText: "Announcements" }),
  ).toHaveCount(0);
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "New thread" })).toBeFocused();

  const title = `Pooling with pg ${tag}`;
  await startThread(page, title, "Use **one** connection.");
  await expect(page).toHaveURL(/\/forum\/games\/\d+$/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(frames(page)).toHaveCount(1);
  await expect(frames(page).first()).toContainText(asMember.handle!);
  await expect(frames(page).first().locator("strong")).toHaveText("one");

  const box = page.getByLabel("Reply");
  await expect(page.getByText(`Posting as @${asMember.handle}`)).toBeVisible();
  await box.fill("Thanks, that *works*.");
  await page.getByRole("button", { name: "Transmit" }).click();
  await expect(frames(page)).toHaveCount(2);
  await expect(frames(page).nth(1)).toContainText("FRAME 01");
  await expect(frames(page).nth(1).locator("em")).toHaveText("works");
  await expect(page.getByText("Reply transmitted")).toBeVisible();
  await expect(box).toHaveValue("");
  await expect(page.getByText(/2 frames/)).toBeVisible();
  await expectAccessible(page);

  await page.goto("/forum/games");
  const row = page.getByRole("link", { name: new RegExp(title) });
  await expect(row).toContainText("1 reply");
  await expect(row).toContainText(asMember.handle!);
  await page.goto("/forum");
  await expect(page.getByRole("link", { name: new RegExp(title) })).toContainText("1 reply");
});

test("only the author edits, within 30 minutes", async ({ page, context, baseURL, asMember }) => {
  const author = await createUser();
  try {
    const path = await seedThread(author, `Edit me ${tag}`);
    const stale = await seedThread(author, `Too late ${tag}`, { minutesAgo: 31 });

    // another member sees no Edit button
    await page.goto(path);
    await expect(page.getByLabel("Reply")).toBeVisible();
    expect(asMember.handle).not.toBe(author.handle);
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);

    await signInAs(context, baseURL!, author);
    await page.goto(path);
    const op = frames(page).first();
    await op.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit thread" });
    await expect(dialog.getByLabel("Title")).toHaveValue(`Edit me ${tag}`);
    await expect(dialog.getByLabel("Message")).toHaveValue("Seeded body.");
    await expectAccessible(page);
    await dialog.getByLabel("Title").fill(`Edited ${tag}`);
    await dialog.getByLabel("Message").fill("Now with **bold**.");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: `Edited ${tag}` })).toBeVisible();
    await expect(op.locator("strong")).toHaveText("bold");
    await expect(op).toContainText("edited");
    await expect(page.getByText("Edit saved")).toBeVisible();

    await page.goto(stale);
    await expect(page.getByLabel("Reply")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  } finally {
    await deleteUser(author.id);
  }
});

test("a banned account reads but can't post", async ({ page, asBanned }) => {
  const author = await createUser();
  try {
    const path = await seedThread(author, `Read only ${tag}`);
    await page.goto("/forum/games");
    await expect(page.getByText("Your account can't post.")).toBeVisible();
    await expect(page.getByRole("button", { name: "New thread" })).toHaveCount(0);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: `Read only ${tag}` })).toBeVisible();
    await expect(
      page.getByText("Your account can't post. You can still read the forum."),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await expectAccessible(page);
    expect(asBanned.handle).toBeTruthy();
  } finally {
    await deleteUser(author.id);
  }
});

test("guests are asked to sign in to post", async ({ page }) => {
  await page.goto("/forum/games");
  await expect(page.getByRole("link", { name: "Sign in to post" })).toHaveAttribute(
    "href",
    "/login?next=%2Fforum%2Fgames",
  );
});

test("a new account can start one thread an hour", async ({ page, asMember }) => {
  await page.goto("/forum/off-topic");
  await startThread(page, `First ${tag}`, "Hello.");
  await expect(page.getByRole("heading", { level: 1, name: `First ${tag}` })).toBeVisible();

  await page.goto("/forum/off-topic");
  const dialog = await startThread(page, `Second ${tag}`, "Again.");
  await expect(dialog.getByRole("alert")).toHaveText(
    "You can start 1 thread an hour while your account is new. Please try again later.",
  );
  await expect(dialog.getByLabel("Title")).toHaveValue(`Second ${tag}`);
  await expect(page).toHaveURL(/\/forum\/off-topic$/);
  const [{ n }] = await sql<{ n: number }>(
    "select count(*)::int as n from app.threads where author_id = $1",
    [asMember.id],
  );
  expect(n).toBe(1);
});

test("staff start threads in a staff-only category; members read and reply there but can't start one", async ({
  page,
  context,
  baseURL,
  asModerator,
}) => {
  const title = `Site news ${tag}`;
  await page.goto("/forum/announcements");
  await expect(page.getByRole("heading", { level: 1, name: "Announcements" })).toBeVisible();
  await startThread(page, title, "The forum is **open**.", "Announcements");
  await expect(page).toHaveURL(/\/forum\/announcements\/\d+$/);
  await expect(frames(page).first()).toContainText(asModerator.handle!);
  await expect(frames(page).first().getByText("Moderator", { exact: true })).toBeVisible();

  const member = await createUser();
  try {
    await signInAs(context, baseURL!, member);
    await page.goto("/forum/announcements");
    await page.getByRole("link", { name: new RegExp(title) }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByLabel("Reply")).toBeVisible();

    await page.goto("/forum/announcements");
    const dialog = await openNewThread(page);
    const picker = dialog.getByLabel("Category");
    await expect(picker.locator("option", { hasText: "Announcements" })).toHaveCount(0);
    // the server checks too: put the category back into the picker and submit
    await picker.evaluate((el) => {
      const o = document.createElement("option");
      o.value = "announcements";
      o.textContent = "Announcements";
      el.append(o);
    });
    await dialog.getByLabel("Title").fill(`Forged ${tag}`);
    await picker.selectOption("announcements");
    await dialog.getByLabel("Message").fill("Not staff.");
    await dialog.getByRole("button", { name: "Transmit" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Only staff can start threads in Announcements.",
    );
    await expect(picker).toHaveAttribute("aria-invalid", "true");
  } finally {
    await deleteUser(member.id);
  }
});
