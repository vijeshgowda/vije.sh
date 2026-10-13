import { describe, expect, it } from "vitest";
import { containsPattern, escapeLike } from "./search";

describe("escapeLike()", () => {
  it("escapes the LIKE wildcards and the escape character", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("back\\slash")).toBe("back\\\\slash");
    expect(escapeLike("%_\\")).toBe("\\%\\_\\\\");
  });

  it("leaves everything else alone", () => {
    expect(escapeLike("Nora O'Neil [x] *")).toBe("Nora O'Neil [x] *");
  });
});

describe("containsPattern()", () => {
  it("wraps the escaped text in % for a contains match", () => {
    expect(containsPattern(" nora ")).toBe("%nora%");
    expect(containsPattern("50%_off")).toBe("%50\\%\\_off%");
  });

  it("matches everyone for an empty search", () => {
    expect(containsPattern("")).toBeNull();
    expect(containsPattern("   ")).toBeNull();
  });
});
