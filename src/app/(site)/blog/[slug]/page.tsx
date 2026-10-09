import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunFoot, RunHead } from "@/components/ui/Datasheet";
import { Post } from "@/features/blog/components/Post";
import { getPost, publishedPosts } from "@/features/blog/posts";
import { renderPostBody } from "@/features/blog/server/render";

// Not a valid slug, so it can never match a post.
const NO_POSTS = "__none__";

// Unknown slugs wait for the full render instead of streaming the fallback shell, so they get a real 404.
export const ensureStatic = "navigation";

export function generateStaticParams() {
  const params = publishedPosts().map((p) => ({ slug: p.slug }));
  // Cache Components needs at least one param; the placeholder renders the 404 page.
  return params.length > 0 ? params : [{ slug: NO_POSTS }];
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const entry = getPost((await params).slug);
  if (!entry) return {};
  const { post } = entry;
  return {
    title: post.title,
    description: post.summary,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: "article", publishedTime: post.date, modifiedTime: post.updated },
    robots: post.visibility === "unlisted" || post.draft ? { index: false } : undefined,
  };
}

export default async function PostPage({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const entry = getPost(slug);
  if (!entry) notFound();
  return (
    <>
      <RunHead label={entry.id ?? "Unlisted note"} />
      <Post entry={entry}>{await renderPostBody(slug)}</Post>
      <RunFoot page={5} />
    </>
  );
}
