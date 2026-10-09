import { Suspense } from "react";
import Link from "next/link";
import { Lede, RunFoot, RunHead, Section } from "@/components/ui/Datasheet";
import { NoteList } from "@/features/blog/components/NoteList";
import { latestNotes } from "@/features/blog/posts";
import { DEFAULT_PINS, FEEDS, isServerFeedKey } from "@/features/live/catalog";
import { PinnedFeeds } from "@/features/live/components/PinnedFeeds";
import { getFeeds } from "@/features/live/server/get-feed";
import { Cluster } from "@/features/overview/components/Cluster";
import { Hero, Ticker } from "@/features/overview/components/Hero";
import { Features, Peripherals, Ratings } from "@/features/overview/components/Sections";

// Prerender the default pins' data; feeds a visitor pins later load from /api/feeds on demand.
const PRERENDERED = DEFAULT_PINS.filter(isServerFeedKey);

async function Telemetry() {
  return <PinnedFeeds initial={await getFeeds(PRERENDERED)} />;
}

export default function OverviewPage() {
  return (
    <>
      <RunHead label="Datasheet" />
      <Hero />
      <Ticker />
      <Section id="features" no={1} title="Features">
        <Features />
      </Section>
      <Section id="cluster" no={2} title="Cluster" note="kubectl get pods -w">
        <Lede>
          Software engineer by title, sysadmin by habit. This cluster heals itself: click a pod to
          kill it, drain a node or scale the deployment, and watch it reconcile.
        </Lede>
        <Cluster />
      </Section>
      <Section
        id="telemetry"
        no={3}
        title="Live telemetry"
        note={<Link href="/live">Pick feeds &middot; all {FEEDS.length} &rarr;</Link>}
      >
        <Suspense fallback={<PinnedFeeds initial={{}} />}>
          <Telemetry />
        </Suspense>
      </Section>
      <Section id="peripherals" no={4} title="Peripherals" note="Outside work">
        <Peripherals />
      </Section>
      <Section
        id="notes"
        no={5}
        title="Latest application notes"
        note={<Link href="/blog">All notes &rarr;</Link>}
      >
        <NoteList notes={latestNotes(3)} />
      </Section>
      <Section
        id="ratings"
        no={6}
        title="Absolute maximum ratings"
        note={
          <>
            T<sub>A</sub> = 25 &deg;C unless noted
          </>
        }
      >
        <Ratings />
      </Section>
      <RunFoot page={1} />
    </>
  );
}
