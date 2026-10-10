import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { PAGES, SITE } from "@/config/site";
import styles from "./Datasheet.module.css";

/** Datasheet page furniture shared by every page: running header/footer, page intro, sections. */

export function RunHead({ label }: { label: string }) {
  return (
    <div className={styles.runhead}>
      <span>{SITE.title}</span>
      <span>
        {label} &middot; {SITE.rev}
      </span>
    </div>
  );
}

export function RunFoot({ page }: { page: number }) {
  return (
    <div className={styles.runfoot}>
      <span>
        {SITE.name} &middot; {SITE.part} datasheet
      </span>
      <span>
        Page {page} of {PAGES.length}
      </span>
    </div>
  );
}

export function PageIntro({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <section className={styles.intro}>
      <p className={styles.pn}>{kicker}</p>
      <h1 className={styles.ph} tabIndex={-1}>
        {title}
      </h1>
      {children && <div className={styles.lede}>{children}</div>}
    </section>
  );
}

export function Lede({ children }: { children: ReactNode }) {
  return <p className={`${styles.lede} ${styles.ledeGap}`}>{children}</p>;
}

export function Section({
  id,
  no,
  title,
  note,
  children,
}: {
  id: string;
  no: number | string;
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.sec} id={id} aria-labelledby={`${id}-h`}>
      <Reveal self rule className={styles.sh}>
        <h2 id={`${id}-h`}>
          <span className={styles.no}>{no}</span>
          {title}
        </h2>
        {note && <span className={styles.note}>{note}</span>}
      </Reveal>
      {children}
    </section>
  );
}
