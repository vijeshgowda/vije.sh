import { describe, expect, it } from "vitest";
import { signTestSession, verifyTestSession } from "./test-session";

const SECRET = "x".repeat(32);
const ID = "6f1c0a52-8d1e-4a43-9c55-0b7a3d9e2f10";

describe("test session cookie", () => {
  it("round-trips a signed user id", () => {
    expect(verifyTestSession(signTestSession(ID, SECRET), SECRET)).toBe(ID);
  });

  it("rejects another secret, a tampered id or signature, and junk", () => {
    const value = signTestSession(ID, SECRET);
    expect(verifyTestSession(value, "y".repeat(32))).toBeNull();
    expect(verifyTestSession(value.replace("6f1c", "7f1c"), SECRET)).toBeNull();
    expect(verifyTestSession(`${value}x`, SECRET)).toBeNull();
    expect(verifyTestSession(undefined, SECRET)).toBeNull();
    expect(verifyTestSession("no-dot", SECRET)).toBeNull();
    expect(verifyTestSession(`not-a-uuid.${value.split(".")[1]}`, SECRET)).toBeNull();
  });
});
