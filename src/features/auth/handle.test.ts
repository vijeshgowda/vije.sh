import { describe, expect, it } from "vitest";
import { HANDLE_RE, safeNext, suggestHandle } from "./handle";

describe("safeNext()", () => {
  it.each([
    ["/forum", "/forum"],
    ["/blog/x?y=1#z", "/blog/x?y=1#z"],
    ["/a/../b", "/b"],
  ])("keeps the same-site path %s", (raw, want) => {
    expect(safeNext(raw)).toBe(want);
  });

  it.each([
    "https://evil.example/",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
    "/\t/evil.example",
    "javascript:alert(1)",
    "forum",
    "",
    null,
    42,
  ])("rejects %j", (raw) => {
    expect(safeNext(raw)).toBe("/");
    expect(safeNext(raw, "/welcome")).toBe("/welcome");
  });
});

describe("suggestHandle()", () => {
  it.each([
    ["Ada Lovelace", "Ada_Lovelace"],
    ["  José   Núñez ", "Jose_Nunez"],
    ["octo-cat", "octo_cat"],
    ["a".repeat(30), "a".repeat(24)],
    ["x".repeat(23) + " y", "x".repeat(23)],
  ])("%s -> %s", (name, want) => {
    expect(suggestHandle(name)).toBe(want);
    expect(HANDLE_RE.test(want)).toBe(true);
  });

  it("returns nothing it can't make valid", () => {
    expect(suggestHandle("李")).toBe("");
    expect(suggestHandle("ab")).toBe("");
    expect(suggestHandle(null)).toBe("");
    expect(suggestHandle(undefined)).toBe("");
  });
});
