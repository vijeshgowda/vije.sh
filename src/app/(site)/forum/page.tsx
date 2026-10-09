import type { Metadata } from "next";
import { StubPage } from "@/components/ui/StubPage";

export const metadata: Metadata = {
  title: "Forum",
  description: "The community bus: systems, small models and games.",
  alternates: { canonical: "/forum" },
};

// Owner: src/features/forum (categories, threads, replies). Spec: docs/application.md, docs/database.md
export default function ForumPage() {
  return (
    <StubPage page={6} label="Forum" kicker="Section 11" title="The bus">
      A place to talk about systems, small models and games. Opens after sign-in lands.
    </StubPage>
  );
}
