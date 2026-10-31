"use client";

import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { uart } from "@/lib/uart";
import styles from "./LabCard.module.css";

export function LabWarmup({ healthUrl, children }: { healthUrl: string; children: ReactNode }) {
  const started = useRef(false);
  const controller = useRef<AbortController | null>(null);

  const warm = useCallback(() => {
    if (started.current) return;
    started.current = true;
    const requestController = new AbortController();
    controller.current = requestController;
    void fetch(healthUrl, {
      mode: "no-cors",
      cache: "no-store",
      signal: requestController.signal,
    }).then(
      () => undefined,
      (error: unknown) => {
        if (!requestController.signal.aborted) {
          uart(
            error instanceof Error
              ? `omni: signalling warm-up failed (${error.message})`
              : "omni: signalling warm-up failed (unknown error)",
          );
        }
      },
    );
  }, [healthUrl]);

  useEffect(() => {
    const idleId =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(warm, { timeout: 2500 })
        : undefined;
    const timerId = idleId === undefined ? window.setTimeout(warm, 1200) : undefined;

    return () => {
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timerId !== undefined) window.clearTimeout(timerId);
      controller.current?.abort();
    };
  }, [warm]);

  return (
    <div className={styles.warmup} onPointerEnter={warm} onFocusCapture={warm}>
      {children}
    </div>
  );
}
