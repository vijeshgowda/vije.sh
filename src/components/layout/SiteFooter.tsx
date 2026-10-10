import Link from "next/link";
import { PAGES, SITE } from "@/config/site";
import { listedNotes } from "@/features/blog/posts";
import { Launch } from "@/features/launch/components/Launch";
import { LaunchButton } from "@/features/launch/components/LaunchButton";
import { Palette } from "@/features/palette/components/Palette";
import { PaletteButton } from "@/features/palette/components/PaletteButton";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  const notes = listedNotes().map(({ id, slug, title, category, date }) => ({
    id,
    slug,
    title,
    category,
    date,
  }));
  return (
    <footer className={`wrap ${styles.foot}`}>
      <nav className={styles.fnav} aria-label="All pages">
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href}>
            {p.segment === "live" ? "Live feeds" : p.label}
          </Link>
        ))}
        <PaletteButton variant="footer" />
      </nav>
      <div>
        <b>{SITE.name}</b>{" "}
        <span className={styles.meta}>
          {SITE.part} &middot; {SITE.rev} &middot; built from the bootloader up
        </span>
      </div>
      <div className={styles.row}>
        <span className={`${styles.meta} ${styles.hint}`}>
          or type <kbd>launch</kbd> anywhere
        </span>
        <LaunchButton />
      </div>
      <Launch />
      <Palette notes={notes} />
    </footer>
  );
}
