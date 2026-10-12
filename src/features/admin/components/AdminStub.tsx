import type { ReactNode } from "react";
import { PageIntro } from "@/components/ui/Datasheet";
import styles from "@/components/ui/Datasheet.module.css";

/**
 * Placeholder for an /admin section until it is built: replace the section's page.tsx (keeping its
 * `instant = false` and requireAdminSection() call) rather than editing this.
 */
export function AdminStub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <PageIntro kicker="Admin" title={title}>
        {children}
      </PageIntro>
      <section className={styles.sec}>
        <p className={styles.note}>This section of the datasheet is still being typeset.</p>
      </section>
    </>
  );
}
