import type { Metadata } from "next";
import { PageIntro, RunFoot, RunHead, Section } from "@/components/ui/Datasheet";
import { work } from "@/content/profile";
import { CareerTiming } from "@/features/work/components/CareerTiming";
import { Kpis, Rack } from "@/features/work/components/Rack";
import { careerNow } from "@/features/work/server/now";
import { yearFraction } from "@/features/work/timing";

export const metadata: Metadata = {
  title: "Work",
  description: "Deployments, the rack and career timing.",
  alternates: { canonical: "/work" },
};

export default async function WorkPage() {
  const nowYear = yearFraction(await careerNow());
  return (
    <>
      <RunHead label="Work" />
      <PageIntro kicker={"Section 6 \u2013 7"} title="Deployments">
        Systems I have built and run. Every unit in the rack is a project: pull one out to read its
        spec.
      </PageIntro>
      <Kpis />
      <Section id="rack" no={6} title="Rack A" note={`${work.length}U populated`}>
        <Rack />
      </Section>
      <Section
        id="timing"
        no={7}
        title="Timing characteristics"
        note={<>t in years &middot; hover a row</>}
      >
        <CareerTiming nowYear={nowYear} />
      </Section>
      <RunFoot page={2} />
    </>
  );
}
