import { test as base, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Shared fixture: blocks every third-party request (tests must not depend on live APIs) and fails
 * the test on any page error or console error.
 */
export const test = base.extend<{ errors: string[] }>({
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
