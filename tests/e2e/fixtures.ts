import { randomBytes } from "node:crypto";
import { test as base, expect, type BrowserContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signTestSession, TEST_SESSION_COOKIE } from "../../src/features/auth/test-session";
import { testClient } from "../helpers/db";

export interface TestUser {
  id: string;
  handle: string | null;
}

/** Creates a user in the local test database (auth.users + profile + roles). */
export async function createUser({
  handle = `u_${randomBytes(5).toString("hex")}`,
  onboarded = true,
  roles = [] as ("admin" | "moderator")[],
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
    for (const role of roles) {
      await db.query("insert into app.user_roles (user_id, role) values ($1, $2)", [id, role]);
    }
    return { id, handle: onboarded ? handle : null };
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
  asAdmin: TestUser;
  asUnonboarded: TestUser;
};

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
 * Shared fixture: blocks every third-party request (tests must not depend on live APIs) and fails
 * the test on any page error or console error. `asMember`, `asAdmin` and `asUnonboarded` create a
 * user in the test database and sign the browser in as them.
 */
export const test = base.extend<Fixtures>({
  asMember: signedIn({}),
  asAdmin: signedIn({ roles: ["admin"] }),
  asUnonboarded: signedIn({ onboarded: false }),
  errors: [
    async ({ page, baseURL }, use) => {
      const errors: string[] = [];
      await page.route("**/*", (route) =>
        route.request().url().startsWith(baseURL!)
          ? route.continue()
          : route.abort("blockedbyclient"),
      );
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
