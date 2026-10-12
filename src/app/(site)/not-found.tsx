import Link from "next/link";
import { PageIntro, RunHead } from "@/components/ui/Datasheet";

/**
 * notFound() from a page or layout under (site) (an unknown post, a staff page) renders here,
 * inside the site layout's <main> and footer. Unknown URLs use app/not-found.tsx, which wraps this.
 */
export default function SiteNotFound() {
  return (
    <>
      <RunHead label="Fault" />
      <PageIntro kicker="Error 0x404" title="Bus fault">
        No device answered at this address. Try the <Link href="/">overview</Link>, or type{" "}
        <kbd>launch</kbd> and let off some steam.
      </PageIntro>
    </>
  );
}
