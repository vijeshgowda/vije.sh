import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
let releaseConnection: () => void = () => {};
vi.mock("next/headers", () => ({
  cookies: async () => {
    calls.push("cookies");
    return { getAll: () => [], set: vi.fn() };
  },
}));
vi.mock("next/server", () => ({
  connection: () => {
    calls.push("connection");
    return new Promise<void>((resolve) => {
      releaseConnection = resolve;
    });
  },
}));
const createServerClient = vi.fn((..._args: unknown[]) => {
  calls.push("createServerClient");
  return { auth: {} };
});
vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClient(...args),
}));

vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
const { createSupabaseServerClient } = await import("./server");

beforeEach(() => {
  calls.length = 0;
  createServerClient.mockClear();
});

describe("createSupabaseServerClient()", () => {
  // the client calls Date.now() while loading the session, which partial prefetching rejects
  // before the dynamic stage (Refs #56)
  it("waits for connection() before constructing the client", async () => {
    const pending = createSupabaseServerClient();
    await vi.waitFor(() => expect(calls).toEqual(["cookies", "connection"]));
    expect(createServerClient).not.toHaveBeenCalled();

    releaseConnection();
    await pending;
    expect(calls).toEqual(["cookies", "connection", "createServerClient"]);
    expect(createServerClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "sb_publishable_test",
      expect.objectContaining({ cookies: expect.any(Object) }),
    );
  });
});
