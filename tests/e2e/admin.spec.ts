import type { Page } from "@playwright/test";
import {
  createUser,
  deleteUser,
  expect,
  expectAccessible,
  signInAs,
  test,
  type TestRole,
} from "./fixtures";

const SUPERUSER_SECTIONS = [
  { path: "/admin", link: "Overview", h1: "Overview" },
  { path: "/admin/members", link: "Members", h1: "Members" },
  { path: "/admin/reports", link: "Reports", h1: "Reports" },
  { path: "/admin/log", link: "Log", h1: "Moderation log" },
];
const OWNER_SECTIONS = [
  ...SUPERUSER_SECTIONS,
  { path: "/admin/notes", link: "Notes", h1: "Notes" },
  { path: "/admin/categories", link: "Categories", h1: "Categories" },
];

const adminNav = (page: Page) => page.getByRole("navigation", { name: "Admin sections" });

/**
 * Staff pages show everyone else the 404 page, inside the normal site chrome and marked noindex.
 * (The HTTP status stays 200: with Cache Components the session is read after the response starts.)
 */
async function expectNotFound(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: "Bus fault" }), path).toBeVisible();
  await expect(page.locator("main")).toHaveCount(1);
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  await expect(adminNav(page)).toHaveCount(0);
}

async function openAccountMenu(page: Page, handle: string | null) {
  await page.getByRole("banner").getByText(`@${handle}`).click();
  await expect(page.getByRole("banner").getByRole("button", { name: "Sign out" })).toBeVisible();
}

test("guests are sent to sign-in, and come back to the page they asked for", async ({
  page,
  request,
}) => {
  for (const path of ["/admin", "/admin/members"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), path).toBe(307);
    expect(res.headers()["location"]).toBe(`/login?next=${encodeURIComponent(path)}`);
  }
  await page.goto("/admin/log");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Flog$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});

test("a session that no longer verifies is sent to sign-in too", async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([{ name: "test_session", value: "expired", url: baseURL! }]);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});

test("/admin is disallowed in robots.txt", async ({ request }) => {
  expect(await (await request.get("/robots.txt")).text()).toContain("Disallow: /admin");
});

test("members get a 404 and no Admin link", async ({ page, asMember }) => {
  await page.goto("/");
  await openAccountMenu(page, asMember.handle);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await expectNotFound(page, "/admin");
  await expectNotFound(page, "/admin/members");
});

test("moderators get a 404 and no Admin link", async ({ page, asModerator }) => {
  await page.goto("/");
  await openAccountMenu(page, asModerator.handle);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await expectNotFound(page, "/admin");
  await expectNotFound(page, "/admin/reports");
});

test("category moderators get a 404", async ({ page, asCategoryModerator }) => {
  expect(asCategoryModerator.handle).toBeTruthy();
  await expectNotFound(page, "/admin");
});

test("banned users get a 404", async ({ page, asBanned }) => {
  expect(asBanned.handle).toBeTruthy();
  await expectNotFound(page, "/admin");
});

test("unonboarded users and banned superusers get a 404", async ({ page, context, baseURL }) => {
  for (const opts of [{ onboarded: false }, { roles: ["superuser"] as TestRole[], banned: true }]) {
    const user = await createUser(opts);
    try {
      await context.clearCookies();
      await signInAs(context, baseURL!, user);
      await expectNotFound(page, "/admin");
    } finally {
      await deleteUser(user.id);
    }
  }
});

test("superusers see everything but notes and categories", async ({ page, asSuperuser }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openAccountMenu(page, asSuperuser.handle);
  await page.getByRole("link", { name: "Admin" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();

  const nav = adminNav(page);
  await expect(nav.getByRole("link")).toHaveText(SUPERUSER_SECTIONS.map((s) => s.link));
  await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  await expectAccessible(page);

  await nav.getByRole("link", { name: "Members" }).click();
  await expect(page).toHaveURL(/\/admin\/members$/);
  await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");

  for (const s of SUPERUSER_SECTIONS) {
    const res = await page.goto(s.path);
    expect(res?.status(), s.path).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: s.h1 })).toBeVisible();
  }
  // the layout lets superusers in; these pages refuse them on their own
  await expectNotFound(page, "/admin/notes");
  await expectNotFound(page, "/admin/categories");
});

test("the owner sees every section", async ({ page, asOwner }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await openAccountMenu(page, asOwner.handle);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");

  for (const s of OWNER_SECTIONS) {
    const res = await page.goto(s.path);
    expect(res?.status(), s.path).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: s.h1 })).toBeVisible();
    await expect(adminNav(page).getByRole("link")).toHaveText(OWNER_SECTIONS.map((o) => o.link));
    await expect(adminNav(page).getByRole("link", { name: s.link })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await expect(page).toHaveTitle(/^Categories · Admin · /);
});
