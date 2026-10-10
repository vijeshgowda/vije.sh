import { describe, expect, it } from "vitest";
import { typed, WORD } from "./launch";

describe("typed", () => {
  const type = (keys: string) =>
    [...keys].reduce(
      (acc, k) => {
        const r = typed(acc.buffer, k);
        return { buffer: r.buffer, hits: acc.hits + (r.hit ? 1 : 0) };
      },
      { buffer: "", hits: 0 },
    );

  it("fires once the word has been typed, anywhere in a stream of keys", () => {
    expect(type("xxlaunch").hits).toBe(1);
    expect(type("LAUNCH").hits).toBe(1);
    expect(type("launchlaunch").hits).toBe(2);
  });

  it("keeps only the last few keys and resets after a hit", () => {
    expect(type("abcdefghij").buffer).toHaveLength(WORD.length);
    expect(type("launch").buffer).toBe("");
    expect(type("lunch").hits).toBe(0);
  });
});
