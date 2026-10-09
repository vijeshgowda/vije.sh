import Link from "next/link";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { PageIntro, RunHead } from "@/components/ui/Datasheet";

export default function NotFound() {
  return (
    <>
      <main id="main" className="wrap" tabIndex={-1}>
        <RunHead label="Fault" />
        <PageIntro kicker="Error 0x404" title="Bus fault">
          No device answered at this address. Try the <Link href="/">overview</Link>.
        </PageIntro>
      </main>
      <SiteFooter />
    </>
  );
}
