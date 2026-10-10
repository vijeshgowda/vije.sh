import type { MetadataRoute } from "next";
import { PAGES, SITE } from "@/config/site";
import { listedNotes } from "@/features/blog/posts";

// Forum threads add their own entries when that feature lands.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...PAGES.map((p) => ({
      url: new URL(p.href, SITE.url).href,
      changeFrequency: "weekly" as const,
    })),
    { url: new URL("/guidelines", SITE.url).href, changeFrequency: "monthly" as const },
    ...listedNotes().map((n) => ({
      url: new URL(`/blog/${n.slug}`, SITE.url).href,
      lastModified: n.date,
    })),
  ];
}
