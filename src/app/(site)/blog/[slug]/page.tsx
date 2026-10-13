import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RunFoot, RunHead } from "@/components/ui/Datasheet";
import { Post } from "@/features/blog/components/Post";
import { blogStaticSlugs, getBlogEntry } from "@/features/blog/server/catalog";
import { renderNoteBody, renderPostBody } from "@/features/blog/server/render";

// Not a valid slug, so it can never match a post.
const NO_POSTS = "__none__";

// Unknown slugs wait for the full render instead of streaming the fallback shell, so they get a
// real 404. Notes published after the build render on their first visit and are kept until the
// `notes` tag is revalidated.
export const ensureStatic = "navigation";

export async function generateStaticParams() {
  const params = (await blogStaticSlugs()).map((slug) => ({ slug }));
  // Cache Components needs at least one param; the placeholder renders the 404 page.
  return params.length > 0 ? params : [{ slug: NO_POSTS }];
}

export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const found = await getBlogEntry((await params).slug);
  if (!found) return {};
  const { post } = found.entry;
  return {
    title: post.title,
    description: post.summary || undefined,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: "article", publishedTime: post.date, modifiedTime: post.updated },
    robots: post.visibility === "unlisted" || post.draft ? { index: false } : undefined,
  };
}

export default async function PostPage({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const found = await getBlogEntry(slug);
  if (!found) notFound();
  const { entry } = found;
  const body =
    found.source === "git"
      ? await renderPostBody(slug)
      : await renderNoteBody(slug, found.note.bodyMd);
  return (
    <>
      <RunHead label={entry.id ?? "Unlisted note"} />
      <Post entry={entry}>{body}</Post>
      <RunFoot page={5} />
    </>
  );
}
