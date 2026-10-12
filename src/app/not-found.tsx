import { SiteFooter } from "@/components/layout/SiteFooter";
import { blogNoteRows } from "@/features/blog/server/catalog";
import SiteNotFound from "./(site)/not-found";

/** Unknown URLs: outside the (site) layout, so this adds the <main> and footer itself. */
export default async function NotFound() {
  return (
    <>
      <main id="main" className="wrap" tabIndex={-1}>
        <SiteNotFound />
      </main>
      <SiteFooter notes={await blogNoteRows()} />
    </>
  );
}
