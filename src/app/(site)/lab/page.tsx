import type { Metadata } from "next";
import { PageIntro, RunFoot, RunHead, Section } from "@/components/ui/Datasheet";
import { LabCard } from "@/features/omni/components/LabCard";
import { signalingEndpoints } from "@/features/omni/signaling-url";
import { MemoryLab } from "@/features/lab/components/MemoryLab";
import { env } from "@/lib/env";
import styles from "@/features/lab/components/Lab.module.css";

export const metadata: Metadata = {
  title: "Lab",
  description: "How much memory a model needs, and what I'm testing with small, efficient models.",
  alternates: { canonical: "/lab" },
};

export default function LabPage() {
  const { NEXT_PUBLIC_OMNI_SIGNALING_URL } = env("omni");
  const { healthUrl } = signalingEndpoints(NEXT_PUBLIC_OMNI_SIGNALING_URL);

  return (
    <>
      <RunHead label="Lab" />
      <PageIntro kicker="Section 8" title="Lab">
        How much memory does a model need? Fewer bits per weight, smaller model. Pick a size and a
        bit width.
      </PageIntro>
      <section className={styles.omni} aria-label="Real-time communications">
        <LabCard healthUrl={healthUrl} />
      </section>
      <Section id="sizing" no={8} title="Memory sizing" note="Raw weights only">
        <MemoryLab />
      </Section>
      <RunFoot page={3} />
    </>
  );
}
