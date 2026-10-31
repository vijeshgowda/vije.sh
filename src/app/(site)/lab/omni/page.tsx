import type { Metadata } from "next";
import { PageIntro, RunFoot, RunHead } from "@/components/ui/Datasheet";
import styles from "./page.module.css";

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
        Encrypted 1-on-1 calls, chat and file transfer, browser to browser. The signalling server
        relays the handshake; it never sees keys, messages or media.
      </PageIntro>
      <section className={styles.panel} aria-labelledby="omni-status">
        <p className={styles.meta}>RTC · SESSION LAYER</p>
        <h2 id="omni-status">Call setup is being prepared</h2>
        <p>
          The encrypted calling interface is coming online in stages. This page is ready for the
          call client; no camera or microphone is requested until you choose to start a call.
        </p>
      </section>
      <RunFoot page={3} />
    </>
  );
}
