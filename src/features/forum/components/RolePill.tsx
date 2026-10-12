import { ROLE_PILL_LABEL, type DisplayRole } from "../roles";
import s from "./Frames.module.css";

const TONE: Partial<Record<DisplayRole, string | undefined>> = {
  admin: s.admin,
  superuser: s.superuser,
  moderator: s.moderator,
};

/** Role pill (prototype `.role.r-*`): red for the owner, ink for superusers, outlined for moderators */
export function RolePill({ role }: { role: DisplayRole }) {
  return (
    <span className={[s.role, TONE[role]].filter(Boolean).join(" ")} data-role={role}>
      {ROLE_PILL_LABEL[role]}
    </span>
  );
}
