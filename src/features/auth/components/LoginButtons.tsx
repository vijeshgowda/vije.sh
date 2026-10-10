"use client";

import { useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { signIn } from "../actions";
import { PROVIDERS } from "../providers";
import styles from "./Auth.module.css";

const ERRORS: Record<string, string> = {
  provider: "That sign-in option isn't available.",
  oauth: "Couldn't reach the sign-in provider. Please try again.",
  callback: "Sign-in didn't complete. Please try again.",
};

function ProviderButtons() {
  const { pending } = useFormStatus();
  return (
    <div className={styles.providers}>
      {PROVIDERS.map((p) => (
        <Button key={p.id} type="submit" name="provider" value={p.id} disabled={pending}>
          Continue with {p.label}
        </Button>
      ))}
    </div>
  );
}

export function LoginForm({ next, error }: { next: string; error?: string | null }) {
  const message = error ? (ERRORS[error] ?? ERRORS.callback) : null;
  return (
    <form action={signIn} className={styles.form}>
      <input type="hidden" name="next" value={next} />
      {message && (
        <p role="alert" className={styles.error}>
          {message}
        </p>
      )}
      <ProviderButtons />
    </form>
  );
}

/** Reads ?next and ?error on the client, so /login itself stays a static page. */
export function LoginButtons() {
  const params = useSearchParams();
  return <LoginForm next={params.get("next") ?? ""} error={params.get("error")} />;
}
