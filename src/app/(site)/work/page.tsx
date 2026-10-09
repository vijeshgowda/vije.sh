import type { Metadata } from "next";
import { StubPage } from "@/components/ui/StubPage";

export const metadata: Metadata = {
  title: "Work",
  description: "Deployments, the rack and career timing.",
  alternates: { canonical: "/work" },
};

// Owner: src/features/work (rack, timing diagram, career KPIs). Spec: docs/design.md
export default function WorkPage() {
  return (
    <StubPage page={2} label="Work" kicker="Section 7" title="Deployments">
      Selected work as a server rack, and a career timing diagram.
    </StubPage>
  );
}
