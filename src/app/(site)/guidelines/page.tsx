import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro, RunHead, Section } from "@/components/ui/Datasheet";

export const metadata: Metadata = {
  title: "Community guidelines",
  description: "How to take part in the vije.sh forum.",
  alternates: { canonical: "/guidelines" },
};

// Copy is a first draft for the owner to edit.
export default function GuidelinesPage() {
  return (
    <>
      <RunHead label="Guidelines" />
      <PageIntro kicker="Operating conditions" title="Community guidelines">
        The forum is a small, moderated place to talk about systems, small models and games. These
        rules apply to threads, replies and profiles.
      </PageIntro>
      <Section id="do" no="G.1" title="Do">
        <ul className="list-disc space-y-2 pl-5">
          <li>Be kind and assume good intent. Critique ideas, not people.</li>
          <li>Stay on topic for the category, and search before starting a thread.</li>
          <li>Share what you know: code, numbers and links to sources help everyone.</li>
          <li>Report posts that break these rules instead of replying to them.</li>
        </ul>
      </Section>
      <Section id="dont" no="G.2" title="Don't">
        <ul className="list-disc space-y-2 pl-5">
          <li>Harass, threaten or discriminate against anyone.</li>
          <li>Post spam, advertising, or the same message in several places.</li>
          <li>Share illegal content, malware, or anyone&apos;s private information.</li>
          <li>Impersonate other people or use several accounts to get around a ban.</li>
        </ul>
      </Section>
      <Section id="moderation" no="G.3" title="Moderation">
        <p className="max-w-prose">
          Moderators can hide posts, lock threads and ban accounts that break these rules. New
          accounts have lower posting limits for their first day. Questions about a decision? Use
          the contact details on the{" "}
          <Link className="underline" href="/">
            overview
          </Link>
          .
        </p>
      </Section>
    </>
  );
}
