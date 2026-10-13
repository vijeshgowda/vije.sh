import { Suspense } from "react";
import { BackToTop } from "@/components/layout/BackToTop";
import { NetStatus } from "@/components/layout/NetStatus";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Toaster } from "@/components/layout/Toaster";
import { blogNoteRows } from "@/features/blog/server/catalog";
import styles from "./layout.module.css";

/** The palette in the footer lists database notes too (cached, tag `notes`). */
async function Footer() {
  return <SiteFooter notes={await blogNoteRows()} />;
}

export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a className={styles.skip} href="#main">
        Skip to content
      </a>
      {/* SiteHeader reads the pathname, which may suspend on routes with runtime params */}
      <Suspense fallback={<div className={styles.headerSlot} />}>
        <SiteHeader />
      </Suspense>
      <main id="main" className="wrap" tabIndex={-1}>
        {children}
      </main>
      <Footer />
      <BackToTop />
      <Toaster />
      <NetStatus />
      {/* referenced by aria-describedby on every external link */}
      <span id="newtab" hidden>
        Opens in a new tab
      </span>
    </>
  );
}
