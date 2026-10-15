import { BackLink } from "@/components/ui/BackLink";
import { PageIntro, Section } from "@/components/ui/Datasheet";
import type { CurrentUser } from "@/lib/authz";
import { isoMinute } from "../format";
import { grantableRoles, lockedReason, mayBan, mayRevoke } from "../members";
import type { CategoryOption, MemberBan, MemberDetail } from "../queries";
import {
  BanForm,
  GrantModeratorForm,
  GrantSuperuserForm,
  LiftBanForm,
  RevokeRoleForm,
} from "./MemberForms";
import { MemberStatus, roleLabel, RolePills } from "./MemberTable";
import styles from "./Admin.module.css";

const Time = ({ at }: { at: Date }) => <time dateTime={at.toISOString()}>{isoMinute(at)}</time>;

/**
 * A member's admin page: facts, roles and bans, with only the controls `viewer` may use
 * (src/features/admin/members.ts). The Server Actions check every change again.
 */
export function MemberProfile({
  member,
  viewer,
  categories,
}: {
  member: MemberDetail;
  viewer: CurrentUser;
  categories: CategoryOption[];
}) {
  const locked = lockedReason(viewer, member);
  const grantable = grantableRoles(viewer, member);
  const canBan = mayBan(viewer, member);
  const activeBan = member.bans.find((b) => b.active);

  return (
    <>
      <PageIntro kicker="Admin · Member" title={`@${member.handle}`}>
        <dl className={styles.facts}>
          <dt>Display name</dt>
          <dd>{member.displayName ?? "\u2014"}</dd>
          <dt>Joined</dt>
          <dd>
            <Time at={member.joinedAt} />
          </dd>
          <dt>Roles</dt>
          <dd>
            <RolePills roles={member.grants} />
          </dd>
          <dt>Status</dt>
          <dd>
            <MemberStatus banned={!!activeBan} onboarded={member.onboarded} />
          </dd>
        </dl>
        {locked && <p className={styles.locked}>{locked}</p>}
        <BackLink href="/admin/members" className="mt-4">
          All members
        </BackLink>
      </PageIntro>

      <Section id="roles" no="1" title="Roles">
        {member.grants.length === 0 ? (
          <p className={styles.hint}>
            No staff roles. Members are everyone onboarded and not banned.
          </p>
        ) : (
          <div className={styles.tw}>
            <table className={styles.tbl}>
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col">Granted</th>
                  <th scope="col">By</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {member.grants.map((g) => (
                  <tr key={`${g.role}:${g.categoryId}`}>
                    <th scope="row">{roleLabel(g)}</th>
                    <td className={styles.n}>
                      <Time at={g.grantedAt} />
                    </td>
                    <td>{g.grantedBy ? `@${g.grantedBy}` : "\u2014"}</td>
                    <td>
                      {g.role !== "admin" && mayRevoke(viewer, member, g.role) && (
                        <RevokeRoleForm
                          handle={member.handle}
                          role={g.role}
                          categoryId={g.categoryId}
                          label={roleLabel(g)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {grantable.includes("moderator") && (
          <GrantModeratorForm handle={member.handle} categories={categories} />
        )}
        {grantable.includes("superuser") && <GrantSuperuserForm handle={member.handle} />}
      </Section>

      <Section id="bans" no="2" title="Ban">
        {activeBan ? (
          <p>
            Banned since <Time at={activeBan.createdAt} />
            {activeBan.expiresAt ? (
              <>
                {" "}
                until <Time at={activeBan.expiresAt} />
              </>
            ) : (
              ", permanently"
            )}
            : {activeBan.reason}
          </p>
        ) : (
          <p className={styles.hint}>Not banned. A ban takes effect on their next request.</p>
        )}
        {canBan &&
          (activeBan ? <LiftBanForm handle={member.handle} /> : <BanForm handle={member.handle} />)}
        {member.bans.length > 0 && <BanHistory bans={member.bans} />}
      </Section>
    </>
  );
}

function BanHistory({ bans }: { bans: MemberBan[] }) {
  return (
    // wide tables scroll sideways on small screens, so the wrapper takes keyboard focus
    <div className={styles.tw} tabIndex={0} role="region" aria-label="Ban history table">
      <table className={`${styles.tbl} ${styles.wide}`}>
        <caption>Ban history, newest first</caption>
        <thead>
          <tr>
            <th scope="col">From</th>
            <th scope="col">Until</th>
            <th scope="col">Lifted</th>
            <th scope="col">By</th>
            <th scope="col">Reason</th>
          </tr>
        </thead>
        <tbody>
          {bans.map((b) => (
            <tr key={b.id}>
              <td className={styles.n}>
                <Time at={b.createdAt} />
              </td>
              <td className={styles.n}>{b.expiresAt ? <Time at={b.expiresAt} /> : "Permanent"}</td>
              <td className={styles.n}>{b.liftedAt ? <Time at={b.liftedAt} /> : "\u2014"}</td>
              <td>{b.bannedBy ? `@${b.bannedBy}` : "\u2014"}</td>
              <td>{b.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
