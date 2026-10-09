import type { ReactNode } from "react";
import { PageIntro, RunFoot, RunHead } from "./Datasheet";
import styles from "./Datasheet.module.css";

/** Placeholder page used until a feature lands. Replace the whole page.tsx when building it. */
export function StubPage({
  page,
  label,
  kicker,
  title,
  children,
}: {
  page: number;
  label: string;
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <RunHead label={label} />
      <PageIntro kicker={kicker} title={title}>
        {children}
      </PageIntro>
      <section className={styles.sec}>
        <p className={styles.note}>
          This section of the datasheet is still being typeset. Check back soon.
        </p>
      </section>
      <RunFoot page={page} />
    </>
  );
}
