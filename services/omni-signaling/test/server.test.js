/**
 * Signalling server tests, ported from the original omni/tests/server.test.js. Each suite spawns
 * index.js exactly as Render starts it (`node index.js`), on a free port.
 */

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

const SERVER_PATH = fileURLToPath(new URL("../index.js", import.meta.url));
const TEST_ORIGIN = "http://localhost:3000";

/** Starts the server; `allowedOrigins` undefined leaves ALLOWED_ORIGINS unset. */
function startServer(allowedOrigins) {
  const env = { ...process.env, PORT: "0" };
  delete env.ALLOWED_ORIGINS;
  if (allowedOrigins !== undefined) env.ALLOWED_ORIGINS = allowedOrigins;
  const child = spawn(process.execPath, [SERVER_PATH], { env, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error("Server start timeout")), 5000);
    child.stderr.on("data", (data) => (stderr += data));
    child.stdout.on("data", (data) => {
      const match = /listening on :(\d+)/.exec(data.toString());
      if (match) {
        clearTimeout(timer);
        resolve({ child, port: Number(match[1]), stop: () => child.kill("SIGTERM") });
      }
    });
    // "close" waits for stdio to drain, so stderr is complete
    child.on("close", (code) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(`Server exited with ${code}`), { code, stderr }));
    });
  });
}

/** Resolves with the open socket, or rejects with the HTTP status of a refused upgrade. */
function connect(port, origin = TEST_ORIGIN) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`, origin ? { origin } : {});
    ws.on("open", () => resolve(ws));
    ws.on("unexpected-response", (_req, res) =>
      reject(Object.assign(new Error("refused"), { status: res.statusCode })),
    );
    ws.on("error", reject);
  });
}

function send(ws, msg) {
  ws.send(JSON.stringify(msg));
}

function waitForMessage(ws, type, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${type}"`)), timeout);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.off("message", handler);
        resolve(msg);
      }
    };
    ws.on("message", handler);
  });
}

function close(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.on("close", resolve);
    ws.close();
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 100));

describe("Signalling protocol", () => {
  let server;
  const open = () => connect(server.port);

  before(async () => {
    server = await startServer(TEST_ORIGIN);
  });
  after(() => server.stop());

  test("creates a room with random code", async () => {
    const ws = await open();
    send(ws, { type: "create", code: "" });
    const msg = await waitForMessage(ws, "created");
    assert.match(msg.code, /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    assert.equal(msg.custom, false);
    await close(ws);
  });

  test("creates a room with custom code", async () => {
    const ws = await open();
    send(ws, { type: "create", code: "MYROOM" });
    const msg = await waitForMessage(ws, "created");
    assert.equal(msg.code, "MYROOM");
    assert.equal(msg.custom, true);
    await close(ws);
  });

  test("rejects custom code shorter than 4 chars", async () => {
    const ws = await open();
    send(ws, { type: "create", code: "AB" });
    const msg = await waitForMessage(ws, "error");
    assert.match(msg.message, /at least 4/);
    await close(ws);
  });

  test("rejects duplicate custom code (active room)", async () => {
    const ws1 = await open();
    send(ws1, { type: "create", code: "TAKEN" });
    await waitForMessage(ws1, "created");
    const ws2 = await open();
    send(ws2, { type: "create", code: "TAKEN" });
    const msg = await waitForMessage(ws2, "error");
    assert.match(msg.message, /already in use/);
    await close(ws1);
    await close(ws2);
  });

  test("allows reclaiming custom code in grace period", async () => {
    const ws1 = await open();
    send(ws1, { type: "create", code: "RECLAIM" });
    await waitForMessage(ws1, "created");
    await close(ws1);
    await settle();
    const ws2 = await open();
    send(ws2, { type: "create", code: "RECLAIM" });
    const msg = await waitForMessage(ws2, "created");
    assert.equal(msg.code, "RECLAIM");
    assert.equal(msg.custom, true);
    await close(ws2);
  });

  test("joins an existing room", async () => {
    const creator = await open();
    send(creator, { type: "create", code: "" });
    const created = await waitForMessage(creator, "created");
    const joiner = await open();
    const peerJoined = waitForMessage(creator, "peer-joined");
    send(joiner, { type: "join", code: created.code });
    assert.deepEqual(await waitForMessage(joiner, "joined"), {
      type: "joined",
      code: created.code,
    });
    assert.equal((await peerJoined).type, "peer-joined");
    await close(creator);
    await close(joiner);
  });

  test("rejects joining non-existent room", async () => {
    const ws = await open();
    send(ws, { type: "join", code: "NOSUCH" });
    const msg = await waitForMessage(ws, "error");
    assert.match(msg.message, /not found/);
    await close(ws);
  });

  test("rejects joining a full room", async () => {
    const creator = await open();
    send(creator, { type: "create", code: "FULL" });
    await waitForMessage(creator, "created");
    const joiner1 = await open();
    send(joiner1, { type: "join", code: "FULL" });
    await waitForMessage(joiner1, "joined");
    const joiner2 = await open();
    send(joiner2, { type: "join", code: "FULL" });
    const msg = await waitForMessage(joiner2, "error");
    assert.match(msg.message, /full/);
    await Promise.all([close(creator), close(joiner1), close(joiner2)]);
  });

  test("relays signals between peers", async () => {
    const creator = await open();
    send(creator, { type: "create", code: "" });
    const created = await waitForMessage(creator, "created");
    const joiner = await open();
    const peerJoined = waitForMessage(creator, "peer-joined");
    send(joiner, { type: "join", code: created.code });
    await waitForMessage(joiner, "joined");
    await peerJoined;

    send(creator, { type: "signal", payload: { type: "offer", sdp: "fake-offer" } });
    const relayed = await waitForMessage(joiner, "signal");
    assert.deepEqual(relayed.payload, { type: "offer", sdp: "fake-offer" });

    send(joiner, { type: "signal", payload: { type: "answer", sdp: "fake-answer" } });
    const relayed2 = await waitForMessage(creator, "signal");
    assert.deepEqual(relayed2.payload, { type: "answer", sdp: "fake-answer" });

    await close(creator);
    await close(joiner);
  });

  test("notifies peer-left when other peer disconnects", async () => {
    const creator = await open();
    send(creator, { type: "create", code: "" });
    const created = await waitForMessage(creator, "created");
    const joiner = await open();
    const peerJoined = waitForMessage(creator, "peer-joined");
    send(joiner, { type: "join", code: created.code });
    await waitForMessage(joiner, "joined");
    await peerJoined;
    const left = waitForMessage(creator, "peer-left");
    await close(joiner);
    assert.equal((await left).type, "peer-left");
    await close(creator);
  });

  test("handles rejoin within grace period", async () => {
    const ws1 = await open();
    send(ws1, { type: "create", code: "GRACE" });
    await waitForMessage(ws1, "created");
    await close(ws1);
    await settle();
    const ws2 = await open();
    send(ws2, { type: "rejoin", code: "GRACE" });
    const msg = await waitForMessage(ws2, "rejoined");
    assert.equal(msg.code, "GRACE");
    await close(ws2);
  });

  test("returns rejoin-failed after room is deleted", async () => {
    const ws = await open();
    send(ws, { type: "rejoin", code: "NONEXIST" });
    const msg = await waitForMessage(ws, "rejoin-failed");
    assert.equal(msg.code, "NONEXIST");
    await close(ws);
  });

  test("normalizes custom code to uppercase", async () => {
    const ws = await open();
    send(ws, { type: "create", code: "lower" });
    assert.equal((await waitForMessage(ws, "created")).code, "LOWER");
    await close(ws);
  });

  test("strips special characters from code", async () => {
    const ws = await open();
    send(ws, { type: "create", code: "MY-CODE!" });
    assert.equal((await waitForMessage(ws, "created")).code, "MYCODE");
    await close(ws);
  });

  test("join is case-insensitive", async () => {
    const creator = await open();
    send(creator, { type: "create", code: "UPPER" });
    await waitForMessage(creator, "created");
    const joiner = await open();
    send(joiner, { type: "join", code: "upper" });
    assert.equal((await waitForMessage(joiner, "joined")).code, "UPPER");
    await close(creator);
    await close(joiner);
  });

  test("health endpoint returns 200", async () => {
    const res = await fetch(`http://localhost:${server.port}/health`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "OK");
  });

  test("non-health endpoint returns 404", async () => {
    const res = await fetch(`http://localhost:${server.port}/foo`);
    assert.equal(res.status, 404);
  });
});

describe("Origin allow-list", () => {
  test("without ALLOWED_ORIGINS only the committed origins may connect", async () => {
    const server = await startServer();
    try {
      await close(await connect(server.port, "https://vije.sh"));
      await close(await connect(server.port, "https://vijeshgowda.com"));
      for (const origin of [
        "http://localhost:3000",
        "https://www.vijeshgowda.com",
        "https://evil.example",
        undefined,
      ]) {
        await assert.rejects(connect(server.port, origin), { status: 403 }, String(origin));
      }
    } finally {
      server.stop();
    }
  });

  test("an empty ALLOWED_ORIGINS keeps the committed list instead of allowing everyone", async () => {
    const server = await startServer("");
    try {
      await close(await connect(server.port, "https://vije.sh"));
      await assert.rejects(connect(server.port, "https://evil.example"), { status: 403 });
    } finally {
      server.stop();
    }
  });

  test("ALLOWED_ORIGINS replaces the list and mismatches get 403", async () => {
    const server = await startServer(`${TEST_ORIGIN},https://preview.example`);
    try {
      await close(await connect(server.port, TEST_ORIGIN));
      await close(await connect(server.port, "https://preview.example"));
      for (const origin of ["https://vije.sh", "http://localhost:3001", `${TEST_ORIGIN}/`]) {
        await assert.rejects(connect(server.port, origin), { status: 403 }, origin);
      }
    } finally {
      server.stop();
    }
  });

  test("an invalid ALLOWED_ORIGINS stops the server from starting", async () => {
    await assert.rejects(startServer("*"), (error) => {
      assert.notEqual(error.code, 0);
      assert.match(error.stderr, /exact origins/);
      return true;
    });
  });
});
