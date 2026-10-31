import type { NextConfig } from "next";
import { env } from "./src/lib/env";
import { headerRoutes } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Pages that list or render git posts can re-render at runtime; ship the posts and their images.
  outputFileTracingIncludes: {
    "/": ["./content/blog/*/index.{md,mdx}"],
    "/blog": ["./content/blog/*/index.{md,mdx}"],
    "/blog/[slug]": ["./content/blog/**/*"],
  },
  turbopack: {
    rules: {
      // Tailwind for global CSS only; `as: "*.css"` would turn CSS Modules into plain CSS.
      "*.css": {
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      ...headerRoutes(
        process.env.NODE_ENV !== "production",
        env("omni").NEXT_PUBLIC_OMNI_SIGNALING_URL,
      ),
      // public/ files default to max-age=0; the coastlines change only with a deploy and an old
      // copy is harmless
      {
        source: "/data/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=2592000",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
