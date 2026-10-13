"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/layout/toast";
import { uart } from "@/lib/uart";
import type { ModerationResult } from "../results";

const FAILED = "Something went wrong. Please try again.";

type Done = Extract<ModerationResult, { ok: true }>;

/**
 * Runs a moderation action from an island: pending while it runs, a toast and a UART line on
 * success, then `onDone` (close a dialog, follow a moved thread). The error is kept for the caller
 * to show, or toasted with `toastErrors` (one-click buttons have no form to show it in). The
 * action's updateTag refreshes the page itself.
 */
export function useModerate({ toastErrors = false } = {}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<ModerationResult>, onDone?: (result: Done) => void) {
    setError(null);
    start(async () => {
      const result = await action().catch(() => ({ ok: false as const, error: FAILED }));
      if (!result.ok) {
        if (toastErrors) toast(result.error);
        else setError(result.error);
        return;
      }
      uart(`mod: ${result.message.toLowerCase()}`);
      toast(result.message);
      onDone?.(result);
    });
  }

  return { pending, error, run };
}
