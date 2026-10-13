import { randomBytes } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { testClient } from "../helpers/db";
import {
  createUser,
  deleteUser,
  ensureOwner,
  expect,
  expectAccessible,
  signInAs,
  test,
  type TestUser,
} from "./fixtures";

/** /admin overview and members: search, grant/revoke roles, ban/lift (application.md 8.7). */

async function sql<T extends object = Record<string, string>>(text: string, params: unknown[]) {
  const db = testClient();
  await db.connect();
  try {
    return (await db.query<T & Record<string, unknown>>(text, params)).rows;
  } finally {
    await db.end();
  }
}

const tag = () => randomBytes(4).toString("hex");
const roles = (page: Page) => page.getByRole("region", { name: /^\d\s*Roles$/ });
const banSection = (page: Page) => page.getByRole("region", { name: /^\d\s*Ban$/ });

/** What /api/me says about `user` right now (their next request). */
async function meOf(browser: Browser, baseURL: string, user: TestUser) {
  const ctx = await browser.newContext();
  try {
    await signInAs(ctx, baseURL, user);
    const body = (await (await ctx.request.get(`${baseURL}/api/me`)).json()) as {
      user: { banned: boolean; roles: string[] };
    };
    return body.user;
  } finally {
    await ctx.close();
  }
}

test("the overview counts members, posts and the database size", async ({ page, asSuperuser }) => {
  expect(asSuperuser.handle).toBeTruthy();
  await page.goto("/admin");
  const n = String.raw`\d[\d,]*\s*`;
  const kpis = (labels: string[]) => labels.map((l) => new RegExp(`^${n}${l}$`));
  await expect(page.getByRole("region", { name: /People/ }).getByRole("listitem")).toHaveText(
    kpis(["Members", "Onboarded", "New, 7 days", "New, 30 days", "Active bans"]),
  );
  await expect(page.getByRole("region", { name: /Content/ }).getByRole("listitem")).toHaveText([
    ...kpis(["Threads", "Replies", "Open reports", "Notes"]),
    /^\d+(\.\d)? (B|KB|MB|GB)\s*Database$/,
  ]);
  const perCategory = page.getByRole("region", { name: /Threads per category/ });
  await expect(perCategory.getByRole("rowheader", { name: "Engineering" })).toBeVisible();
});

test("search finds members by handle or display name, case-insensitively", async ({
  page,
  asSuperuser,
}) => {
  expect(asSuperuser.handle).toBeTruthy();
  const t = tag();
  const users = [
    await createUser({ handle: `s${t}_ab` }),
    await createUser({ handle: `s${t}_xy`, banned: true }),
  ];
  await sql("update app.profiles set display_name = $2 where id = $1", [
    users[1]!.id,
    `Wide ${t} 100%`,
  ]);
  try {
    await page.goto("/admin/members");
    await page.getByRole("searchbox", { name: "Handle or display name" }).fill(`S${t}_A`);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/members\\?q=S${t}_A$`));
    const table = page.getByRole("table", { name: /1 member matching/ });
    await expect(table.getByRole("link")).toHaveText([`@s${t}_ab`]);

    await page.goto(`/admin/members?q=${encodeURIComponent(`${t} 100%`)}`);
    const row = page.getByRole("row", { name: new RegExp(`s${t}_xy`) });
    await expect(row).toContainText(`Wide ${t} 100%`);
    await expect(row).toContainText("Banned");

    await page.goto(`/admin/members?q=${encodeURIComponent(`${t}%x`)}`);
    await expect(page.getByRole("status")).toHaveText(`No members match “${t}%x”.`);
  } finally {
    for (const u of users) await deleteUser(u.id);
  }
});

test("the owner grants moderator and superuser; forum role pills follow", async ({
  page,
  asOwner,
  baseURL,
  browser,
}) => {
  expect(asOwner.handle).toBeTruthy();
  const t = tag();
  const member = await createUser({ handle: `g${t}` });
  const [cat] = await sql<{ id: string }>(
    `insert into app.categories (slug, name, description, position)
     values ($1, $2, 'Seeded by admin-members.spec.ts.', 99) returning id::text as id`,
    [`e2e-${t}`, `E2E ${t}`],
  );
  const [thread] = await sql<{ id: string }>(
    `insert into app.threads (category_id, author_id, title, body_md)
     values ($1, $2, 'Role pills', 'Body') returning id::text as id`,
    [cat!.id, member.id],
  );
  const threadUrl = `/forum/e2e-${t}/${thread!.id}`;
  const pill = async () => {
    await page.goto(threadUrl);
    return page.locator(`li#thread-${thread!.id} [data-role]`).textContent();
  };
  try {
    expect(await pill()).toBe("Member");

    await page.goto(`/admin/members/${member.handle!.toUpperCase()}`);
    await expect(page.getByRole("heading", { level: 1, name: `@${member.handle}` })).toBeVisible();
    await page.getByRole("combobox", { name: "Moderator of" }).selectOption({ label: `E2E ${t}` });
    await page.getByRole("button", { name: "Grant moderator" }).click();
    await expect(roles(page).getByRole("rowheader")).toHaveText([`Moderator · E2E ${t}`]);
    await page
      .getByRole("combobox", { name: "Moderator of" })
      .selectOption({ label: "Every category" });
    await page.getByRole("button", { name: "Grant moderator" }).click();
    await expect(roles(page).getByRole("rowheader")).toHaveText([
      "Moderator",
      `Moderator · E2E ${t}`,
    ]);
    // role changes revalidate the cached forum pages
    await expect.poll(pill, { timeout: 15_000 }).toBe("Moderator");

    await page.goto(`/admin/members/${member.handle}`);
    await page.getByRole("button", { name: "Make superuser" }).click();
    await expect(roles(page).getByRole("rowheader")).toHaveText(["Superuser"]);
    await expect(page.getByRole("button", { name: "Grant moderator" })).toHaveCount(0);
    expect((await meOf(browser, baseURL!, member)).roles).toEqual(["superuser"]);
    await expect.poll(pill, { timeout: 15_000 }).toBe("Superuser");

    await page.goto(`/admin/members/${member.handle}`);
    await page.getByRole("button", { name: "Revoke Superuser" }).click();
    await expect(roles(page)).toContainText("No staff roles.");
    expect((await meOf(browser, baseURL!, member)).roles).toEqual([]);

    const log = await sql<{ action: string; note: string }>(
      `select action, note from app.moderation_log where profile_id = $1 order by id`,
      [member.id],
    );
    expect(log.map((l) => `${l.action} ${l.note}`)).toEqual([
      `role_grant moderator in e2e-${t}`,
      "role_grant moderator",
      "role_grant superuser",
      "role_revoke moderator (now a superuser)",
      `role_revoke moderator in e2e-${t} (now a superuser)`,
      "role_revoke superuser",
    ]);
  } finally {
    await sql("delete from app.threads where category_id = $1", [cat!.id]);
    await sql("delete from app.categories where id = $1", [cat!.id]);
    await deleteUser(member.id);
  }
});

test("a superuser can't change the owner or another superuser", async ({ page, asSuperuser }) => {
  expect(asSuperuser.handle).toBeTruthy();
  const owner = await ensureOwner();
  const other = await createUser({ roles: ["superuser"] });
  try {
    await page.goto(`/admin/members/${owner.handle}`);
    await expect(page.getByText("The owner's account can't be changed here.")).toBeVisible();
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);

    await page.goto(`/admin/members/${other.handle}`);
    await expect(page.getByText("Only the owner can change a superuser.")).toBeVisible();
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);

    await page.goto(`/admin/members/${asSuperuser.handle}`);
    await expect(page.getByText(/This is you/)).toBeVisible();
    await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);
  } finally {
    await deleteUser(other.id);
  }
});

test("a superuser bans a moderator for 7 days and lifts the ban", async ({
  page,
  asSuperuser,
  baseURL,
  browser,
}) => {
  expect(asSuperuser.handle).toBeTruthy();
  const mod = await createUser({ roles: ["moderator"] });
  try {
    await page.goto(`/admin/members/${mod.handle}`);
    await expect(banSection(page)).toContainText("Not banned.");
    await page.getByRole("textbox", { name: "Reason" }).fill("Spam links");
    await page.getByRole("combobox", { name: "Length" }).selectOption({ label: "7 days" });
    await page.getByRole("button", { name: `Ban @${mod.handle}` }).click();
    await expect(banSection(page)).toContainText(/Banned since .+ UTC until .+ UTC: Spam links/);
    await expect(page.getByRole("button", { name: "Lift ban" })).toBeVisible();
    expect((await meOf(browser, baseURL!, mod)).banned).toBe(true);

    await page.getByRole("button", { name: "Lift ban" }).click();
    await expect(banSection(page)).toContainText("Not banned.");
    await expect(
      banSection(page).getByRole("table", { name: "Ban history, newest first" }),
    ).toContainText("Spam links");
    expect((await meOf(browser, baseURL!, mod)).banned).toBe(false);
    await expectAccessible(page);
  } finally {
    await deleteUser(mod.id);
  }
});

test("an unknown handle is a 404", async ({ page, asSuperuser }) => {
  expect(asSuperuser.handle).toBeTruthy();
  await page.goto("/admin/members/nobody_here_404");
  await expect(page.getByRole("heading", { level: 1, name: "Bus fault" })).toBeVisible();
  await page.goto("/admin/members/bad%25handle");
  await expect(page.getByRole("heading", { level: 1, name: "Bus fault" })).toBeVisible();
});
