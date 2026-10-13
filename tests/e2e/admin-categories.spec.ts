import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { testClient } from "../helpers/db";
import { ensureOwner, expect, expectAccessible, test } from "./fixtures";

/**
 * The owner's category manager. The flow changes the global category order, so it runs in one
 * project only; every category it creates carries a random suffix and is removed afterwards.
 */

// a Server Action answers with the re-rendered page, which takes a while on a busy machine
const ACTION = { timeout: 15_000 };

async function sql<T extends object = Record<string, string>>(text: string, params: unknown[]) {
  const db = testClient();
  await db.connect();
  try {
    return (await db.query<T & Record<string, unknown>>(text, params)).rows;
  } finally {
    await db.end();
  }
}

async function addThread(slug: string, authorId: string) {
  await sql(
    `insert into app.threads (category_id, author_id, title, body_md)
     values ((select id from app.categories where slug = $1), $2, 'Keeps it busy', 'Body')`,
    [slug, authorId],
  );
}

const removeThreads = (slug: string) =>
  sql(
    "delete from app.threads where category_id = (select id from app.categories where slug = $1)",
    [slug],
  );

const table = (page: Page) => page.getByRole("region", { name: "Categories table" });
const row = (page: Page, name: string) => table(page).getByRole("row", { name: new RegExp(name) });
const names = (page: Page) =>
  table(page).locator("tbody tr td:nth-child(2) > span").allInnerTexts();

async function create(page: Page, name: string) {
  const form = page.getByRole("form", { name: "New category" });
  await form.getByLabel("Name").fill(name);
  await form.getByRole("button", { name: "Create category" }).click();
  await expect(form.getByRole("status")).toHaveText(`Created ${name}.`, ACTION);
}

test("the owner creates, renames, reorders, toggles and deletes categories", async ({
  page,
  asOwner,
}, info) => {
  test.skip(info.project.name !== "chromium", "changes the global category order");
  test.slow();
  expect(asOwner.handle).toBeTruthy();
  const owner = await ensureOwner();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const tag = randomBytes(4).toString("hex");
  const a = { name: `E2E ${tag} first`, slug: `e2e-${tag}-first` };
  const b = { name: `E2E ${tag} second`, slug: `e2e-${tag}-second` };
  const renamed = `E2E ${tag} renamed`;

  try {
    await page.goto("/admin/categories");
    await expect(page.getByRole("heading", { level: 1, name: "Categories" })).toBeVisible();

    // create two; the slug follows the name, and a taken slug is refused
    const form = page.getByRole("form", { name: "New category" });
    await form.getByLabel("Name").fill(a.name);
    await expect(form.getByLabel("Slug")).toHaveValue(a.slug);
    await form.getByRole("button", { name: "Create category" }).click();
    await expect(form.getByRole("status")).toHaveText(`Created ${a.name}.`, ACTION);
    await form.getByLabel("Name").fill(a.name);
    await form.getByRole("button", { name: "Create category" }).click();
    await expect(form.getByText("Slug is already used by another category.")).toBeVisible(ACTION);
    await expect(form.getByLabel("Slug")).toHaveAttribute("aria-invalid", "true");
    await create(page, b.name);
    await expectAccessible(page);

    // new categories go to the end, in order
    let list = await names(page);
    expect(list.indexOf(b.name)).toBeGreaterThan(list.indexOf(a.name));

    // reorder: the second moves up until it sits above the first, here and on /forum (other
    // specs add categories of their own, so it may take more than one step)
    for (let step = 0; step < 10 && list.indexOf(b.name) > list.indexOf(a.name); step++) {
      const from = list.indexOf(b.name);
      await row(page, b.name).getByRole("button", { name: "Up" }).click();
      await expect.poll(async () => (await names(page)).indexOf(b.name), ACTION).toBeLessThan(from);
      list = await names(page);
    }
    expect(list.indexOf(b.name)).toBeLessThan(list.indexOf(a.name));
    await page.goto("/forum");
    const chips = page.getByRole("navigation", { name: "Forum categories" }).getByRole("link");
    const chipNames = await chips.allInnerTexts();
    expect(chipNames.indexOf(b.name)).toBeGreaterThan(-1);
    expect(chipNames.indexOf(b.name)).toBeLessThan(chipNames.indexOf(a.name));
    // the chips prefetch each category; a render still running when a category changes would
    // store the old page again (a race in Next's route cache), so let them finish first
    await page.waitForLoadState("networkidle");

    // staff-only posting: on, then off again
    await page.goto("/admin/categories");
    const staff = row(page, a.name).getByRole("button", { name: "Staff only" });
    await expect(staff).toHaveAttribute("aria-pressed", "false");
    await staff.click();
    await expect(staff).toHaveAttribute("aria-pressed", "true", ACTION);
    await expect(row(page, a.name)).toContainText("Staff only");
    const [flag] = await sql<{ staff_only: boolean }>(
      "select staff_only from app.categories where slug = $1",
      [a.slug],
    );
    expect(flag!.staff_only).toBe(true);
    await staff.click();
    await expect(staff).toHaveAttribute("aria-pressed", "false", ACTION);

    // rename: the name changes, the slug and its URL stay
    await row(page, a.name).getByRole("button", { name: "Edit" }).click();
    const edit = page.getByRole("dialog", { name: `Edit ${a.name}` });
    await expect(edit).toBeVisible();
    await expectAccessible(page);
    await edit.getByLabel("Name").fill(renamed);
    await edit.getByLabel("Description").fill("Renamed by the e2e test.");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(edit).toBeHidden(ACTION);
    await expect(row(page, renamed).getByRole("link")).toHaveText(`/forum/${a.slug}`, ACTION);
    await page.goto(`/forum/${a.slug}`);
    await expect(page.getByRole("heading", { level: 1, name: renamed })).toBeVisible();
    await expect(page.getByText("Renamed by the e2e test.")).toBeVisible();
    await page.waitForLoadState("networkidle");

    // a category with a thread can't be deleted
    await addThread(a.slug, owner.id);
    await page.goto("/admin/categories");
    await row(page, renamed).getByRole("button", { name: "Delete" }).click();
    const blocked = page.getByRole("dialog", { name: `${renamed} can't be deleted` });
    await expect(blocked).toContainText("It has 1 thread");
    await expect(blocked.getByRole("button", { name: "Delete category" })).toHaveCount(0);
    await blocked.getByRole("button", { name: "Close" }).click();

    // ... and the server refuses too, when a thread arrives after the page loaded
    await row(page, b.name).getByRole("button", { name: "Delete" }).click();
    const confirm = page.getByRole("dialog", { name: `Delete ${b.name}?` });
    await expect(confirm).toContainText(`/forum/${b.slug} will be removed for good`);
    await addThread(b.slug, owner.id);
    await confirm.getByRole("button", { name: "Delete category" }).click();
    await expect(confirm.getByRole("alert")).toHaveText(
      "This category still has threads. Only empty categories can be deleted.",
      ACTION,
    );
    await removeThreads(b.slug);
    await confirm.getByRole("button", { name: "Delete category" }).click();
    await expect(row(page, b.name)).toHaveCount(0, ACTION);
    // the tags expire as the action ends, which can land a moment after its answer
    await expect
      .poll(async () => (await page.request.get(`/forum/${b.slug}`)).status(), ACTION)
      .toBe(404);

    // once empty, the first one goes too
    await removeThreads(a.slug);
    await page.goto("/admin/categories");
    await row(page, renamed).getByRole("button", { name: "Delete" }).click();
    await page
      .getByRole("dialog", { name: `Delete ${renamed}?` })
      .getByRole("button", { name: "Delete category" })
      .click();
    await expect(row(page, renamed)).toHaveCount(0, ACTION);

    // every change is in the moderation log, in order
    const log = async (slug: string) =>
      (
        await sql<{ action: string; note: string }>(
          `select action, note from app.moderation_log
            where actor_id = $1 and note like $2 order by id`,
          [owner.id, `%/forum/${slug}%`],
        )
      ).map((r) => `${r.action} ${r.note}`);
    expect(await log(a.slug)).toEqual([
      `category_create Created /forum/${a.slug} "${a.name}"`,
      `category_update /forum/${a.slug}: only staff start threads`,
      `category_update /forum/${a.slug}: everyone starts threads`,
      `category_update /forum/${a.slug}: renamed "${a.name}" to "${renamed}", edited the description`,
      `category_delete Deleted /forum/${a.slug} "${renamed}"`,
    ]);
    const bLog = await log(b.slug);
    expect(bLog[0]).toBe(`category_create Created /forum/${b.slug} "${b.name}"`);
    expect(bLog.at(-1)).toBe(`category_delete Deleted /forum/${b.slug} "${b.name}"`);
    expect(new Set(bLog.slice(1, -1))).toEqual(
      new Set([`category_update /forum/${b.slug}: moved up`]),
    );
  } finally {
    for (const s of [a.slug, b.slug]) {
      await removeThreads(s);
      await sql("delete from app.categories where slug = $1", [s]);
      await sql("delete from app.moderation_log where note like $1", [`%/forum/${s}%`]);
    }
  }
});

test("superusers can't open the category manager", async ({ page, asSuperuser }) => {
  expect(asSuperuser.handle).toBeTruthy();
  await page.goto("/admin/categories");
  await expect(page.getByRole("heading", { level: 1, name: "Bus fault" })).toBeVisible();
  await expect(page.getByRole("form", { name: "New category" })).toHaveCount(0);
});
