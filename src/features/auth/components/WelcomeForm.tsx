"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Turnstile } from "@/components/ui/Turnstile";
import { completeWelcome, type WelcomeState } from "../actions";
import { safeNext, suggestHandle } from "../handle";
import { fetchMe, type Me } from "./UserMenu";
import styles from "./Auth.module.css";

const INITIAL: WelcomeState = { attempt: 0 };

/** Onboarding island: shows the form only to a signed-in user who hasn't picked a handle yet. */
export function WelcomeForm({ siteKey }: { siteKey: string }) {
  const next = useSearchParams().get("next") ?? "";
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [state, action, pending] = useActionState(completeWelcome, INITIAL);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchMe(ctrl.signal).then((u) => {
      if (!ctrl.signal.aborted) setMe(u);
    });
    return () => ctrl.abort();
  }, []);

  if (me === undefined) return <p className={styles.status}>Checking your session&hellip;</p>;
  if (!me) {
    return (
      <p className={styles.status}>
        <Link href="/login?next=/welcome">Sign in</Link> first, then pick your handle here.
      </p>
    );
  }
  if (me.onboarded) {
    return (
      <p className={styles.status}>
        You&apos;re all set as @{me.handle}. <Link href={safeNext(next)}>Continue</Link>
      </p>
    );
  }

  const invalid = (f: WelcomeState["field"]) => (state.field === f ? true : undefined);
  return (
    <form action={action} className={styles.form} aria-describedby="welcome-error">
      <input type="hidden" name="next" value={next} />
      <div className={styles.field}>
        <label className={styles.label} htmlFor="handle">
          Handle
        </label>
        <input
          id="handle"
          name="handle"
          className={styles.input}
          defaultValue={state.handle ?? suggestHandle(me.displayName)}
          required
          minLength={3}
          maxLength={24}
          pattern="[A-Za-z0-9_]{3,24}"
          autoComplete="username"
          spellCheck={false}
          aria-invalid={invalid("handle")}
          aria-describedby="handle-hint"
        />
        <p id="handle-hint" className={styles.hint}>
          3 to 24 letters, digits or underscores. Shown on everything you post.
        </p>
      </div>
      <label className={styles.check}>
        <input type="checkbox" name="accept" required aria-invalid={invalid("accept")} />
        <span>
          I&apos;ve read the <Link href="/guidelines">community guidelines</Link> and will follow
          them.
        </span>
      </label>
      <Turnstile key={state.attempt} siteKey={siteKey} action="welcome" />
      <div id="welcome-error" aria-live="polite">
        {state.error && <p className={styles.error}>{state.error}</p>}
      </div>
      <div>
        <Button type="submit" variant="red" disabled={pending}>
          {pending ? "Joining\u2026" : "Join"}
        </Button>
      </div>
    </form>
  );
}
