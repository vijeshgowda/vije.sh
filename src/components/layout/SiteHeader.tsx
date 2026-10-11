"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PAGES, SITE, pageBySegment } from "@/config/site";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { PaletteButton } from "@/features/palette/components/PaletteButton";
import { UserMenu } from "@/features/auth/components/UserMenu";
import styles from "./SiteHeader.module.css";

type Fit = "full" | "dense" | "compact";

/**
 * Sticky header that measures itself: full labels, then tighter spacing ("dense"), then a labelled
 * menu button ("compact") when the links would overflow. No breakpoints, so it works at any width,
 * zoom level or font.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const segment = pathname.split("/")[1] ?? "";
  const current = pageBySegment(segment);

  const [fit, setFit] = useState<Fit>("full");
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const headerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLUListElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  const measure = useCallback(() => {
    const header = headerRef.current;
    const nav = navRef.current;
    if (!header || !nav) return;
    const over = () => nav.scrollWidth > nav.clientWidth + 1;
    header.dataset.fit = "full";
    let next: Fit = "full";
    if (over()) {
      header.dataset.fit = next = "dense";
      if (over()) next = "compact";
    }
    header.dataset.fit = next;
    setFit(next);
    if (next !== "compact") setOpen(false);
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (headerRef.current) ro.observe(headerRef.current);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, [measure]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <header
      ref={headerRef}
      className={styles.top}
      data-fit={fit}
      data-scrolled={scrolled || undefined}
    >
      <div className={`wrap ${styles.in}`}>
        <Link className={styles.brand} href="/" aria-label={`${SITE.name}, overview`}>
          <span className={styles.led} aria-hidden="true" />
          {SITE.name}
          <small>{SITE.part}</small>
        </Link>
        <nav
          aria-label="Main"
          id="site-nav"
          className={styles.navWrap}
          data-open={open || undefined}
        >
          <ul ref={navRef} className={styles.nav}>
            {PAGES.map((p, n) => (
              <li key={p.href} style={{ "--n": n } as React.CSSProperties}>
                <Link href={p.href} aria-current={p === current ? "page" : undefined}>
                  <i>{p.code}</i>
                  {p.label}
                  <span className={styles.nd}>{p.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <PaletteButton variant="header" className={styles.jump} />
        <ThemeToggle />
        <UserMenu />
        <button
          ref={menuRef}
          type="button"
          className={styles.menuBtn}
          aria-expanded={open}
          aria-controls="site-nav"
          aria-label={`Menu, current page: ${current?.label ?? "none"}`}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={styles.mi} aria-hidden="true">
            <span />
            <span />
          </span>
          <b>
            {current && <i>{current.code}</i>}
            {current?.label ?? "Menu"}
          </b>
        </button>
      </div>
    </header>
  );
}
