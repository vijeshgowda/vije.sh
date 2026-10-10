import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const CI = !!process.env.CI;

// e2e never reads the dev project from .env.local: everything the server needs for the database,
// auth and Turnstile is passed explicitly below, and set variables win over .env files in Next.js.
if (existsSync(".env.test")) process.loadEnvFile(".env.test");
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
if (
  TEST_DATABASE_URL &&
  !["localhost", "127.0.0.1"].includes(new URL(TEST_DATABASE_URL).hostname)
) {
  throw new Error("TEST_DATABASE_URL must point at localhost (see .env.test.example)");
}
// Test sign-in only works with AUTH_MODE=test against the local test database, so a fixed fallback
// secret is harmless; fixtures read the same value.
process.env.TEST_AUTH_SECRET ||= "e2e-test-auth-secret-not-for-production";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "on-first-retry" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // production build; feeds serve offline results so tests never depend on third-party APIs.
    // CI builds once in an earlier step (with the same variables) and sets E2E_SKIP_BUILD.
    command: `${process.env.E2E_SKIP_BUILD ? "" : "npm run build && "}npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 240_000,
    env: {
      FEEDS_OFFLINE: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: TEST_DATABASE_URL,
      DATABASE_CA_CERT: "",
      AUTH_MODE: "test",
      TEST_AUTH_SECRET: process.env.TEST_AUTH_SECRET,
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      SUPABASE_SECRET_KEY: "",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    },
  },
});
