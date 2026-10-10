import { Suspense } from "react";
import { BackToTop } from "@/components/layout/BackToTop";
import { NetStatus } from "@/components/layout/NetStatus";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { Toaster } from "@/components/layout/Toaster";
import styles from "./layout.module.css";

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
      <SiteFooter />
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
