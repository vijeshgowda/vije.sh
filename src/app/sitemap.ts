import type { MetadataRoute } from "next";
import { PAGES, SITE } from "@/config/site";
import { listedNotes } from "@/features/blog/posts";
import { threadHref } from "@/features/forum/format";
import { databaseReady, listSitemapThreads } from "@/features/forum/queries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // visible forum threads (tags `forum` and every `category:<slug>`); none without a database
  const threads = (await databaseReady()) ? await listSitemapThreads() : [];
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
    ...threads.map((t) => ({
      url: new URL(threadHref(t.categorySlug, t.id), SITE.url).href,
      lastModified: t.lastActivityAt,
    })),
  ];
}
