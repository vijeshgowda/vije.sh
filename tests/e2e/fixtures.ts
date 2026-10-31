import { randomBytes } from "node:crypto";
import { test as base, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signTestSession, TEST_SESSION_COOKIE } from "../../src/features/auth/test-session";
import { signalingEndpoints } from "../../src/features/omni/signaling-url";
import { env } from "../../src/lib/env";
import { testClient } from "../helpers/db";

const { healthUrl } = signalingEndpoints(env("omni").NEXT_PUBLIC_OMNI_SIGNALING_URL);

export interface TestUser {
  id: string;
  handle: string | null;
}

/** A stored role for createUser(); a moderator can be scoped to one category (by slug). */
export type TestRole = "superuser" | "moderator" | { role: "moderator"; category: string };

/**
 * Creates a user in the local test database (auth.users + profile + roles, optionally an active
 * ban). There is only ever one owner: use ensureOwner() for that.
 */
export async function createUser({
  handle = `u_${randomBytes(5).toString("hex")}`,
  onboarded = true,
  roles = [] as TestRole[],
  banned = false,
} = {}): Promise<TestUser> {
  const db = testClient();
  await db.connect();
  try {
    const { rows } = await db.query<{ id: string }>(
      "insert into auth.users (email) values ($1) returning id",
      [`${handle}@example.test`],
    );
    const id = rows[0]!.id;
    await db.query("insert into app.profiles (id, handle, onboarded_at) values ($1, $2, $3)", [
      id,
      onboarded ? handle : null,
      onboarded ? new Date() : null,
    ]);
    for (const r of roles) {
      const { role, category = null } = typeof r === "string" ? { role: r } : r;
      await db.query(
        `insert into app.user_roles (user_id, role, category_id)
         values ($1, $2, (select id from app.categories where slug = $3))`,
        [id, role, category],
      );
    }
    if (banned) {
      await db.query("insert into app.user_bans (user_id, reason) values ($1, 'e2e')", [id]);
    }
    return { id, handle: onboarded ? handle : null };
  } finally {
    await db.end();
  }
}

/**
 * The site owner (`admin` role), created on first use and never deleted: the database allows one
 * owner, and tests run in parallel workers. An advisory lock makes get-or-create race-free.
 */
export async function ensureOwner(): Promise<TestUser> {
  const db = testClient();
  await db.connect();
  try {
    await db.query("begin");
    await db.query("select pg_advisory_xact_lock(hashtext('e2e:owner'))");
    const { rows } = await db.query<TestUser>(
      `select p.id, p.handle::text as handle
         from app.user_roles r join app.profiles p on p.id = r.user_id
        where r.role = 'admin'`,
    );
    let owner = rows[0];
    if (!owner) {
      const handle = `owner_${randomBytes(4).toString("hex")}`;
      const created = await db.query<{ id: string }>(
        "insert into auth.users (email) values ($1) returning id",
        [`${handle}@example.test`],
      );
      owner = { id: created.rows[0]!.id, handle };
      await db.query("insert into app.profiles (id, handle, onboarded_at) values ($1, $2, now())", [
        owner.id,
        handle,
      ]);
      await db.query("insert into app.user_roles (user_id, role) values ($1, 'admin')", [owner.id]);
    }
    await db.query("commit");
    return owner;
  } catch (err) {
    await db.query("rollback");
    throw err;
  } finally {
    await db.end();
  }
}

export async function deleteUser(id: string) {
  const db = testClient();
  await db.connect();
  try {
    await db.query("delete from auth.users where id = $1", [id]);
  } finally {
    await db.end();
  }
}

/** Test sign-in (AUTH_MODE=test): the same HMAC cookie the server verifies. */
export async function signInAs(context: BrowserContext, baseURL: string, user: TestUser) {
  const value = signTestSession(user.id, process.env.TEST_AUTH_SECRET!);
  await context.addCookies([{ name: TEST_SESSION_COOKIE, value, url: baseURL }]);
}

type Fixtures = {
  errors: string[];
  asMember: TestUser;
  asUnonboarded: TestUser;
  asBanned: TestUser;
  asModerator: TestUser;
  asCategoryModerator: TestUser;
  asSuperuser: TestUser;
  asOwner: TestUser;
};

/** The category asCategoryModerator moderates. */
export const MODERATED_CATEGORY = "engineering";

const signedIn =
  (opts: Parameters<typeof createUser>[0]) =>
  async (
    { context, baseURL }: { context: BrowserContext; baseURL: string | undefined },
    use: (u: TestUser) => Promise<void>,
  ) => {
    const user = await createUser(opts);
    await signInAs(context, baseURL!, user);
    await use(user);
    await deleteUser(user.id);
  };

/**
 * Shared fixture: mocks Omni health and blocks other third-party requests (tests must not depend
 * on live APIs), and fails the test on any page error or console error. The `as*` fixtures create a
 * user in the test database, sign the browser in as them and delete them afterwards; `asOwner`
 * signs in as the one owner (ensureOwner), which is kept.
 */
export const test = base.extend<Fixtures>({
  asMember: signedIn({}),
  asUnonboarded: signedIn({ onboarded: false }),
  asBanned: signedIn({ banned: true }),
  asModerator: signedIn({ roles: ["moderator"] }),
  asCategoryModerator: signedIn({ roles: [{ role: "moderator", category: MODERATED_CATEGORY }] }),
  asSuperuser: signedIn({ roles: ["superuser"] }),
  asOwner: async ({ context, baseURL }, provide) => {
    const owner = await ensureOwner();
    await signInAs(context, baseURL!, owner);
    await provide(owner);
  },
  errors: [
    async ({ page, baseURL }, use) => {
      const errors: string[] = [];
      await page.route("**/*", (route) => {
        const request = route.request();
        if (request.url() === healthUrl && request.method() === "GET") {
          return route.fulfill({ status: 200, body: "ok" });
        }
        return request.url().startsWith(baseURL!)
          ? route.continue()
          : route.abort("blockedbyclient");
      });
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        // aborted third-party fetches log as network errors; those are expected here
        if (
          m.type() === "error" &&
          !/net::ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())
        ) {
          errors.push(m.text());
        }
      });
      await use(errors);
      expect(errors, "console or page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function expectAccessible(page: import("@playwright/test").Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}
