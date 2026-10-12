import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { RunFoot, RunHead } from "@/components/ui/Datasheet";
import { FrameList } from "@/features/forum/components/FrameList";
import { ThreadIntro } from "@/features/forum/components/ThreadIntro";
import { parseThreadId, threadHref } from "@/features/forum/format";
import { getThread } from "@/features/forum/queries";
import { renderFrameBody } from "@/features/forum/server/render";

// Threads render on first request and are cached (tag thread:<id>); the placeholder is a 404.
export const ensureStatic = "navigation";

export function generateStaticParams() {
  return [{ category: "__none__", thread: "0" }];
}

async function load(raw: string) {
  const id = parseThreadId(raw);
  return id ? getThread(id) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/forum/[category]/[thread]">): Promise<Metadata> {
  const thread = await load((await params).thread);
  if (!thread) return {};
  return {
    title: thread.title,
    description: `A thread in ${thread.category.name} on the vije.sh forum.`,
    alternates: { canonical: threadHref(thread.category.slug, thread.id) },
  };
}

export default async function ThreadPage({ params }: PageProps<"/forum/[category]/[thread]">) {
  const { category, thread: raw } = await params;
  const thread = await load(raw);
  // missing, hidden, or in a staff-only category
  if (!thread) notFound();
  // wrong or old category (moved thread): send to the canonical URL; not permanent, it can move again
  if (thread.category.slug !== category) {
    redirect(threadHref(thread.category.slug, thread.id));
  }
  const frames = await Promise.all(
    thread.frames.map(async (f) => ({
      ...f,
      body: f.bodyMd === null ? null : await renderFrameBody(f.bodyMd, f.key),
    })),
  );
  return (
    <>
      <RunHead label="Community bus" />
      <ThreadIntro thread={thread} />
      <FrameList frames={frames} />
      <RunFoot page={6} />
    </>
  );
}
