"use client";

import { useMe } from "@/features/forum/client/me";
import { handleKey, meAsUser } from "@/features/forum/client/posting";
import { can, isSuperuser } from "@/lib/authz";
import { ReportButton } from "./ReportButton";
import s from "./Reports.module.css";

/**
 * "Report profile" on /u/[handle]: a client island, so the cached page stays the same for
 * everyone. Shown to members on other members' profiles; superusers and the owner ban from
 * /admin/members instead. The server re-checks.
 */
export function ProfileReport({ handle }: { handle: string }) {
  const me = useMe();
  if (!me) return null;
  const user = meAsUser(me);
  if (!can(user, "report.create") || isSuperuser(user) || user.id === handleKey(handle)) {
    return null;
  }
  return (
    <div className={s.profile}>
      <ReportButton
        target={{ kind: "profile", handle }}
        label="Report profile"
        title={`Report ${handle}`}
      />
    </div>
  );
}
