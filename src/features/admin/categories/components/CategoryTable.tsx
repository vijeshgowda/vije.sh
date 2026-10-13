import type { Route } from "next";
import Link from "next/link";
import type { AdminCategory } from "../queries";
import { CategoryActions } from "./CategoryActions";
import styles from "./Categories.module.css";

/** Every category in forum order (prototype .tw/.tbl), with the owner's controls on each row. */
export function CategoryTable({ categories }: { categories: AdminCategory[] }) {
  return (
    // scrolls sideways on narrow screens, so it must be focusable for keyboard users
    <div className={styles.tw} tabIndex={0} role="region" aria-label="Categories table">
      <table className={styles.tbl}>
        <caption className="sr-only">Forum categories in display order</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Category</th>
            <th scope="col">Threads</th>
            <th scope="col">Posting</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {categories.length === 0 && (
            <tr>
              <td colSpan={5} className={styles.empty}>
                No categories yet. Add the first one below.
              </td>
            </tr>
          )}
          {categories.map((c, i) => {
            const nameId = `category-${c.id}-name`;
            return (
              <tr key={c.id}>
                <td className={styles.n}>{String(i + 1).padStart(2, "0")}</td>
                <td>
                  <span id={nameId} className={styles.name}>
                    {c.name}
                  </span>
                  <br />
                  <Link className={styles.slug} href={`/forum/${c.slug}` as Route}>
                    /forum/{c.slug}
                  </Link>
                  {c.description && <p className={styles.hint}>{c.description}</p>}
                </td>
                <td className={styles.n}>{c.threadCount}</td>
                <td>
                  <span className={styles.pill} data-staff={c.staffOnly || undefined}>
                    {c.staffOnly ? "Staff only" : "Everyone"}
                  </span>
                </td>
                <td>
                  <CategoryActions
                    category={c}
                    nameId={nameId}
                    index={i}
                    first={i === 0}
                    last={i === categories.length - 1}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
