import { describe, expect, it } from "vitest";
import { clientIp, isSameOrigin, requestHostname, requestOrigin } from "./request";

const h = (init: Record<string, string>) => new Headers(init);

describe("request helpers", () => {
  it("uses the Origin header, else the forwarded or plain host", () => {
    expect(requestOrigin(h({ origin: "https://pr-1.vercel.app", host: "x" }))).toBe(
      "https://pr-1.vercel.app",
    );
    expect(requestOrigin(h({ origin: "null", "x-forwarded-host": "vije.sh" }))).toBe(
      "https://vije.sh",
    );
    expect(requestOrigin(h({ host: "localhost:3000", "x-forwarded-proto": "http" }))).toBe(
      "http://localhost:3000",
    );
    expect(requestOrigin(h({}))).toBe("https://");
  });

  it("strips the port from the hostname", () => {
    expect(requestHostname(h({ host: "localhost:3000" }))).toBe("localhost");
    expect(requestHostname(h({ "x-forwarded-host": "vije.sh", host: "internal" }))).toBe("vije.sh");
  });

  it("finds the client IP", () => {
    expect(clientIp(h({ "x-real-ip": "1.1.1.1", "x-forwarded-for": "2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientIp(h({ "x-forwarded-for": " 2.2.2.2, 3.3.3.3" }))).toBe("2.2.2.2");
    expect(clientIp(h({}))).toBeNull();
  });

  it("checks that a POST came from this host", () => {
    expect(isSameOrigin(h({ origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
    expect(isSameOrigin(h({ origin: "https://evil.example", host: "vije.sh" }))).toBe(false);
    expect(isSameOrigin(h({ host: "vije.sh" }))).toBe(false);
    expect(isSameOrigin(h({ origin: "null", host: "vije.sh" }))).toBe(false);
  });
});
