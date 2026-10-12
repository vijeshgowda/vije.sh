import type { MetadataRoute } from "next";
import { PAGES, SITE } from "@/config/site";
import { blogNoteRows } from "@/features/blog/server/catalog";

// Forum threads add their own entries when that feature lands.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    ...PAGES.map((p) => ({
      url: new URL(p.href, SITE.url).href,
      changeFrequency: "weekly" as const,
    })),
    { url: new URL("/guidelines", SITE.url).href, changeFrequency: "monthly" as const },
    ...(await blogNoteRows()).map((n) => ({
      url: new URL(`/blog/${n.slug}`, SITE.url).href,
      lastModified: n.date,
    })),
  ];
}
