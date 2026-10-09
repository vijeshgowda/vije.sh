import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const shared = {
  resolve: {
    tsconfigPaths: true,
    // "server-only" throws outside React Server Components; tests import server modules directly.
    alias: { "server-only": new URL("./tests/helpers/empty.ts", import.meta.url).pathname },
  },
};

export default defineConfig({
  ...shared,
  plugins: [react()],
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
        },
      },
      {
        ...shared,
        test: {
          name: "component",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["tests/helpers/setup-dom.ts"],
        },
      },
      {
        ...shared,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.int.test.ts", "tests/db/**/*.int.test.ts"],
          fileParallelism: false,
          testTimeout: 20_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/app/**/{page,layout,not-found}.tsx",
        "src/app/{robots,sitemap}.ts",
        "src/**/*.d.ts",
        // canvas, animation and live network UI: covered by Playwright feature tests
        "src/features/live/client/globe.ts",
        "src/features/live/components/**",
        "src/features/overview/components/**",
        "src/features/live/server/fixtures.ts",
        "src/db/types.ts",
        "src/lib/supabase/**",
      ],
      reporter: ["text-summary", "html", "lcov", "json-summary"],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
        // security-critical files (application.md 13.5); the limits only ever go up
        "src/lib/{authz,rate-limit,turnstile,markdown}.ts": { lines: 95, branches: 95 },
        "src/features/*/{limits,schemas,actions}.ts": { lines: 95, branches: 95 },
      },
    },
  },
});
