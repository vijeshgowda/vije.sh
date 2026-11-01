import { randomBytes } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { expect, expectAccessible, guardPage, test as base } from "./fixtures";

// These specs talk to the real signalling server from services/omni-signaling, which Playwright
// starts locally (playwright.config.ts), so they never touch Render. Every person in a call has
// their own browser context, as two people on two devices would.

/** Room codes the server generates: six characters, without 0/O, 1/I or L. */
const ROOM_CODE = /^[A-HJKMNP-Z2-9]{6}$/;

const test = base.extend<{ newPerson: () => Promise<Page> }>({
  newPerson: async (
    { browser, baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, permissions },
    provide,
  ) => {
    const people: { page: Page; errors: string[] }[] = [];
    await provide(async () => {
      const context = await browser.newContext({
        baseURL,
        viewport,
        userAgent,
        deviceScaleFactor,
        isMobile,
        hasTouch,
        permissions,
      });
      const page = await context.newPage();
      people.push({ page, errors: await guardPage(page, baseURL!) });
      return page;
    });
    for (const { page } of people) await page.context().close();
    for (const { errors } of people) expect(errors, "console or page errors").toEqual([]);
  },
});

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
  permissions: ["camera", "microphone"],
});

/**
 * Call controls auto-hide 4 s after the last interaction; moving the mouse brings them back, as
 * for a real user. On a busy machine they can hide again before the click lands, so wake and
 * click again until `done` holds. It is checked first, so a click that landed is never repeated.
 */
async function press(page: Page, control: Locator, done: (timeout: number) => Promise<unknown>) {
  await expect(async () => {
    if (
      await done(250).then(
        () => true,
        () => false,
      )
    )
      return;
    await page.mouse.move(40, 120);
    await page.mouse.move(60, 140);
    await control.click({ timeout: 1_000 });
    await done(2_000);
  }).toPass({ timeout: 15_000 });
}

/** axe can't judge contrast mid-fade; without motion the controls are shown or hidden, never half. */
async function expectCallAccessible(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expectAccessible(page);
}

/**
 * A click before hydration is lost (or submits the form natively), so retry until the app reacts.
 * A click that did land can take a while (media, the RTC chunk, the server), and Create is disabled
 * or gone meanwhile: only click while the lobby isn't open, and never wait long on the button.
 */
async function create(page: Page) {
  const lobby = page.getByRole("heading", { name: "Waiting room" });
  await expect(async () => {
    if (!(await lobby.isVisible())) {
      await page
        .getByRole("button", { name: "Create Room" })
        .click({ timeout: 1_000 })
        .catch(() => {});
    }
    await expect(lobby).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** The code the server gave the room `page` just opened. */
async function roomCode(page: Page) {
  const code = page.getByTestId("omni-room-code");
  await expect(code).toHaveText(ROOM_CODE);
  return (await code.textContent())!;
}

/** Opens a room on `page`, joins it from `peer` and waits until both see the safety check. */
async function connectPair(page: Page, peer: Page) {
  await page.goto("/lab/omni");
  await create(page);
  const code = await roomCode(page);
  await peer.goto(`/lab/omni#${code}`);
  // the share-link code is filled in on hydration, so Join is live once it shows
  await expect(peer.getByLabel("Room code")).toHaveValue(code);
  await peer.getByRole("button", { name: "Join", exact: true }).click();
  for (const side of [page, peer]) {
    await expect(side.getByTestId("omni-call")).toBeVisible({ timeout: 20_000 });
    await expect(side.getByRole("dialog", { name: "Verify your peer" })).toBeVisible({
      timeout: 20_000,
    });
  }
  return code;
}

test("setup validates codes, then a room opens in an accessible lobby", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab/omni");

  await expect(page.getByRole("heading", { name: "Link setup" })).toBeVisible();
  await expect(async () => {
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await expect(page.getByText("Enter a valid code (4-10 characters).")).toBeVisible({
      timeout: 1_000,
    });
  }).toPass();
  await expect(page.getByLabel("Room code")).toHaveAttribute("aria-invalid", "true");
  await expectAccessible(page);

  await page.getByRole("button", { name: "Create Room" }).click();
  await expect(page.getByRole("heading", { name: "Waiting room" })).toBeFocused();
  const code = await roomCode(page);
  await expect(page.getByText(`Room code ${[...code].join(" ")}`)).toBeAttached();
  await expect(page.getByRole("status").filter({ hasText: "Waiting for peer" })).toBeVisible();
  await expect(page.getByText(new RegExp(`/lab/omni#${code}$`))).toBeVisible();
  await expectAccessible(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Link setup" })).toBeFocused();
});

test("joining an unknown room shows the server's error", async ({ page }) => {
  // The server never generates an O, so no other test can have opened this room
  await page.goto("/lab/omni#NOROOM");
  await expect(page.getByLabel("Room code")).toHaveValue("NOROOM");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  const alert = page.locator("[data-omni-focus]");
  await expect(alert).toContainText("Room not found. Check the code and try again.");
  await expect(alert).toBeFocused();
  // A wrong code needs a new code, not a retry
  await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await alert.getByRole("button", { name: "Dismiss" }).click();
  await expect(alert).toBeHidden();
});

/** Opens the custom-code field (a click before hydration does nothing) and creates `code`. */
async function createCustom(page: Page, code: string) {
  const toggle = page.getByRole("button", { name: "Choose my own code" });
  await expect(async () => {
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await expect(page.getByLabel("Custom code")).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.getByLabel("Custom code").fill(code);
  await page.getByRole("button", { name: "Create Room" }).click();
}

test("the server refuses a code in use and a third person in a full room", async ({
  page,
  newPerson,
}) => {
  test.setTimeout(60_000);
  const code = `E${randomBytes(4).toString("hex").toUpperCase()}`;
  await page.goto("/lab/omni");
  await createCustom(page, code);
  await expect(page.getByTestId("omni-room-code")).toHaveText(code);

  const other = await newPerson();
  await other.goto("/lab/omni");
  await createCustom(other, code);
  const alert = other.locator("[data-omni-focus]");
  await expect(alert).toContainText("That code is already in use. Try a different one.");

  const peer = await newPerson();
  await peer.goto(`/lab/omni#${code}`);
  await expect(peer.getByLabel("Room code")).toHaveValue(code);
  await peer.getByRole("button", { name: "Join", exact: true }).click();
  await expect(peer.getByTestId("omni-call")).toBeVisible({ timeout: 20_000 });

  await other.goto(`/lab/omni#${code}`);
  await expect(other.getByLabel("Room code")).toHaveValue(code);
  await other.getByRole("button", { name: "Join", exact: true }).click();
  await expect(alert).toContainText("That room already has two people.");
});

test("two peers connect, see the same safety check, and the call ends for both", async ({
  page,
  newPerson,
}) => {
  test.setTimeout(60_000);
  const peer = await newPerson();
  const code = await connectPair(page, peer);

  for (const side of [page, peer]) {
    const call = side.getByTestId("omni-call");
    await expect(call).toHaveAttribute("aria-label", `Call ${code}`);
    await expect(call).toHaveAttribute("data-theme", "dark");
    await expect(side.getByTestId("omni-remote-video")).toBeVisible();
  }
  const safety = async (side: Page) =>
    side.getByRole("dialog", { name: "Verify your peer" }).innerText();
  const mine = await safety(page);
  expect(mine).toMatch(/(\S+ ){4}\S+\n[0-9A-F]{4} [0-9A-F]{4}/u);
  expect(await safety(peer)).toBe(mine);

  await page.getByRole("button", { name: "They match" }).click();
  await expect(page.getByRole("dialog", { name: "Verify your peer" })).toBeHidden();
  const mic = page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", {
    name: "Mic",
  });
  await expect(mic).toHaveAttribute("aria-pressed", "true");
  await press(page, mic, (timeout) =>
    expect(mic).toHaveAttribute("aria-pressed", "false", { timeout }),
  );
  await expect(mic).toHaveAttribute("aria-pressed", "false");
  await expectCallAccessible(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  const setup = page.getByRole("heading", { name: "Link setup" });
  await press(page, page.getByRole("button", { name: "End", exact: true }), (timeout) =>
    expect(setup).toBeVisible({ timeout }),
  );
  await expect(peer.getByRole("alert").filter({ hasText: "left the call" })).toBeVisible();
  await expect(peer.getByRole("heading", { name: "Link setup" })).toBeVisible({ timeout: 6_000 });
});

test("peers chat and send an encrypted, verified file", async ({ page, newPerson }) => {
  test.setTimeout(60_000);
  const peer = await newPerson();
  await connectPair(page, peer);
  for (const side of [page, peer]) await side.getByRole("button", { name: "They match" }).click();

  const input = page.getByRole("textbox", { name: "Message" });
  await press(
    page,
    page.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: "Chat" }),
    (timeout) => expect(input).toBeFocused({ timeout }),
  );
  await input.fill("hello <b>there</b>");
  await input.press("Enter");
  await expect(input).toHaveValue("");

  const peerLog = peer.getByRole("log", { name: "Message" });
  await expect(peerLog.getByText("hello <b>there</b>")).toBeAttached();
  await expect(
    peer.getByRole("toolbar", { name: "Call controls" }).getByRole("button", { name: /unread/ }),
  ).toBeAttached();

  await page.getByTestId("omni-file-input").setInputFiles({
    name: "note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("omni file transfer\n"),
  });
  await expect(page.getByRole("tabpanel", { name: /Files/ })).toContainText("Sent");
  const save = peerLog.getByRole("link", { name: "Save" });
  await expect(save).toHaveAttribute("download", "note.txt");
  await expect(peerLog).toContainText("note.txt · 19 B · SHA-256 ok");

  await peer.getByRole("region", { name: "Chat and files" }).scrollIntoViewIfNeeded();
  const [download] = await Promise.all([peer.waitForEvent("download"), save.click()]);
  expect(download.suggestedFilename()).toBe("note.txt");
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  expect(await readFile(path, "utf8")).toBe("omni file transfer\n");
  await expectCallAccessible(peer);
});

test("the language is remembered, and the lobby shows the join link as a QR code", async ({
  page,
}) => {
  await page.goto("/lab/omni");
  const languages = page.getByRole("group", { name: "Language" });
  await expect(async () => {
    await languages.getByRole("button", { name: "Español" }).click();
    await expect(page.getByRole("heading", { name: "Configuración" })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass();
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Idioma" }).getByRole("button", { name: "Español" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("group", { name: "Idioma" })
    .getByRole("button", { name: "English" })
    .click();

  await create(page);
  const qr = page.getByRole("img", { name: "QR code for the join link" });
  await expect(qr.locator("svg path")).toHaveAttribute("d", /^M/);
  await expectAccessible(page);
});

test("a peer shares the screen and records the call to a local file", async ({
  page,
  newPerson,
}) => {
  test.setTimeout(60_000);
  // Without a file picker the recording falls back to a download, which the test can read.
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", { value: undefined });
    // Counts the frame clock's ticks, which keep the recording drawing in a hidden tab.
    const ticks = { count: 0 };
    Object.defineProperty(window, "__omniTicks", { value: ticks });
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", () => ticks.count++);
      }
    };
  });
  const peer = await newPerson();
  const code = await connectPair(page, peer);
  await page.getByRole("button", { name: "They match" }).click();

  const more = page.getByRole("button", { name: "More" });
  const share = page.getByRole("menuitemcheckbox", { name: /Share screen/ });
  const openMore = () => press(page, more, (timeout) => expect(share).toBeVisible({ timeout }));
  await openMore();
  await share.click();
  await openMore();
  await expect(share).toHaveAttribute("aria-checked", "true");
  await share.click();
  await openMore();
  await expect(share).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");

  const record = page.getByRole("menuitemcheckbox", { name: /Record call/ });
  await openMore();
  await record.click();
  await expect(page.getByTestId("omni-rec")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // The worker only starts on hide, so give it time to load on a busy machine.
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (window as unknown as { __omniTicks: { count: number } }).__omniTicks.count,
        ),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(3);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(1_000);
  const download = page.waitForEvent("download");
  await openMore();
  await record.click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    new RegExp(`^omni-${code}-\\d{4}-\\d\\d-\\d\\dT\\d\\d-\\d\\d-\\d\\d\\.webm$`),
  );
  await expect(page.getByTestId("omni-rec")).toBeHidden();
  await page.getByRole("button", { name: "Chat", exact: true }).click();
  await expect(page.getByText(/Recording saved/)).toBeVisible();
});
