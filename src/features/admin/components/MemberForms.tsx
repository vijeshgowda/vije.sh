"use client";

import { useActionState } from "react";
import { toast } from "@/components/layout/toast";
import { Button } from "@/components/ui/Button";
import {
  banAction,
  grantRoleAction,
  liftBanAction,
  revokeRoleAction,
  type AdminActionState,
} from "../actions";
import { BAN_DURATIONS } from "../members";
import type { CategoryOption } from "../queries";
import styles from "./Admin.module.css";

type Action = (prev: AdminActionState, formData: FormData) => Promise<AdminActionState>;

/**
 * Runs a member action. The page re-renders with the change (the action calls refresh()), which
 * may replace this form, so success is announced by a toast; errors stay next to the form.
 */
function useMemberAction(action: Action) {
  return useActionState<AdminActionState, FormData>(async (prev, formData) => {
    const next = await action(prev, formData);
    if (next.ok) toast(next.ok);
    return next;
  }, {});
}

function FormError({ id, state }: { id: string; state: AdminActionState }) {
  return (
    <div id={id} aria-live="polite">
      {state.error && <p className={styles.error}>{state.error}</p>}
    </div>
  );
}

/** Grant moderator, for every category or one. */
export function GrantModeratorForm({
  handle,
  categories,
}: {
  handle: string;
  categories: CategoryOption[];
}) {
  const [state, action, pending] = useMemberAction(grantRoleAction);
  return (
    <form action={action} className={styles.form} aria-describedby="grant-mod-error">
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="role" value="moderator" />
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="grant-mod-scope">
            Moderator of
          </label>
          <select id="grant-mod-scope" name="categoryId" className={styles.input} defaultValue="">
            <option value="">Every category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={pending}>
          Grant moderator
        </Button>
      </div>
      <FormError id="grant-mod-error" state={state} />
    </form>
  );
}

/** Grant superuser (owner only); replaces the member's moderator grants. */
export function GrantSuperuserForm({ handle }: { handle: string }) {
  const [state, action, pending] = useMemberAction(grantRoleAction);
  return (
    <form action={action} className={styles.form} aria-describedby="grant-su-error">
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="role" value="superuser" />
      <p className={styles.hint} id="grant-su-hint">
        Superusers moderate every category and see /admin except notes and categories. Their
        moderator grants are removed.
      </p>
      <div className={styles.row}>
        <Button type="submit" disabled={pending} aria-describedby="grant-su-hint">
          Make superuser
        </Button>
      </div>
      <FormError id="grant-su-error" state={state} />
    </form>
  );
}

/** Revoke one role grant. */
export function RevokeRoleForm({
  handle,
  role,
  categoryId,
  label,
}: {
  handle: string;
  role: "superuser" | "moderator";
  categoryId: string | null;
  label: string;
}) {
  const [state, action, pending] = useMemberAction(revokeRoleAction);
  const id = `revoke-${role}-${categoryId ?? "all"}-error`;
  return (
    <form action={action} aria-describedby={id}>
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="categoryId" value={categoryId ?? ""} />
      <Button type="submit" size="sm" disabled={pending} aria-label={`Revoke ${label}`}>
        Revoke
      </Button>
      <FormError id={id} state={state} />
    </form>
  );
}

/** Ban with a reason and a length (permanent by default). */
export function BanForm({ handle }: { handle: string }) {
  const [state, action, pending] = useMemberAction(banAction);
  return (
    <form action={action} className={styles.form} aria-describedby="ban-error">
      <input type="hidden" name="handle" value={handle} />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="ban-reason">
          Reason
        </label>
        <textarea
          id="ban-reason"
          name="reason"
          className={styles.input}
          required
          maxLength={500}
          aria-describedby="ban-reason-hint"
        />
        <p id="ban-reason-hint" className={styles.hint}>
          Recorded in the moderation log. Up to 500 characters.
        </p>
      </div>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ban-days">
            Length
          </label>
          <select id="ban-days" name="days" className={styles.input} defaultValue="">
            {BAN_DURATIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="red" disabled={pending}>
          Ban @{handle}
        </Button>
      </div>
      <FormError id="ban-error" state={state} />
    </form>
  );
}

/** Lift an active ban early. */
export function LiftBanForm({ handle }: { handle: string }) {
  const [state, action, pending] = useMemberAction(liftBanAction);
  return (
    <form action={action} className={styles.form} aria-describedby="lift-error">
      <input type="hidden" name="handle" value={handle} />
      <div className={styles.row}>
        <Button type="submit" disabled={pending}>
          Lift ban
        </Button>
      </div>
      <FormError id="lift-error" state={state} />
    </form>
  );
}
