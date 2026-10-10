import type { Metadata } from "next";
import { Suspense } from "react";
import { PageIntro, RunHead, Section } from "@/components/ui/Datasheet";
import { LoginButtons, LoginForm } from "@/features/auth/components/LoginButtons";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to vije.sh with GitHub, Google or Microsoft.",
  robots: { index: false },
};

export default function LoginPage() {
  return (
    <>
      <RunHead label="Sign in" />
      <PageIntro kicker="Access control" title="Sign in">
        No passwords here: pick an account you already have. The first time, you&apos;ll choose a
        handle for the forum.
      </PageIntro>
      <Section id="providers" no="A.1" title="Continue with">
        <Suspense fallback={<LoginForm next="" />}>
          <LoginButtons />
        </Suspense>
      </Section>
    </>
  );
}
