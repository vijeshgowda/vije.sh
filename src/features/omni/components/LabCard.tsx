import { Card } from "@/components/ui/Card";
import { LabWarmup } from "./LabWarmup";
import styles from "./LabCard.module.css";

export function LabCard({ healthUrl }: { healthUrl: string }) {
  return (
    <LabWarmup healthUrl={healthUrl}>
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
    </LabWarmup>
  );
}
