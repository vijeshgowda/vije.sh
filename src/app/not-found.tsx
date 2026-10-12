import { SiteFooter } from "@/components/layout/SiteFooter";
import SiteNotFound from "./(site)/not-found";

/** Unknown URLs: outside the (site) layout, so this adds the <main> and footer itself. */
export default function NotFound() {
  return (
    <>
      <main id="main" className="wrap" tabIndex={-1}>
        <SiteNotFound />
      </main>
      <SiteFooter />
    </>
  );
}
