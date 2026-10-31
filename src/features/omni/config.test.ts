import { describe, expect, it } from "vitest";
import { ICE_SERVERS, iceSummary } from "./config";

describe("Omni ICE servers", () => {
  it("matches the original config.js endpoints", () => {
    expect(ICE_SERVERS.map((server) => server.urls)).toEqual([
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "turn:global.relay.metered.ca:80",
      "turn:global.relay.metered.ca:443",
      "turns:global.relay.metered.ca:443",
    ]);
  });

  it("gives every TURN server the original credentials and STUN none", () => {
    for (const server of ICE_SERVERS) {
      const url = String(server.urls);
      if (url.startsWith("stun:")) {
        expect(server.username).toBeUndefined();
      } else {
        expect(server.username).toBe("0cefb2fbcb33b85faa1dcbc2");
        expect(server.credential).toBe("P3sNIoL2SmEjGV4Z");
      }
    }
  });

  it("summarises STUN and TURN counts, including url arrays", () => {
    expect(iceSummary()).toEqual({ stun: 2, turn: 3 });
    expect(iceSummary([{ urls: ["stun:a", "turns:b"] }])).toEqual({ stun: 1, turn: 1 });
  });
});
