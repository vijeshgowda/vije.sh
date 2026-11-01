"use client";

import {
  useId,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type Ref,
  type RefObject,
} from "react";
import { Button } from "@/components/ui/Button";
import { formatBytes, formatTime } from "../client/format";
import { MAX_CHAT, type CallState, type ChatItem, type Transfer } from "../client/state";
import type { Translate } from "./OmniApp";
import styles from "./ChatSheet.module.css";

export type Tab = "chat" | "files";
const TABS: Tab[] = ["chat", "files"];

type Props = {
  tr: Translate;
  call: CallState;
  tab: Tab;
  sheet: Ref<HTMLElement>;
  input: RefObject<HTMLInputElement | null>;
  picker: RefObject<HTMLInputElement | null>;
  onTab: (tab: Tab) => void;
  onSend: (text: string) => Promise<boolean>;
  onTyping: () => void;
  onFiles: (files: File[]) => void;
  onClear: () => void;
  onBack: () => void;
};

/** Chat and files, below the sticky video: scroll (or press Chat) to reach it. */
export function ChatSheet({
  tr,
  call,
  tab,
  sheet,
  input,
  picker,
  onTab,
  onSend,
  onTyping,
  onFiles,
  onClear,
  onBack,
}: Props) {
  const id = useId();
  const [text, setText] = useState("");
  const transfers = new Map(call.transfers.map((transfer) => [transfer.key, transfer]));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    if (await onSend(text)) setText("");
  };

  const tabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.indexOf(tab);
    const next =
      event.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : event.key === "ArrowLeft"
          ? (index - 1 + TABS.length) % TABS.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? TABS.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    onTab(TABS[next]!);
    event.currentTarget.querySelectorAll<HTMLElement>("[role=tab]")[next]?.focus();
  };

  const tabProps = (name: Tab) =>
    ({
      type: "button",
      role: "tab",
      id: `${id}-t-${name}`,
      "aria-selected": tab === name,
      "aria-controls": `${id}-p-${name}`,
      tabIndex: tab === name ? 0 : -1,
      onClick: () => onTab(name),
    }) as const;

  return (
    <section
      ref={sheet}
      className={styles.sheet}
      aria-label={tr("chat.sheet")}
      data-testid="omni-sheet"
    >
      <div className={styles.head}>
        <div className={styles.tabs} role="tablist" onKeyDown={tabKey}>
          <button {...tabProps("chat")}>{tr("chat.title")}</button>
          <button {...tabProps("files")}>
            {tr("chat.files")}
            {call.transfers.length > 0 && " "}
            {call.transfers.length > 0 && <span className={styles.n}>{call.transfers.length}</span>}
          </button>
        </div>
        <button
          className={styles.tool}
          type="button"
          title={tr("chat.clear_title")}
          onClick={onClear}
        >
          {tr("chat.clear")}
        </button>
        <button
          className={`${styles.tool} ${styles.back}`}
          type="button"
          title={tr("chat.back_title")}
          onClick={onBack}
        >
          <span aria-hidden="true">↑ </span>
          {tr("chat.back")}
        </button>
      </div>

      <div
        className={styles.panel}
        id={`${id}-p-chat`}
        role="tabpanel"
        aria-labelledby={`${id}-t-chat`}
        hidden={tab !== "chat"}
      >
        {/* the log wraps the list: role="log" on the <ol> itself would orphan its items */}
        <div role="log" aria-label={tr("chat.message")}>
          <ol className={styles.msgs}>
            {call.messages.map((item) => (
              <Item key={item.id} tr={tr} item={item} transfers={transfers} />
            ))}
          </ol>
        </div>
        {call.messages.length === 0 && <p className={styles.empty}>{tr("chat.empty")}</p>}
      </div>

      <div
        className={styles.panel}
        id={`${id}-p-files`}
        role="tabpanel"
        aria-labelledby={`${id}-t-files`}
        hidden={tab !== "files"}
      >
        {call.transfers.length > 0 ? (
          <ul className={styles.files}>
            {call.transfers.map((transfer) => (
              <FileRow key={transfer.key} tr={tr} transfer={transfer} />
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>{tr("files.empty")}</p>
        )}
        <div className={styles.pick}>
          <Button size="sm" onClick={() => picker.current?.click()}>
            {tr("files.choose")}
          </Button>
          <span>{tr("files.hint")}</span>
          <input
            ref={picker}
            className={styles.picker}
            type="file"
            multiple
            tabIndex={-1}
            aria-hidden="true"
            data-testid="omni-file-input"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (files.length) onFiles(files);
            }}
          />
        </div>
      </div>

      <div className={styles.foot}>
        <p className={styles.typing} aria-hidden={!call.typing}>
          {call.typing && <span>{tr("chat.typing")}</span>}
        </p>
        <form className={styles.compose} onSubmit={(event) => void submit(event)}>
          <label className="vh" htmlFor={`${id}-msg`}>
            {tr("chat.message")}
          </label>
          <input
            ref={input}
            id={`${id}-msg`}
            type="text"
            autoComplete="off"
            maxLength={MAX_CHAT}
            placeholder={tr("chat.message")}
            aria-describedby={`${id}-hint`}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (event.target.value.trim()) onTyping();
            }}
          />
          <button
            className={styles.send}
            type="submit"
            aria-label={tr("ctrl.send_label")}
            disabled={!call.secure}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M4 12h15M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
        <p className={styles.hint} id={`${id}-hint`}>
          {call.secure ? tr("chat.compose_hint") : tr("chat.establishing")}
        </p>
      </div>
    </section>
  );
}

function Item({
  tr,
  item,
  transfers,
}: {
  tr: Translate;
  item: ChatItem;
  transfers: Map<string, Transfer>;
}) {
  const time = formatTime(item.at);
  if (item.kind === "system") {
    return (
      <li className={`${styles.msg} ${styles.sys}`}>
        <p>
          {time} &middot; {tr(item.message.key, item.message.params)}
        </p>
      </li>
    );
  }
  const me = item.kind === "chat" && item.from === "me";
  const header = (
    <header>
      <b>{me ? tr("chat.you") : tr("chat.peer")}</b>
      <span>{time}</span>
    </header>
  );
  if (item.kind === "chat") {
    return (
      <li className={`${styles.msg} ${me ? styles.me : ""}`}>
        {header}
        <p>{item.text}</p>
      </li>
    );
  }
  const transfer = transfers.get(item.transfer);
  if (!transfer?.url) return null;
  return (
    <li className={styles.msg}>
      {header}
      <figure className={styles.prev}>
        {transfer.preview === "image" && (
          // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, nothing to optimise
          <img src={transfer.url} alt={transfer.name} />
        )}
        {transfer.preview === "video" && (
          <video src={transfer.url} controls preload="metadata" aria-label={transfer.name} />
        )}
        <figcaption>
          <span>
            {transfer.name} &middot; {formatBytes(transfer.size)} &middot; {tr("file.verified")}
          </span>
          <a href={transfer.url} download={transfer.name}>
            {tr("file.save")}
          </a>
        </figcaption>
      </figure>
    </li>
  );
}

function FileRow({ tr, transfer }: { tr: Translate; transfer: Transfer }) {
  const percent =
    transfer.status === "done"
      ? 100
      : transfer.total > 0
        ? Math.floor((transfer.done / transfer.total) * 100)
        : 0;
  const status =
    transfer.status === "failed"
      ? tr("file.failed")
      : transfer.status === "done"
        ? tr(transfer.direction === "out" ? "file.sent" : "file.received")
        : tr(transfer.direction === "out" ? "file.sending" : "file.receiving", {
            name: transfer.name,
            pct: percent,
          });
  return (
    <li
      className={`${styles.file} ${transfer.status === "done" ? styles.done : ""} ${transfer.status === "failed" ? styles.failed : ""}`}
    >
      <header>
        <span>{transfer.name}</span>
        <span>{formatBytes(transfer.size)}</span>
      </header>
      <div className={styles.track} aria-hidden="true">
        <i style={{ "--p": `${percent}%` } as CSSProperties} />
      </div>
      <footer>
        <span>{status}</span>
        {transfer.url ? (
          <a href={transfer.url} download={transfer.name}>
            {tr("file.save")}
          </a>
        ) : (
          <span aria-hidden="true">{transfer.direction === "out" ? "↑" : "↓"}</span>
        )}
      </footer>
    </li>
  );
}
