import { Card } from "@/components/ui/Card";
import styles from "./LabCard.module.css";

/**
 * Omni's entry on /lab. A plain <a>, not <Link>: /lab/omni has its own Permissions-Policy and CSP,
 * which only apply on a full document load.
 */
export function LabCard() {
  return (
    <section className={styles.slot} aria-label="Real-time communications">
      <a
        className={styles.link}
        href="/lab/omni"
        aria-labelledby="omni-lab-card-title"
        data-testid="omni-card"
      >
        <Card
          className={styles.card}
          code="RTC"
          meta="BROWSER TO BROWSER"
          title="Omni"
          titleId="omni-lab-card-title"
        >
          <p>Encrypted 1-on-1 calls, chat and file transfer. No account required.</p>
          <span className={styles.action}>
            Open Omni <span aria-hidden="true">&rarr;</span>
          </span>
        </Card>
      </a>
    </section>
  );
}
