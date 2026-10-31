import { describe, expect, it, vi } from "vitest";
import { processFileQueue } from "./filequeue";

describe("current original concurrent file queue", () => {
  it("starts all files without waiting for the first and preserves result order", async () => {
    const files = ["a", "b", "c"],
      sent: string[] = [];
    let finishFirst = () => {};
    const first = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const onResult = vi.fn();
    const pending = processFileQueue(
      files,
      async (file) => {
        sent.push(file);
        if (file === "a") await first;
      },
      onResult,
    );
    expect(sent).toEqual(["a", "b", "c"]);
    expect(files).toEqual([]);
    finishFirst();
    expect((await pending).map((result) => result.file)).toEqual(["a", "b", "c"]);
    expect(onResult).toHaveBeenCalledTimes(3);
  });
  it("reports failed files explicitly without aborting the remaining transfers", async () => {
    const onResult = vi.fn(),
      error = new Error("Channel closed");
    const results = await processFileQueue(
      ["a", "fail", "c"],
      async (file) => {
        if (file === "fail") throw error;
      },
      onResult,
    );
    expect(results.map((result) => result.status)).toEqual(["sent", "failed", "sent"]);
    expect(onResult).toHaveBeenCalledWith({ file: "fail", status: "failed", error });
  });
  it("handles an empty queue and all-failed queue", async () => {
    const onResult = vi.fn();
    expect(await processFileQueue([], async () => {}, onResult)).toEqual([]);
    const results = await processFileQueue(
      ["a", "b"],
      async () => {
        throw new Error("Disconnected");
      },
      onResult,
    );
    expect(results.every((result) => result.status === "failed")).toBe(true);
  });
});
