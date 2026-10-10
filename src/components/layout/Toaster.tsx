"use client";

import { useToast } from "./toast";
import styles from "./Toaster.module.css";

export function Toaster() {
  const { text, on } = useToast();
  return (
    <p className={styles.toast} data-on={on || undefined} role="status" aria-live="polite">
      {text}
    </p>
  );
}
