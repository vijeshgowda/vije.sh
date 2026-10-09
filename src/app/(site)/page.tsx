import { Suspense } from "react";
import Link from "next/link";
import { RunFoot, RunHead, Section } from "@/components/ui/Datasheet";
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
        <p
          style={{
            maxWidth: "40rem",
            color: "var(--mute)",
            margin: "0 0 1.25rem",
            fontSize: "1.05rem",
          }}
        >
          Software engineer by title, sysadmin by habit. This cluster heals itself: click a pod to
          kill it, drain a node or scale the deployment, and watch it reconcile.
        </p>
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
      {/* 5 Latest application notes: added by the blog feature */}
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
