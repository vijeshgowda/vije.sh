import { describe, expect, it } from "vitest";
import { assertAuthModeSafe, env, EnvError, hasEnv, isLocalDatabase } from "./env";

describe("env()", () => {
  it("applies defaults", () => {
    expect(env("site", {}).NEXT_PUBLIC_SITE_URL).toBe("https://vije.sh");
  });

  it("treats empty strings as missing", () => {
    expect(() => env("cron", { CRON_SECRET: "" })).toThrow(EnvError);
  });

  it("names every missing variable", () => {
    expect(() => env("supabase", {})).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL.*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });

  it("requires a CA certificate for remote databases", () => {
    expect(() =>
      env("database", { DATABASE_URL: "postgresql://u:p@db.example.com:6543/postgres" }),
    ).toThrow(/DATABASE_CA_CERT/);
  });

  it("allows a local database without TLS", () => {
    expect(
      env("database", { DATABASE_URL: "postgres://u:p@localhost:5432/x" }).DATABASE_CA_CERT,
    ).toBeUndefined();
  });

  it("restores newlines in the CA certificate", () => {
    const e = env("database", {
      DATABASE_URL: "postgres://u@db.example.com/x",
      DATABASE_CA_CERT: "a\\nb",
    });
    expect(e.DATABASE_CA_CERT).toBe("a\nb");
  });

  it("rejects non-postgres URLs and non-http site URLs", () => {
    expect(hasEnv("database", { DATABASE_URL: "mysql://localhost/x" })).toBe(false);
    expect(hasEnv("site", { NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" })).toBe(false);
  });

  it("caches values read from process.env", () => {
    process.env.CRON_SECRET = "0123456789abcdef";
    expect(env("cron").CRON_SECRET).toBe("0123456789abcdef");
    process.env.CRON_SECRET = "changed-but-cached";
    expect(env("cron").CRON_SECRET).toBe("0123456789abcdef");
    delete process.env.CRON_SECRET;
  });
});

describe("isLocalDatabase()", () => {
  it("accepts only localhost and 127.0.0.1", () => {
    expect(isLocalDatabase("postgres://localhost/x")).toBe(true);
    expect(isLocalDatabase("postgres://127.0.0.1/x")).toBe(true);
    expect(isLocalDatabase("postgres://db.local/x")).toBe(false);
    expect(isLocalDatabase("not a url")).toBe(false);
  });
});

describe("assertAuthModeSafe()", () => {
  it("refuses the test sign-in mode on Vercel", () => {
    expect(() => assertAuthModeSafe({ AUTH_MODE: "test", VERCEL: "1" })).toThrow(EnvError);
  });
  it("allows it locally and allows normal mode on Vercel", () => {
    expect(() => assertAuthModeSafe({ AUTH_MODE: "test" })).not.toThrow();
    expect(() => assertAuthModeSafe({ VERCEL: "1" })).not.toThrow();
  });
});
