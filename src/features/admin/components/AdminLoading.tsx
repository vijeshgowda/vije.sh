import styles from "./Admin.module.css";

/** Suspense fallback for /admin data, which is read on every visit. */
export function AdminLoading() {
  return (
    <p className={styles.skeleton} role="status">
      Loading&hellip;
    </p>
  );
}
