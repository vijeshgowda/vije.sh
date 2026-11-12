import type { Page, Response } from "@playwright/test";
import { expect, expectAccessible, test } from "./fixtures";
import { OMNI_SIGNALING_URL } from "./omni-signaling";

const signaling = new URL(OMNI_SIGNALING_URL);

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

async function expectOmniPermissions(page: Page, response: Response) {
  expect(response.status()).toBe(200);
  expect(response.headers()["permissions-policy"]).toContain(
    "camera=(self), microphone=(self), display-capture=(self)",
  );
  const csp = response.headers()["content-security-policy"] ?? "";
  expect(csp).toContain(signaling.origin);
  expect(csp.match(/connect-src/g)).toHaveLength(1);

  await page.context().grantPermissions(["camera", "microphone"], {
    origin: new URL(page.url()).origin,
  });
  const tracks = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    const kinds = stream
      .getTracks()
      .map((track) => track.kind)
      .sort();
    stream.getTracks().forEach((track) => track.stop());
    return kinds;
  });
  expect(tracks).toEqual(["audio", "video"]);
}

test("Lab card performs a document navigation with Omni media permissions", async ({ page }) => {
  const labResponse = await page.goto("/lab");
  const labPolicy = labResponse?.headers()["permissions-policy"] ?? "";
  const labCsp = labResponse?.headers()["content-security-policy"] ?? "";
  expect(labPolicy).toContain("camera=()");
  expect(labCsp).not.toContain(signaling.host);
  expect(labCsp.match(/connect-src/g)).toHaveLength(1);
  const card = page.getByTestId("omni-card");
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().isNavigationRequest() && new URL(response.url()).pathname === "/lab/omni",
    { timeout: 10_000 },
  );
  await card.click();
  const response = await responsePromise;
  await expect(page).toHaveURL(/\/lab\/omni$/);
  expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(timeOrigin);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/omni.webmanifest");

  await expectOmniPermissions(page, response);
});

test("P8 header link opens Omni with its own media permissions", async ({ page, isMobile }) => {
  await page.setViewportSize({ width: isMobile ? 390 : 1920, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/work");
  const header = page.getByRole("banner");
  if (isMobile) {
    await expect(header).toHaveAttribute("data-fit", "compact");
    await header.getByRole("button", { name: "Menu, current page: Work" }).click();
  } else {
    await expect(header).not.toHaveAttribute("data-fit", "compact");
  }
  const nav = header.getByRole("navigation", { name: "Main" });
  const omni = nav.getByRole("link", { name: /P8\s*Omni/ });
  await expect(omni).toBeVisible();
  await expect(omni).toHaveAttribute("href", "/lab/omni");

  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().isNavigationRequest() && new URL(response.url()).pathname === "/lab/omni",
    { timeout: 10_000 },
  );
  await omni.click();
  const response = await responsePromise;
  await expect(page).toHaveURL(/\/lab\/omni$/);
  expect(await page.evaluate(() => performance.timeOrigin)).not.toBe(timeOrigin);
  await expectOmniPermissions(page, response);

  if (isMobile) {
    await header.getByRole("button", { name: "Menu, current page: Omni" }).click();
  }
  await expect(nav.getByRole("link", { name: /P8\s*Omni/ })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(nav.getByRole("link", { name: /P3\s*Lab/ })).not.toHaveAttribute("aria-current");
});

// Render wakes on Create/Join (the WebSocket connect), never from browsing Lab
test("Lab never contacts the signalling server", async ({ page }) => {
  const signalingRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).host === signaling.host) signalingRequests.push(request.url());
  });
  await page.goto("/work");
  await page.getByRole("contentinfo").getByRole("link", { name: "Lab", exact: true }).click();
  await expect(page).toHaveURL(/\/lab$/);
  const card = page.getByTestId("omni-card");
  await card.hover();
  await card.focus();
  await page.waitForLoadState("networkidle");
  expect(signalingRequests).toEqual([]);
});

test("Omni route stays accessible in dark theme", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab/omni");
  await page.getByRole("button", { name: "Dark" }).click();
  await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  await expectAccessible(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
