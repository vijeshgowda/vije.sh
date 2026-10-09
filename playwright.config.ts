import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const CI = !!process.env.CI;

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
    // CI builds once in an earlier step and sets E2E_SKIP_BUILD.
    command: `${process.env.E2E_SKIP_BUILD ? "" : "npm run build && "}npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    timeout: 240_000,
    env: { FEEDS_OFFLINE: "1", NEXT_TELEMETRY_DISABLED: "1" },
  },
});
