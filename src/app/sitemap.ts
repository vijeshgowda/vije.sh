import type { MetadataRoute } from "next";
import { PAGES, SITE } from "@/config/site";

// Blog posts and forum threads add their own entries when those features land.
export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((p) => ({ url: new URL(p.href, SITE.url).href, changeFrequency: "weekly" }));
}
