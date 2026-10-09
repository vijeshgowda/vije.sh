import type { Metadata } from "next";
import { PageIntro, RunFoot, RunHead, Section } from "@/components/ui/Datasheet";
import { MemoryLab } from "@/features/lab/components/MemoryLab";

export const metadata: Metadata = {
  title: "Lab",
  description: "How much memory a model needs, and what I'm testing with small, efficient models.",
  alternates: { canonical: "/lab" },
};

export default function LabPage() {
  return (
    <>
      <RunHead label="Lab" />
      <PageIntro kicker="Section 8" title="Lab">
        How much memory does a model need? Fewer bits per weight, smaller model. Pick a size and a
        bit width.
      </PageIntro>
      <Section id="sizing" no={8} title="Memory sizing" note="Raw weights only">
        <MemoryLab />
      </Section>
      <RunFoot page={3} />
    </>
  );
}
