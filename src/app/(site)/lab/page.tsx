import type { Metadata } from "next";
import { StubPage } from "@/components/ui/StubPage";

export const metadata: Metadata = {
  title: "Lab",
  description: "How much memory a model needs, and what I'm testing with small, efficient models.",
  alternates: { canonical: "/lab" },
};

// Owner: src/features/lab (memory calculator, bit register). Spec: docs/design.md
export default function LabPage() {
  return (
    <StubPage page={3} label="Lab" kicker="Section 8" title="Memory lab">
      How much memory a model needs at each bit width.
    </StubPage>
  );
}
