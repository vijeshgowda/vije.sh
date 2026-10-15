import { Section } from "@/components/ui/Datasheet";
import { formatBytes } from "../format";
import type { AdminStats as Stats } from "../queries";
import styles from "./Admin.module.css";

const n = (v: number) => v.toLocaleString("en-GB");

/** The /admin overview: KPI grids and threads per category. Data is read fresh on every visit. */
export function AdminStats({ stats }: { stats: Stats }) {
  const people = [
    { label: "Members", value: n(stats.members) },
    { label: "Onboarded", value: n(stats.onboarded) },
    { label: "New, 7 days", value: n(stats.new7d) },
    { label: "New, 30 days", value: n(stats.new30d) },
    { label: "Active bans", value: n(stats.activeBans), alert: stats.activeBans > 0 },
  ];
  const content = [
    { label: "Threads", value: n(stats.threads) },
    { label: "Replies", value: n(stats.replies) },
    { label: "Open reports", value: n(stats.openReports), alert: stats.openReports > 0 },
    {
      label: "Notes",
      value: n(stats.notes.git + stats.notes.db),
      sub: `${n(stats.notes.git)} git · ${n(stats.notes.db)} db`,
    },
    { label: "Database", value: formatBytes(stats.databaseBytes) },
  ];
  return (
    <>
      <Section id="people" no="1" title="People">
        <Kpis items={people} />
      </Section>
      <Section id="content" no="2" title="Content" note="Database limit 500 MB on the free tier">
        <Kpis items={content} />
      </Section>
      <Section id="categories" no="3" title="Threads per category">
        <div className={styles.tw}>
          <table className={styles.tbl}>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Threads</th>
              </tr>
            </thead>
            <tbody>
              {stats.categories.map((c) => (
                <tr key={c.slug}>
                  <th scope="row">{c.name}</th>
                  <td className={styles.n}>{n(c.threads)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

function Kpis({
  items,
}: {
  items: { label: string; value: string; sub?: string; alert?: boolean }[];
}) {
  return (
    <ul className={styles.kpis}>
      {items.map((k) => (
        <li key={k.label} className={k.alert ? styles.alert : undefined}>
          <b>{k.value}</b>
          {k.label}
          {k.sub && <span className={styles.sub}>{k.sub}</span>}
        </li>
      ))}
    </ul>
  );
}
