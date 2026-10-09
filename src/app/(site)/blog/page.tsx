import type { Metadata } from "next";
import { StubPage } from "@/components/ui/StubPage";

export const metadata: Metadata = {
  title: "Blog",
  description: "Application notes on backend systems, security, small models and games.",
  alternates: { canonical: "/blog" },
};

// Owner: src/features/blog (git posts + DB notes, one Markdown pipeline). Spec: docs/application.md §9
export default function BlogPage() {
  return (
    <StubPage page={5} label="Application notes" kicker="Section 10" title="Application notes">
      Notes on backend systems, security, small models and games, newest first.
    </StubPage>
  );
}
