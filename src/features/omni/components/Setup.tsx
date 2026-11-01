"use client";

import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Datasheet";
import { cleanCode, codeFromHash, isValidCode } from "../client/code";
import type { Alert, Mode, OmniState } from "../client/state";
import { LANGUAGES, type Language, type TranslationKey } from "../i18n";
import { iceSummary } from "../config";
import type { Translate } from "./OmniApp";
import styles from "./Omni.module.css";

export type SetupRequest = { mode: Mode; code: string; password: string };

type Props = {
  tr: Translate;
  phase: OmniState["phase"];
  mode: Mode | null;
  attempt: number;
  alert: Alert | null;
  defaults: SetupRequest | null;
  onStart: (request: SetupRequest) => void;
  onRetry: () => void;
  onDismiss: () => void;
  onPrefetch: () => void;
  language: Language;
  onLanguage: (language: Language) => void;
};

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};
const readHash = () => codeFromHash(window.location.hash);
const serverHash = () => "";
const ice = iceSummary();

type BootProps = Pick<Props, "tr" | "phase" | "mode" | "attempt">;

function Boot({ tr, phase, mode, attempt }: BootProps) {
  return (
    <div className={styles.boot}>
      <p role="status">
        {tr(
          phase === "media"
            ? "setup.requesting_media"
            : mode === "join"
              ? "home.connecting_join"
              : "home.connecting",
        )}
      </p>
      {phase === "connecting" && (
        <>
          <div className={styles.bar} key={attempt} aria-hidden="true">
            <i />
          </div>
          <small className={styles.small}>{tr("home.connecting_cold")}</small>
        </>
      )}
    </div>
  );
}

export function Setup({
  tr,
  phase,
  mode,
  attempt,
  alert,
  defaults,
  onStart,
  onRetry,
  onDismiss,
  onPrefetch,
  language,
  onLanguage,
}: Props) {
  const id = useId();
  const [langNote, setLangNote] = useState("");
  const hashCode = useSyncExternalStore(subscribeHash, readHash, serverHash);
  const created = defaults?.mode === "create" ? defaults.code : "";
  const [customOpen, setCustomOpen] = useState(created !== "");
  const [custom, setCustom] = useState(created);
  const [typed, setTyped] = useState<string | null>(
    defaults?.mode === "join" ? defaults.code : null,
  );
  const [password, setPassword] = useState(defaults?.password ?? "");
  const [error, setError] = useState<{ form: Mode; key: TranslationKey } | null>(null);
  const joinCode = typed ?? hashCode;
  const busy = phase === "media" || phase === "connecting";

  const create = (event: FormEvent) => {
    event.preventDefault();
    const code = customOpen ? cleanCode(custom) : "";
    if (code && !isValidCode(code)) return setError({ form: "create", key: "err.custom_length" });
    setError(null);
    onStart({ mode: "create", code, password });
  };
  const join = (event: FormEvent) => {
    event.preventDefault();
    const code = cleanCode(joinCode);
    if (!isValidCode(code)) return setError({ form: "join", key: "err.invalid_code" });
    setError(null);
    onStart({ mode: "join", code, password });
  };

  const signal =
    phase === "connecting"
      ? { led: styles.ledWarn, text: "LINKING" }
      : phase === "media"
        ? { led: styles.ledWarn, text: "MEDIA" }
        : { led: "", text: "IDLE" };
  const createError = error?.form === "create" ? tr(error.key) : "";
  const joinError = error?.form === "join" ? tr(error.key) : "";

  return (
    <Section id="omni-setup" title={tr("setup.title")} note={tr("setup.note")}>
      {alert && (
        <div
          className={`${styles.alert} ${alert.tone === "info" ? styles.alertInfo : ""}`}
          role="alert"
          tabIndex={-1}
          data-omni-focus=""
        >
          <small>{tr(alert.tone === "info" ? "alert.ended" : "alert.error")}</small>
          <p>{alert.text ?? tr(alert.key, alert.params)}</p>
          <div className={styles.row}>
            {alert.retry && (
              <Button size="sm" variant="red" onClick={onRetry} disabled={busy}>
                {tr("alert.retry")}
              </Button>
            )}
            <Button size="sm" onClick={onDismiss}>
              {tr("alert.dismiss")}
            </Button>
          </div>
        </div>
      )}

      <div className={styles.setup}>
        <form className={styles.pane} onSubmit={create} noValidate>
          <header>
            <span>TX</span>
            <span>{tr("setup.create_kicker")}</span>
          </header>
          <h3>{tr("setup.create_title")}</h3>
          <p>{tr("setup.create_body")}</p>
          <button
            className={styles.link}
            type="button"
            aria-expanded={customOpen}
            aria-controls={`${id}-custom`}
            onClick={() => setCustomOpen((open) => !open)}
          >
            {tr("setup.custom_toggle")}
          </button>
          <div className={styles.field} id={`${id}-custom`} hidden={!customOpen}>
            <label htmlFor={`${id}-custom-code`}>{tr("setup.custom_label")}</label>
            <input
              id={`${id}-custom-code`}
              className={styles.code}
              type="text"
              maxLength={10}
              placeholder={tr("setup.custom_placeholder")}
              autoComplete="off"
              spellCheck={false}
              value={custom}
              aria-invalid={createError ? true : undefined}
              aria-describedby={createError ? `${id}-create-err` : undefined}
              onChange={(event) => setCustom(event.target.value)}
            />
          </div>
          <p className={styles.err} id={`${id}-create-err`} role="alert">
            {createError}
          </p>
          <Button
            type="submit"
            variant="red"
            disabled={busy}
            onPointerEnter={onPrefetch}
            onFocus={onPrefetch}
          >
            {tr("home.create")}
          </Button>
          {busy && mode !== "join" && <Boot tr={tr} phase={phase} mode={mode} attempt={attempt} />}
          <small className={styles.small}>{tr("setup.media_hint")}</small>
        </form>

        <form className={styles.pane} onSubmit={join} noValidate>
          <header>
            <span>RX</span>
            <span>{tr("setup.join_kicker")}</span>
          </header>
          <h3>{tr("setup.join_title")}</h3>
          <div className={styles.field}>
            <label htmlFor={`${id}-join-code`}>{tr("setup.code_label")}</label>
            <div className={styles.row}>
              <input
                id={`${id}-join-code`}
                className={styles.code}
                type="text"
                maxLength={10}
                placeholder="K7Q2M9"
                autoComplete="off"
                spellCheck={false}
                value={joinCode}
                aria-invalid={joinError ? true : undefined}
                aria-describedby={joinError ? `${id}-join-err` : undefined}
                onChange={(event) => setTyped(event.target.value)}
              />
              <Button
                type="submit"
                disabled={busy}
                onPointerEnter={onPrefetch}
                onFocus={onPrefetch}
              >
                {tr("home.join")}
              </Button>
            </div>
          </div>
          {busy && mode === "join" && <Boot tr={tr} phase={phase} mode={mode} attempt={attempt} />}
          <p className={styles.err} id={`${id}-join-err`} role="alert">
            {joinError}
          </p>
        </form>

        <div className={`${styles.field} ${styles.password}`}>
          <label htmlFor={`${id}-password`}>
            {tr("setup.password_label")} <small>{tr("setup.password_optional")}</small>
          </label>
          <input
            id={`${id}-password`}
            type="password"
            autoComplete="off"
            placeholder={tr("setup.password_placeholder")}
            value={password}
            aria-describedby={`${id}-password-hint`}
            onChange={(event) => setPassword(event.target.value)}
          />
          <small id={`${id}-password-hint`}>{tr("setup.password_hint")}</small>
        </div>

        <aside className={styles.spec} aria-label={tr("setup.spec_label")}>
          <div className={styles.regs}>
            <div>
              <small>SIGNAL</small>
              <b>
                <i className={`${styles.led} ${signal.led}`} aria-hidden="true" />
                {signal.text}
              </b>
            </div>
            <div>
              <small>ICE</small>
              STUN {ice.stun} &middot; TURN {ice.turn}
            </div>
            <div>
              <small>KEY</small>
              ECDH P-256
            </div>
            <div>
              <small>CIPHER</small>
              AES-GCM-256
            </div>
          </div>
          <div className={styles.field}>
            <span className={styles.small} id={`${id}-lang`}>
              {tr("home.lang_label")}
            </span>
            <div className={styles.lang} role="group" aria-labelledby={`${id}-lang`}>
              {LANGUAGES.map(({ code, label }) => (
                <button
                  key={code}
                  type="button"
                  lang={code}
                  aria-pressed={code === language}
                  onClick={() => {
                    if (code === language) return;
                    onLanguage(code);
                    // The status sits inside the app's lang attribute, so it is read in the new language.
                    setLangNote(label);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <span className="vh" aria-live="polite" data-testid="omni-lang-status">
            {langNote && tr("a11y.lang_changed", { lang: langNote })}
          </span>
        </aside>
      </div>
    </Section>
  );
}
