import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

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
    return [{ source: "/:path*", headers: securityHeaders(process.env.NODE_ENV !== "production") }];
  },
};

export default nextConfig;
