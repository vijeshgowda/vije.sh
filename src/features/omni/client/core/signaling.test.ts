import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignalingClient, type SignalingSocket } from "./signaling";

class Socket extends EventTarget implements SignalingSocket {
  readyState = 0;
  send = vi.fn<(data: string) => void>();
  close = vi.fn(() => {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  });
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  message(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }));
  }
}

const clients: SignalingClient[] = [];
function setup(url = "ws://localhost:4444") {
  const sockets: Socket[] = [];
  const factory = vi.fn(() => {
    const socket = new Socket();
    sockets.push(socket);
    return socket;
  });
  const client = new SignalingClient(url, factory);
  clients.push(client);
  return { client, factory, sockets };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect();
  expect(vi.getTimerCount()).toBe(0);
  vi.useRealTimers();
});

describe("signalling client", () => {
  it("sends the original create/join/signal wire shapes and updates room state", async () => {
    const { client, sockets } = setup();
    const connected = client.connect();
    sockets[0].open();
    await connected;
    client.createRoom("CUSTOM");
    client.joinRoom(" k7q2m9 ");
    client.sendSignal({ type: "description", sdp: { type: "offer", sdp: "v=0" } });
    expect(sockets[0].send.mock.calls.map(([wire]) => JSON.parse(wire))).toEqual([
      { type: "create", code: "CUSTOM" },
      { type: "join", code: "K7Q2M9" },
      { type: "signal", payload: { type: "description", sdp: { type: "offer", sdp: "v=0" } } },
    ]);
    const created = vi.fn();
    const unsubscribe = client.on("created", created);
    sockets[0].message(JSON.stringify({ type: "created", code: "K7Q2M9", custom: false }));
    expect(client.roomCode).toBe("K7Q2M9");
    expect(client.phase).toBe("lobby");
    expect(created).toHaveBeenCalledWith({ type: "created", code: "K7Q2M9", custom: false });
    unsubscribe();
    sockets[0].message(JSON.stringify({ type: "created", code: "NEW123", custom: false }));
    expect(created).toHaveBeenCalledTimes(1);
    sockets[0].message(JSON.stringify({ type: "joined", code: "NEW456" }));
    expect(client.roomCode).toBe("NEW456");
  });

  it("rejects invalid URLs and a second concurrent connect", async () => {
    for (const url of ["not a url", "https://localhost:4444"]) {
      const { client } = setup(url);
      await expect(client.connect()).rejects.toThrow();
    }
    const { client, sockets } = setup();
    const pending = client.connect();
    await expect(client.connect()).rejects.toThrow("already");
    sockets[0].open();
    await pending;
  });

  it.each(["error", "close"])("rejects an initial socket %s", async (event) => {
    const { client, sockets } = setup();
    const rejected = expect(client.connect()).rejects.toThrow();
    sockets[0].dispatchEvent(new Event(event));
    await rejected;
  });

  it("rejects a cold-start connection at exactly 30 seconds and cancels the socket", async () => {
    const { client, sockets } = setup();
    const rejected = expect(client.connect()).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(29999);
    expect(sockets[0].close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(sockets[0].close).toHaveBeenCalledOnce();
    expect(client.ws).toBeNull();
  });

  it("rejoins a creator's lobby code after reconnect, and lets callers create a new code on failure", async () => {
    const { client, sockets } = setup();
    const connected = client.connect();
    sockets[0].open();
    await connected;
    client.createRoom("CUSTOM");
    sockets[0].message('{"type":"created","code":"CUSTOM","custom":true}');
    const reconnecting = vi.fn();
    client.on("reconnecting", reconnecting);
    sockets[0].close();
    expect(reconnecting).toHaveBeenCalledWith({ attempt: 1, max: 6, delay: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    sockets[1].open();
    expect(sockets[1].send).toHaveBeenCalledWith('{"type":"rejoin","code":"CUSTOM"}');
    const failed = vi.fn();
    client.on("rejoin-failed", failed);
    sockets[1].message('{"type":"rejoin-failed","code":"CUSTOM"}');
    expect(failed).toHaveBeenCalledOnce();
    client.recreateRoom();
    expect(sockets[1].send).toHaveBeenLastCalledWith('{"type":"create","code":"CUSTOM"}');
    sockets[1].message('{"type":"rejoined","code":"NEW123","custom":false}');
    expect(client.roomCode).toBe("NEW123");
  });

  it.each(["lobby", "call"] as const)(
    "limits %s reconnection to six backoff attempts",
    async (phase) => {
      const { client, sockets } = setup();
      const connected = client.connect();
      sockets[0].open();
      await connected;
      client.phase = phase;
      const failed = vi.fn(),
        reconnecting = vi.fn();
      client.on("reconnect-failed", failed);
      client.on("reconnecting", reconnecting);
      sockets[0].close();
      for (const delay of [1000, 2000, 4000, 8000, 16000, 30000]) {
        await vi.advanceTimersByTimeAsync(delay);
        sockets.at(-1)!.close();
      }
      expect(sockets.length).toBe(7);
      expect(failed).toHaveBeenCalledWith({ silent: phase === "call" });
      expect(reconnecting).toHaveBeenCalledTimes(phase === "call" ? 0 : 6);
    },
  );

  it("times out a hung reconnect and keeps retrying", async () => {
    const { client, sockets } = setup();
    const connected = client.connect();
    sockets[0].open();
    await connected;
    client.phase = "lobby";
    sockets[0].close();
    await vi.advanceTimersByTimeAsync(31000);
    expect(sockets[1].close).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
    expect(sockets.length).toBe(3);
  });

  it("reports malformed messages and server errors explicitly", async () => {
    const { client, sockets } = setup();
    const connected = client.connect();
    sockets[0].open();
    await connected;
    const errors = vi.fn();
    client.on("error", errors);
    for (const data of ["not json", '{"type":"unknown"}', new ArrayBuffer(4)])
      sockets[0].message(data);
    expect(errors).toHaveBeenCalledTimes(3);
    sockets[0].message('{"type":"error","message":"Room is full."}');
    expect(errors).toHaveBeenLastCalledWith({ type: "error", message: "Room is full." });
  });

  it("cancels pending connect and retry timers on intentional disconnect", async () => {
    const { client, sockets, factory } = setup();
    const cancelled = expect(client.connect()).rejects.toThrow("cancelled");
    client.disconnect();
    await cancelled;
    expect(() => client.createRoom()).toThrow("not open");
    const connected = client.connect();
    sockets[1].open();
    await connected;
    client.phase = "lobby";
    sockets[1].close();
    client.disconnect();
    await vi.advanceTimersByTimeAsync(100000);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("emits disconnected in idle, and never reconnects an intentionally closed client", async () => {
    const { client, sockets } = setup();
    const connected = client.connect();
    sockets[0].open();
    await connected;
    const disconnected = vi.fn();
    client.on("disconnected", disconnected);
    sockets[0].close();
    expect(disconnected).toHaveBeenCalledOnce();
    client.disconnect();
    await vi.advanceTimersByTimeAsync(100000);
    expect(sockets).toHaveLength(1);
  });
});
