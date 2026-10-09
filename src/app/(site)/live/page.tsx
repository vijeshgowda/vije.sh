import type { Metadata } from "next";
import { Suspense } from "react";
import { PageIntro, RunFoot, RunHead, Section } from "@/components/ui/Datasheet";
import { FEEDS, SERVER_FEED_KEYS } from "@/features/live/catalog";
import { LiveCatalog } from "@/features/live/components/LiveCatalog";
import { getFeeds } from "@/features/live/server/get-feed";

export const metadata: Metadata = {
  title: "Live feeds",
  description: "Public data feeds: space, Earth, dev and AI, cached so every rate limit holds.",
  alternates: { canonical: "/live" },
};

async function Catalog() {
  const initial = await getFeeds(SERVER_FEED_KEYS);
  return <LiveCatalog initial={initial} />;
}

export default function LivePage() {
  return (
    <>
      <RunHead label="Live feeds" />
      <PageIntro kicker="Section 12" title="Live feeds">
        Real data from free public APIs, cached on the server so one request serves everyone and
        every rate limit holds. Pin any feed to the overview.
      </PageIntro>
      <Section id="catalogue" no={12} title="Feed catalogue" note={`${FEEDS.length} feeds`}>
        <Suspense fallback={<LiveCatalog initial={{}} />}>
          <Catalog />
        </Suspense>
      </Section>
      <RunFoot page={7} />
    </>
  );
}
