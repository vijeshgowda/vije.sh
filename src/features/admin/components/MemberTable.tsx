import Link from "next/link";
import Form from "next/form";
import { Button } from "@/components/ui/Button";
import { ROLE_LABEL } from "@/lib/authz";
import { isoDate } from "../format";
import { memberHref, membersHref } from "../members";
import type { MemberPage, MemberRole } from "../queries";
import styles from "./Admin.module.css";

/** Role pills: "Owner", "Superuser", "Moderator" or "Moderator · Engineering". */
export function RolePills({ roles }: { roles: readonly MemberRole[] }) {
  if (roles.length === 0) return <span className={styles.pill}>Member</span>;
  return (
    <span className={styles.pills}>
      {roles.map((r) => (
        <span
          key={`${r.role}:${r.categoryId}`}
          className={`${styles.pill} ${styles[`r-${r.role}`]}`}
        >
          {roleLabel(r)}
        </span>
      ))}
    </span>
  );
}

export const roleLabel = (r: Pick<MemberRole, "role" | "categoryName">) =>
  r.categoryName ? `${ROLE_LABEL[r.role]} · ${r.categoryName}` : ROLE_LABEL[r.role];

/** Search by handle or display name (a GET form, so results have a URL). */
export function MemberSearch({ q }: { q: string }) {
  return (
    <Form action="/admin/members" className={styles.search} role="search">
      <div className={styles.field}>
        <label className={styles.label} htmlFor="member-q">
          Handle or display name
        </label>
        <input
          id="member-q"
          name="q"
          type="search"
          className={styles.input}
          defaultValue={q}
          maxLength={60}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <Button type="submit">Search</Button>
    </Form>
  );
}

/** One page of members with their roles, join date and ban state. */
export function MemberTable({ result, q }: { result: MemberPage; q: string }) {
  const { members, total, page, pages } = result;
  if (members.length === 0) {
    return (
      <p className={styles.locked} role="status">
        {total === 0 && q ? `No members match \u201c${q}\u201d.` : "No members on this page."}
      </p>
    );
  }
  return (
    <>
      {/* wide tables scroll sideways on small screens, so the wrapper takes keyboard focus */}
      <div className={styles.tw} tabIndex={0} role="region" aria-label="Members table">
        <table className={`${styles.tbl} ${styles.wide}`}>
          <caption>
            {total === 1 ? "1 member" : `${total.toLocaleString("en-GB")} members`}
            {q ? ` matching \u201c${q}\u201d` : ""}, newest first
          </caption>
          <thead>
            <tr>
              <th scope="col">Handle</th>
              <th scope="col">Display name</th>
              <th scope="col">Roles</th>
              <th scope="col">Joined</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr key={m.handle ?? `pending-${i}`}>
                <td>
                  {m.handle ? <Link href={memberHref(m.handle)}>@{m.handle}</Link> : "(no handle)"}
                </td>
                <td>{m.displayName ?? "\u2014"}</td>
                <td>
                  <RolePills roles={m.roles} />
                </td>
                <td className={styles.n}>
                  <time dateTime={m.joinedAt.toISOString()}>{isoDate(m.joinedAt)}</time>
                </td>
                <td>
                  <MemberStatus banned={m.banned} onboarded={m.onboarded} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && <Pager q={q} page={page} pages={pages} />}
    </>
  );
}

export function MemberStatus({ banned, onboarded }: { banned: boolean; onboarded: boolean }) {
  if (banned) return <span className={`${styles.pill} ${styles.banned}`}>Banned</span>;
  if (!onboarded) return <span className={styles.pill}>Not onboarded</span>;
  return <span className={styles.pill}>Active</span>;
}

function Pager({ q, page, pages }: { q: string; page: number; pages: number }) {
  return (
    <nav className={styles.pager} aria-label="Member pages">
      <span>
        Page {page} of {pages}
      </span>
      <ul>
        {page > 1 && (
          <li>
            <Link href={membersHref(q, page - 1)} rel="prev">
              Previous
            </Link>
          </li>
        )}
        {page < pages && (
          <li>
            <Link href={membersHref(q, page + 1)} rel="next">
              Next
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
