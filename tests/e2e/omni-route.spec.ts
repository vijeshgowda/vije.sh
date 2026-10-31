import { expect, expectAccessible, test } from "./fixtures";

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
});

test("Lab card performs a document navigation with Omni media permissions", async ({ page }) => {
  await page.route("https://omni-8t2t.onrender.com/health", (route) =>
    route.fulfill({ status: 200, body: "ok" }),
  );
  const labResponse = await page.goto("/lab");
  const labPolicy = labResponse?.headers()["permissions-policy"] ?? "";
  const labCsp = labResponse?.headers()["content-security-policy"] ?? "";
  expect(labPolicy).toContain("camera=()");
  expect(labCsp).toContain("https://omni-8t2t.onrender.com");
  expect(labCsp).not.toContain("wss://omni-8t2t.onrender.com");
  expect(labCsp.match(/connect-src/g)).toHaveLength(1);
  const card = page.getByRole("link", { name: /Omni/ });
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

  expect(response?.status()).toBe(200);
  expect(response?.headers()["permissions-policy"]).toContain(
    "camera=(self), microphone=(self), display-capture=(self)",
  );
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("wss://omni-8t2t.onrender.com");
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
