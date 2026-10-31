import { describe, expect, it } from "vitest";
import { signalingEndpoints } from "./signaling-url";

describe("signalingEndpoints", () => {
  it("uses the Render WebSocket origin and HTTPS health endpoint", () => {
    expect(signalingEndpoints("wss://omni-8t2t.onrender.com")).toEqual({
      signalingOrigin: "wss://omni-8t2t.onrender.com",
      healthOrigin: "https://omni-8t2t.onrender.com",
      healthUrl: "https://omni-8t2t.onrender.com/health",
    });
  });

  it("maps a local WebSocket server to its HTTP health endpoint", () => {
    expect(signalingEndpoints("ws://localhost:8765")).toEqual({
      signalingOrigin: "ws://localhost:8765",
      healthOrigin: "http://localhost:8765",
      healthUrl: "http://localhost:8765/health",
    });
  });

  it("rejects non-WebSocket URLs", () => {
    expect(() => signalingEndpoints("https://example.com")).toThrow(
      "Omni signalling URL must use ws: or wss:",
    );
  });
});
