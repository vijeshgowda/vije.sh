import type { Metadata } from "next";
import { Suspense } from "react";
import { PageIntro, RunHead, Section } from "@/components/ui/Datasheet";
import { WelcomeForm } from "@/features/auth/components/WelcomeForm";

export const metadata: Metadata = {
  title: "Welcome",
  description: "Pick a handle to join the vije.sh forum.",
  robots: { index: false },
};

// Has its own CSP that allows Cloudflare Turnstile (src/lib/security-headers.ts).
export default function WelcomePage() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  return (
    <>
      <RunHead label="Welcome" />
      <PageIntro kicker="Access control" title="Welcome">
        One step left: pick the handle people will see on your posts.
      </PageIntro>
      <Section id="handle-setup" no="A.2" title="Your handle">
        {siteKey ? (
          <Suspense fallback={null}>
            <WelcomeForm siteKey={siteKey} />
          </Suspense>
        ) : (
          <p>Sign-up isn&apos;t configured on this deployment yet.</p>
        )}
      </Section>
    </>
  );
}
