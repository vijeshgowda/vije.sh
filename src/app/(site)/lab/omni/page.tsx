import type { Metadata } from "next";
import { PageIntro, RunFoot, RunHead } from "@/components/ui/Datasheet";
import { OmniApp } from "@/features/omni/components/OmniApp";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Omni",
  description: "Encrypted browser-to-browser calls, chat and file transfer.",
  alternates: { canonical: "/lab/omni" },
  manifest: "/omni.webmanifest",
};

export default function OmniPage() {
  return (
    <>
      <RunHead label="Lab · Omni" />
      <PageIntro kicker="LAB · REAL-TIME" title="Omni">
        Encrypted 1-on-1 calls, chat and file transfer, browser to browser. The server only relays
        the handshake. It never sees keys, messages or media.
      </PageIntro>
      <OmniApp signalingUrl={env("omni").NEXT_PUBLIC_OMNI_SIGNALING_URL} />
      <RunFoot page={3} />
    </>
  );
}
