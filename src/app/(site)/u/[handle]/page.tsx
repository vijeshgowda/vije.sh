import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageIntro, RunFoot, RunHead, Section } from "@/components/ui/Datasheet";
import { PostList } from "@/features/profile/components/PostList";
import { ProfileRegs } from "@/features/profile/components/ProfileRegs";
import { parseHandle, profileHref, RECENT_POSTS } from "@/features/profile/format";
import { getProfile } from "@/features/profile/queries";

// Profiles render on first request and are cached (tag profile:<id>); the placeholder is a 404.
export const ensureStatic = "navigation";

export function generateStaticParams() {
  // too short to be a handle
  return [{ handle: "0" }];
}

async function load(raw: string) {
  const handle = parseHandle(raw);
  return handle ? getProfile(handle) : null;
}

export async function generateMetadata({ params }: PageProps<"/u/[handle]">): Promise<Metadata> {
  const profile = await load((await params).handle);
  if (!profile) return {};
  const posts = profile.threadCount + profile.replyCount;
  return {
    title: `${profile.handle} · Forum`,
    description: `${profile.handle} on the vije.sh forum: recent threads and replies.`,
    alternates: { canonical: profileHref(profile.handle) },
    // nothing to read yet: keep empty profiles out of search results
    ...(posts === 0 && { robots: { index: false } }),
  };
}

export default async function ProfilePage({ params }: PageProps<"/u/[handle]">) {
  const { handle } = await params;
  const profile = await load(handle);
  // unknown, not onboarded or deleted
  if (!profile) notFound();
  // handles are case-insensitive: send other casings to the stored one
  if (profile.handle !== handle) redirect(profileHref(profile.handle));
  return (
    <>
      <RunHead label="Member profile" />
      <PageIntro kicker="Section 11 · Forum · Member" title={profile.handle}>
        Threads and replies on the community bus, newest first.
      </PageIntro>
      <ProfileRegs profile={profile} />
      <Section
        id="posts"
        no={11}
        title="Recent posts"
        note={profile.posts.length === RECENT_POSTS ? `Latest ${RECENT_POSTS}` : undefined}
      >
        <PostList posts={profile.posts} />
      </Section>
      <RunFoot page={6} />
    </>
  );
}
