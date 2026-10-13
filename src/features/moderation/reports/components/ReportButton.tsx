"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { toast } from "@/components/layout/toast";
import { Button } from "@/components/ui/Button";
import { PostDialog, useReturnFocus } from "@/features/forum/components/PostDialog";
import w from "@/features/forum/components/Write.module.css";
import { uart } from "@/lib/uart";
import { reportContent } from "../actions";
import { DETAILS_MAX, REPORT_REASONS } from "../format";
import type { ReportTarget } from "../schemas";
import s from "./Reports.module.css";

const FAILED = "Something went wrong. Please try again.";

/**
 * "Report" plus its dialog: a reason, optional details, then a report for staff to review. Once
 * sent, or when this member already has an open report on it, the button reads "Reported".
 */
export function ReportButton({
  target,
  label = "Report",
  title,
}: {
  target: ReportTarget;
  label?: string;
  /** Dialog heading, e.g. "Report FRAME 01" */
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useReturnFocus(open, trigger);
  return (
    <>
      {/* aria-disabled, not disabled: focus comes back here when the dialog closes */}
      <Button
        ref={trigger}
        size="sm"
        className={reported ? s.done : undefined}
        aria-haspopup={reported ? undefined : "dialog"}
        aria-disabled={reported || undefined}
        onClick={() => !reported && setOpen(true)}
      >
        {reported ? "Reported" : label}
      </Button>
      {open && (
        <ReportDialog
          target={target}
          title={title}
          onReported={() => setReported(true)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const key = (t: ReportTarget) => `report-${t.kind}-${t.kind === "profile" ? t.handle : t.id}`;

export function ReportDialog({
  target,
  title,
  onReported,
  onClose,
}: {
  target: ReportTarget;
  title: string;
  onReported: () => void;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const id = key(target);

  // onSubmit, not a form action: React would clear the fields after an error
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setError(null);
    start(async () => {
      const result = await reportContent({
        target,
        reason: form.get("reason") ?? undefined,
        details: String(form.get("details") ?? ""),
      }).catch(() => ({ ok: false as const, error: FAILED }));
      if (!result.ok) {
        setError(result.error);
        if ("already" in result && result.already) onReported();
        return;
      }
      uart(`report: ${target.kind} sent`);
      toast(result.message);
      onReported();
      onClose();
    });
  }

  return (
    <PostDialog labelledBy={`${id}-heading`} onClose={onClose}>
      <form onSubmit={submit} className={w.form}>
        <h2 id={`${id}-heading`}>{title}</h2>
        <p className={w.note}>
          Staff review every report. The member isn&apos;t told who reported them.
        </p>
        <fieldset className={s.reasons} aria-describedby={error ? `${id}-error` : undefined}>
          <legend className={w.label}>Reason</legend>
          {REPORT_REASONS.map((r, i) => (
            <label key={r.value} className={s.reason}>
              <input type="radio" name="reason" value={r.value} required defaultChecked={i === 0} />
              {r.label}
            </label>
          ))}
        </fieldset>
        <label className={w.label} htmlFor={`${id}-details`}>
          Details (optional; needed for &ldquo;Something else&rdquo;)
        </label>
        <textarea
          id={`${id}-details`}
          name="details"
          className={w.input}
          rows={3}
          maxLength={DETAILS_MAX}
        />
        <div id={`${id}-error`} role="alert" className={w.error}>
          {error}
        </div>
        <div className={w.row}>
          <Button type="submit" variant="red" size="sm" disabled={pending}>
            {pending ? "Sending\u2026" : "Send report"}
          </Button>
          <Button size="sm" onClick={onClose}>
            {error ? "Close" : "Cancel"}
          </Button>
        </div>
      </form>
    </PostDialog>
  );
}
