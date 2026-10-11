import "server-only";
import { query } from "@/lib/db";
import type { CurrentUser } from "@/lib/authz";
import type { Role } from "@/db/types";

export interface SessionUser extends CurrentUser {
  displayName: string | null;
}

interface Row {
  id: string;
  handle: string | null;
  display_name: string | null;
  onboarded_at: Date | null;
  roles: { role: Role; category_id: string | null }[];
  banned: boolean;
}

/** Profile, roles and ban status in one round trip (database.md section 7). Null without a profile. */
export async function loadCurrentUser(userId: string): Promise<SessionUser | null> {
  const { rows } = await query<Row>(
    `select p.id, p.handle::text as handle, p.display_name, p.onboarded_at,
            coalesce(json_agg(json_build_object('role', r.role, 'category_id', r.category_id::text))
                     filter (where r.role is not null), '[]') as roles,
            exists (select 1 from app.user_bans b
                     where b.user_id = p.id and b.lifted_at is null
                       and (b.expires_at is null or b.expires_at > now())) as banned
       from app.profiles p
       left join app.user_roles r on r.user_id = p.id
      where p.id = $1
      group by p.id`,
    [userId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    onboarded: row.onboarded_at !== null,
    banned: row.banned,
    roles: row.roles.map((r) => ({ role: r.role, categoryId: r.category_id })),
  };
}
