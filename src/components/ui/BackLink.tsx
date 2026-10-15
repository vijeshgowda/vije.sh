import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import styles from "./BackLink.module.css";

/**
 * "Go up a level" link (forum thread, blog post, admin detail pages). Larger than the prototype's
 * 0.75rem `.back` text on purpose: a 44 px target with clear contrast (WCAG 2.5.8). The arrow is
 * decorative, so the accessible name is just the label.
 */
export function BackLink({
  href,
  className,
  children,
}: {
  href: Route;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={className ? `${styles.back} ${className}` : styles.back}>
      <span className={styles.arrow} aria-hidden="true">
        &larr;
      </span>
      {children}
    </Link>
  );
}
