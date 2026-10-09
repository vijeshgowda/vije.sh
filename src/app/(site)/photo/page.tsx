import type { Metadata } from "next";
import { StubPage } from "@/components/ui/StubPage";

export const metadata: Metadata = {
  title: "Photo",
  description: "Rockets, roads, racks and one dog.",
  alternates: { canonical: "/photo" },
};

// Owner: src/features/photo (gallery, viewfinder). Spec: docs/design.md
export default function PhotoPage() {
  return (
    <StubPage page={4} label="Photo" kicker="Section 9" title="Contact sheet">
      Rockets, roads, racks and one dog.
    </StubPage>
  );
}
