"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import type { SafetyString } from "../client/core/crypto";
import type { Translate } from "./OmniApp";
import styles from "./Call.module.css";

/** The safety check. Focus moves in on open, Esc dismisses, focus returns on close. */
export function SasPanel({
  tr,
  safety,
  onMatch,
  onReject,
}: {
  tr: Translate;
  safety: SafetyString;
  onMatch: () => void;
  onReject: () => void;
}) {
  const id = useId();
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ok.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className={styles.sas}
      role="dialog"
      aria-labelledby={`${id}-h`}
      aria-describedby={`${id}-d`}
      data-testid="omni-sas"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        onMatch();
      }}
    >
      <header>
        <span>SAS</span>
        <span>{tr("sas.kicker")}</span>
      </header>
      <strong id={`${id}-h`}>{tr("sas.title")}</strong>
      <div className={styles.emoji}>{safety.emoji}</div>
      <code>{safety.code}</code>
      <p id={`${id}-d`}>{tr("sas.hint")}</p>
      <div className={styles.row}>
        <Button ref={ok} size="sm" variant="red" onClick={onMatch}>
          {tr("sas.match")}
        </Button>
        <Button size="sm" onClick={onReject}>
          {tr("sas.nomatch")}
        </Button>
      </div>
    </div>
  );
}
