import { describe, expect, it } from "vitest";
import { hasSessionCookie } from "./session-cookie";

describe("hasSessionCookie()", () => {
  it("spots Supabase (chunked) and test session cookies", () => {
    expect(hasSessionCookie("a=1; sb-abc-auth-token=x")).toBe(true);
    expect(hasSessionCookie("sb-abc-auth-token.0=x")).toBe(true);
    expect(hasSessionCookie("test_session=x")).toBe(true);
    expect(hasSessionCookie("vj:theme=dark; sb-abc-other=x")).toBe(false);
    expect(hasSessionCookie("")).toBe(false);
  });
});
