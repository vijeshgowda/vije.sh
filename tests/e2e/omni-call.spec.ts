import type { Page, WebSocketRoute } from "@playwright/test";
import { env } from "../../src/lib/env";
import { expect, expectAccessible, test } from "./fixtures";

// The signalling server is replaced by an in-test relay that speaks the original server's protocol
// (omni/server/index.js), so these specs never touch Render.
const signaling = env("omni").NEXT_PUBLIC_OMNI_SIGNALING_URL;

test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
  permissions: ["camera", "microphone"],
});

type Relay = { creator?: WebSocketRoute; joiner?: WebSocketRoute; code: string };

async function fakeSignaling(page: Page, relay: Relay) {
  await page.routeWebSocket(signaling, (ws) => {
    ws.onMessage((raw) => {
      const message = JSON.parse(String(raw)) as { type: string; code?: string; payload?: unknown };
      const send = (target: WebSocketRoute | undefined, data: object) =>
        target?.send(JSON.stringify(data));
      if (message.type === "create") {
        relay.creator = ws;
        send(ws, { type: "created", code: relay.code, custom: false });
      } else if (message.type === "join") {
        if (message.code !== relay.code || !relay.creator) {
          send(ws, { type: "error", message: "Room not found. Check the code and try again." });
          return;
        }
        relay.joiner = ws;
        send(ws, { type: "joined", code: relay.code });
        send(relay.creator, { type: "peer-joined" });
      } else if (message.type === "signal") {
        const other = ws === relay.creator ? relay.joiner : relay.creator;
        send(other, { type: "signal", payload: message.payload });
      }
    });
    ws.onClose(() => {
      const other = ws === relay.creator ? relay.joiner : relay.creator;
      if (other && (ws === relay.creator || ws === relay.joiner)) {
        other.send(JSON.stringify({ type: "peer-left" }));
      }
    });
  });
}

/** Call controls auto-hide after 4 s; moving the mouse brings them back, as for a real user. */
async function wake(page: Page) {
  await page.mouse.move(40, 120);
  await page.mouse.move(60, 140);
}

/** A click before hydration is lost (or submits the form natively), so retry until the app reacts. */
async function create(page: Page) {
  await expect(async () => {
    await page.getByRole("button", { name: "Create Room" }).click();
    await expect(page.getByRole("heading", { name: "Waiting room" })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass();
}

test("setup validates codes, then a room opens in an accessible lobby", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const relay: Relay = { code: "K7Q2M9" };
  await fakeSignaling(page, relay);
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
  await expect(page.getByTestId("omni-room-code")).toHaveText("K7Q2M9");
  await expect(page.getByText("Room code K 7 Q 2 M 9")).toBeAttached();
  await expect(page.getByRole("status").filter({ hasText: "Waiting for peer" })).toBeVisible();
  await expect(page.getByText(/\/lab\/omni#K7Q2M9$/)).toBeVisible();
  await expectAccessible(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Link setup" })).toBeFocused();
});

test("joining an unknown room shows the server's error", async ({ page }) => {
  await fakeSignaling(page, { code: "K7Q2M9" });
  await page.goto("/lab/omni#ZZZZ99");
  await expect(page.getByLabel("Room code")).toHaveValue("ZZZZ99");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  const alert = page.locator("[data-omni-focus]");
  await expect(alert).toContainText("Room not found. Check the code and try again.");
  await expect(alert).toBeFocused();
  // A wrong code needs a new code, not a retry
  await expect(alert.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await alert.getByRole("button", { name: "Dismiss" }).click();
  await expect(alert).toBeHidden();
});

test("two peers connect, see the same safety check, and the call ends for both", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const relay: Relay = { code: "K7Q2M9" };
  await fakeSignaling(page, relay);
  const peer = await context.newPage();
  const peerErrors: string[] = [];
  peer.on("pageerror", (error) => peerErrors.push(error.message));
  peer.on("console", (message) => {
    if (message.type() === "error") peerErrors.push(message.text());
  });
  await fakeSignaling(peer, relay);

  await page.goto("/lab/omni");
  await create(page);
  await expect(page.getByTestId("omni-room-code")).toHaveText("K7Q2M9");

  await peer.goto("/lab/omni#K7Q2M9");
  // the share-link code is filled in on hydration, so Join is live once it shows
  await expect(peer.getByLabel("Room code")).toHaveValue("K7Q2M9");
  await peer.getByRole("button", { name: "Join", exact: true }).click();

  for (const side of [page, peer]) {
    const call = side.getByTestId("omni-call");
    await expect(call).toBeVisible({ timeout: 20_000 });
    await expect(call).toHaveAttribute("aria-label", "Call K7Q2M9");
    await expect(call).toHaveAttribute("data-theme", "dark");
    await expect(side.getByRole("dialog", { name: "Verify your peer" })).toBeVisible({
      timeout: 20_000,
    });
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
  await wake(page);
  await mic.click();
  await expect(mic).toHaveAttribute("aria-pressed", "false");
  await expectAccessible(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );

  await wake(page);
  await page.getByRole("button", { name: "End" }).click();
  await expect(page.getByRole("heading", { name: "Link setup" })).toBeVisible();
  await expect(peer.getByRole("alert").filter({ hasText: "left the call" })).toBeVisible();
  await expect(peer.getByRole("heading", { name: "Link setup" })).toBeVisible({ timeout: 6_000 });
  expect(peerErrors).toEqual([]);
});
