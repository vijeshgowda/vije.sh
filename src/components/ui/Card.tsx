import type { ComponentProps, ReactNode } from "react";
import styles from "./Card.module.css";

/** Raised datasheet card: code (red) and meta in a mono header, then a title and content. */
export function Card({
  code,
  meta,
  title,
  titleId,
  lift = true,
  className = "",
  children,
  ...rest
}: Omit<ComponentProps<"article">, "title"> & {
  code: ReactNode;
  meta?: ReactNode;
  title?: ReactNode;
  titleId?: string;
  lift?: boolean;
}) {
  return (
    <article
      className={`${styles.card} ${lift ? styles.lift : ""} ${className}`}
      data-spotlight
      {...rest}
    >
      <header className={styles.head}>
        <span>{code}</span>
        {meta !== undefined && <span>{meta}</span>}
      </header>
      {title !== undefined && (
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
      )}
      {children}
    </article>
  );
}
