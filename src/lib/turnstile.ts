import "server-only";
import { env } from "@/lib/env";

/** Cloudflare's always-pass test secret (application.md 13.3); real keys are Production only. */
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileCheck {
  token: string;
  /** The widget's `action`; a token solved for another form is rejected */
  action: string;
  /** This site's hostname; the token must have been solved here */
  hostname: string;
  ip?: string | null;
}

interface SiteverifyResult {
  success?: boolean;
  hostname?: string;
  action?: string;
}

/**
 * Server-side Turnstile check (application.md 10.2). With the always-pass test secret, Cloudflare
 * accepts every token and reports a placeholder hostname, so that case is answered locally: tests
 * and previews never depend on Cloudflare.
 */
export async function verifyTurnstile(
  { token, action, hostname, ip }: TurnstileCheck,
  secret: string = env("turnstile").TURNSTILE_SECRET_KEY,
): Promise<boolean> {
  if (!token || token.length > 2048) return false;
  if (secret === TURNSTILE_TEST_SECRET) return true;

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as SiteverifyResult;
    return data.success === true && data.action === action && data.hostname === hostname;
  } catch {
    return false;
  }
}
