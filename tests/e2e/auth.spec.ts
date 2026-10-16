import { randomBytes } from "node:crypto";
import type { Page } from "@playwright/test";
import { createUser, deleteUser, expect, expectAccessible, signInAs, test } from "./fixtures";

// Stands in for Cloudflare's script: the test secret makes the server accept any token.
async function stubTurnstile(page: Page) {
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.turnstile = {
        render(el, o) { setTimeout(() => o.callback("XXXX.DUMMY.TOKEN.XXXX"), 0); return "t"; },
        remove() {},
      };`,
    }),
  );
}

test("guests see Sign in, and /login lists the providers", async ({ page }) => {
  await page.goto("/lab");
  const signIn = page.getByRole("banner").getByRole("link", { name: "Sign in" });
  await expect(signIn).toHaveAttribute("href", "/login?next=%2Flab");
  await expect(signIn).toHaveCSS("border-top-style", "solid");
  await expect(signIn).toHaveCSS("border-top-width", "1px");
  const bounds = await signIn.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  await signIn.focus();
  await expect(signIn).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await signIn.click();
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  for (const p of ["GitHub", "Google", "Microsoft"]) {
    await expect(page.getByRole("button", { name: `Continue with ${p}` })).toBeVisible();
  }
});

test("a login error from the callback is shown", async ({ page }) => {
  await page.goto("/login?error=callback");
  await expect(page.getByText("Sign-in didn't complete. Please try again.")).toBeVisible();
});

test("the outlined Sign in button fits narrow screens in both themes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab");
  const banner = page.getByRole("banner");
  const signIn = banner.getByRole("link", { name: "Sign in" });
  const theme = banner.getByRole("button", { name: "Dark", exact: true });
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const dark of [false, true]) {
      if ((await theme.getAttribute("aria-pressed")) !== String(dark)) await theme.click();
      await expect(signIn).toBeVisible();
      await expect(signIn).toHaveCSS("border-top-width", "1px");
      await theme.focus();
      await page.keyboard.press("Tab");
      await expect(signIn).toBeFocused();
      await expect(signIn).toHaveCSS("outline-style", "solid");
      await expect(signIn).toHaveCSS("outline-width", "2px");
      await expect(signIn).toHaveCSS("transition-duration", "0s");
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
        .toBe(true);
      expect(await signIn.evaluate((link) => link.scrollWidth <= link.clientWidth)).toBe(true);
    }
  }
});

for (const onboarded of [false, true]) {
  test(`the outlined ${onboarded ? "account menu" : "Finish sign-up link"} fits every screen`, async ({
    page,
    context,
    baseURL,
  }) => {
    const user = await createUser({
      handle: `account_${randomBytes(8).toString("hex")}`,
      onboarded,
    });
    try {
      await signInAs(context, baseURL!, user);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/lab");
      const banner = page.getByRole("banner");
      const control = onboarded
        ? banner.getByLabel(`Account: @${user.handle}`)
        : banner.getByRole("link", { name: "Finish sign-up" });
      const theme = banner.getByRole("button", { name: "Dark", exact: true });
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const dark of [false, true]) {
          if ((await theme.getAttribute("aria-pressed")) !== String(dark)) await theme.click();
          await expect(control).toBeVisible();
          await expect(control).toHaveCSS("border-top-style", "solid");
          await expect(control).toHaveCSS("border-top-width", "1px");
          const bounds = await control.boundingBox();
          expect(bounds!.height).toBeGreaterThanOrEqual(44);
          expect(bounds!.width).toBeGreaterThanOrEqual(44);
          await theme.focus();
          await page.keyboard.press("Tab");
          await expect(control).toBeFocused();
          await expect(control).toHaveCSS("outline-style", "solid");
          await expect(control).toHaveCSS("outline-width", "2px");
          await expect(control).toHaveCSS("transition-duration", "0s");
          await expect
            .poll(() =>
              page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            )
            .toBe(true);
          if (onboarded) {
            const label = control.locator("span");
            await expect(label).toHaveCSS("text-overflow", "ellipsis");
            if (width <= 640) {
              expect(
                await label.evaluate((element) => {
                  const range = document.createRange();
                  range.setStart(element.firstChild!, 0);
                  range.setEnd(element.firstChild!, 8);
                  return (
                    element.getBoundingClientRect().width <= range.getBoundingClientRect().width
                  );
                }),
              ).toBe(true);
            } else {
              await expect(label).toHaveCSS("max-width", "none");
            }
            await page.keyboard.press("Enter");
            await expect(banner.getByRole("button", { name: "Sign out" })).toBeVisible();
            await page.keyboard.press("Enter");
            await expect(banner.getByRole("button", { name: "Sign out" })).toBeHidden();
          } else {
            await expect(control).toHaveAttribute("href", "/welcome");
          }
        }
      }
      await expectAccessible(page);
    } finally {
      await deleteUser(user.id);
    }
  });
}

test("/api/me answers guests without a session", async ({ request }) => {
  const res = await request.get("/api/me");
  expect(res.headers()["cache-control"]).toContain("no-store");
  expect(await res.json()).toEqual({ user: null });
});

test("/welcome asks guests to sign in first", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page.getByText("first, then pick your handle")).toBeVisible();
});

test("a new account picks a handle, then returns to where it started", async ({
  page,
  asUnonboarded,
}) => {
  await stubTurnstile(page);
  await page.goto("/welcome?next=/lab");
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Finish sign-up" }),
  ).toBeVisible();
  const handle = `n_${asUnonboarded.id.slice(0, 8)}`;
  await page.getByLabel("Handle", { exact: true }).fill(handle);
  await page.getByRole("checkbox", { name: /community guidelines/ }).check();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page).toHaveURL(/\/lab$/);
  await expect(page.getByRole("banner").getByText(`@${handle}`)).toBeVisible();
});

test("a handle is unique in any letter case", async ({ page, asUnonboarded }) => {
  const other = await createUser({ handle: `Taken_${asUnonboarded.id.slice(0, 6)}` });
  try {
    await stubTurnstile(page);
    await page.goto("/welcome");
    const field = page.getByLabel("Handle", { exact: true });
    await field.fill(other.handle!.toLowerCase());
    await page.getByRole("checkbox", { name: /community guidelines/ }).check();
    await page.getByRole("button", { name: "Join" }).click();
    await expect(page.getByText("That handle is taken.")).toBeVisible();
    await expect(field).toHaveAttribute("aria-invalid", "true");
  } finally {
    await deleteUser(other.id);
  }
});

test("a member sees their handle and can sign out", async ({ page, asMember }) => {
  await page.goto("/");
  const banner = page.getByRole("banner");
  await banner.getByText(`@${asMember.handle}`).click();
  await banner.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(banner.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("an onboarded member visiting /welcome is told they're set", async ({ page, asMember }) => {
  await page.goto("/welcome?next=/blog");
  await expect(page.getByText(`all set as @${asMember.handle}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/blog");
});

test("only /welcome allows Turnstile in its CSP", async ({ request }) => {
  const welcome = (await request.get("/welcome")).headers()["content-security-policy"];
  expect(welcome).toContain("script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com");
  expect(welcome).toContain("frame-src https://challenges.cloudflare.com");
  for (const path of ["/", "/login", "/welcome-not"]) {
    const csp = (await request.get(path)).headers()["content-security-policy"];
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(csp, path).not.toContain("challenges.cloudflare.com");
  }
});

test("sign-out rejects cross-site posts", async ({ request }) => {
  const res = await request.post("/auth/signout", {
    headers: { origin: "https://evil.example" },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(403);
});
