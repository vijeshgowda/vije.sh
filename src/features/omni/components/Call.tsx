"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useNow } from "@/features/live/client/use-now";
import { formatClock } from "../client/format";
import type { CallState, Connection } from "../client/state";
import type { TranslationKey } from "../i18n";
import type { Translate } from "./OmniApp";
import { SasPanel } from "./SasPanel";
import { StreamVideo } from "./StreamVideo";
import styles from "./Call.module.css";

type Corner = "tl" | "tr" | "br" | "bl";
const CLOCKWISE: Corner[] = ["tl", "tr", "br", "bl"];
const CORNER_ARROW: Record<Corner, string> = { tl: "↖", tr: "↗", br: "↘", bl: "↙" };
const CONNECTION: Record<Connection, TranslationKey> = {
  connecting: "conn.connecting",
  connected: "conn.connected",
  reconnecting: "conn.reconnecting",
  failed: "conn.failed",
};
const HIDE_MS = 4_000;
const NOTICE_MS = 6_000;
const DRAG_PX = 6;

type Props = {
  tr: Translate;
  code: string;
  call: CallState;
  local: MediaStream | null;
  localVersion: number;
  remote: MediaStream | null;
  hasVideo: boolean;
  mic: boolean;
  cam: boolean;
  facing: "user" | "environment";
  onMic: () => void;
  onCam: () => void;
  onFlip: () => void;
  onEnd: () => void;
  onSasMatch: () => void;
  onSasReject: () => void;
  onLevel: (listener: ((level: number) => void) | null) => void;
};

function Icon({ children, fill }: { children: ReactNode; fill?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? undefined : "currentColor"}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function nextCorner(corner: Corner, key: string): Corner | null {
  const [v, h] = corner.split("") as ["t" | "b", "l" | "r"];
  if (key === "ArrowLeft") return `${v}l`;
  if (key === "ArrowRight") return `${v}r`;
  if (key === "ArrowUp") return `t${h}`;
  if (key === "ArrowDown") return `b${h}`;
  return null;
}

/** The call: a full-screen modal layer in the dark theme, FaceTime-style. Tap the video for controls. */
export function Call({
  tr,
  code,
  call,
  local,
  localVersion,
  remote,
  hasVideo,
  mic,
  cam,
  facing,
  onMic,
  onCam,
  onFlip,
  onEnd,
  onSasMatch,
  onSasReject,
  onLevel,
}: Props) {
  const id = useId();
  const now = useNow();
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const meter = useRef<HTMLSpanElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const lastWake = useRef(0);
  const [shown, setShown] = useState(true);
  const [poke, setPoke] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [corner, setCorner] = useState<Corner>("br");
  const [swapped, setSwapped] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [fullscreen, setFullscreen] = useState({ supported: false, active: false });
  const [seenNotice, setSeenNotice] = useState(0);

  const pinned = menuOpen || call.sasOpen || call.ending !== null;
  const visible = shown || pinned;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) {
      if (typeof element.showModal === "function") element.showModal();
      else element.setAttribute("open", "");
    }
    return () => {
      if (element.open && typeof element.close === "function") element.close();
    };
  }, []);

  useEffect(() => {
    const sync = () =>
      setFullscreen({
        supported: document.fullscreenEnabled === true,
        active: document.fullscreenElement != null,
      });
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    };
  }, []);

  // The mic meter is written straight to the DOM every frame; React never re-renders for it.
  useEffect(() => {
    let last = -1;
    onLevel((level) => {
      const bars = Math.round(level * 12);
      const element = meter.current;
      if (bars === last || !element) return;
      last = bars;
      Array.from(element.children).forEach((bar, index) =>
        bar.classList.toggle(styles.on, index < bars),
      );
    });
    return () => onLevel(null);
  }, [onLevel]);

  useEffect(() => {
    if (!shown || pinned) return;
    const timer = setTimeout(() => {
      // Keyboard users keep the controls while focus is on one of them.
      const active = document.activeElement;
      const keyboard =
        active instanceof HTMLElement &&
        stage.current?.contains(active) &&
        active !== stage.current &&
        safeMatches(active, ":focus-visible");
      if (!keyboard) setShown(false);
    }, HIDE_MS);
    return () => clearTimeout(timer);
  }, [shown, pinned, poke]);

  useEffect(() => {
    if (!call.notice) return;
    const id = call.noticeId;
    const timer = setTimeout(() => setSeenNotice(id), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [call.notice, call.noticeId]);

  const wake = useCallback(() => {
    setShown(true);
    const at = performance.now();
    if (at - lastWake.current > 500) {
      lastWake.current = at;
      setPoke((value) => value + 1);
    }
  }, []);

  const closeMenu = useCallback((restore = true) => {
    setMenuOpen(false);
    if (restore) more.current?.focus();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const first = menuItems(menu.current)[0];
    first?.focus();
    const outside = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !more.current?.contains(target)) closeMenu(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menuOpen, closeMenu]);

  const onStageClick = (event: MouseEvent) => {
    const target = event.target as Element;
    if (target.closest("button, a, input, [role=menu], [role=dialog], [data-pip]")) return;
    if (visible && !pinned) setShown(false);
    else wake();
  };

  const onToolbarKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("[role=menu]")) return;
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-ctl]"),
    ).filter(isShown);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = menuItems(menu.current);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      closeMenu(false);
    }
  };

  const toggleFullscreen = () => {
    closeMenu();
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void dialog.current?.requestFullscreen?.().catch(() => undefined);
  };

  const pipKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSwapped((value) => !value);
      return;
    }
    const next = nextCorner(corner, event.key);
    if (!next) return;
    event.preventDefault();
    setCorner(next);
  };
  const pipDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragFrom.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pipMove = (event: PointerEvent<HTMLDivElement>) => {
    const from = dragFrom.current;
    if (!from) return;
    const x = event.clientX - from.x;
    const y = event.clientY - from.y;
    if (drag || Math.hypot(x, y) > DRAG_PX) setDrag({ x, y });
  };
  const pipUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragFrom.current) return;
    dragFrom.current = null;
    if (!drag) {
      setSwapped((value) => !value);
      return;
    }
    setDrag(null);
    const rect = stage.current?.getBoundingClientRect();
    if (!rect) return;
    const v = event.clientY < rect.top + rect.height / 2 ? "t" : "b";
    const h = event.clientX < rect.left + rect.width / 2 ? "l" : "r";
    setCorner(`${v}${h}`);
  };
  const pipCancel = () => {
    dragFrom.current = null;
    setDrag(null);
  };

  const sub =
    call.connection === "connected"
      ? call.link === "direct"
        ? tr("call.link_direct")
        : call.link === "relayed"
          ? tr("call.link_relayed")
          : tr("conn.connected")
      : tr(CONNECTION[call.connection]);
  const elapsed = call.startedAt !== null && now !== null ? (now - call.startedAt) / 1000 : 0;
  const notice = call.notice && call.noticeId !== seenNotice ? call.notice : null;
  const localShows = hasVideo && cam && local !== null;
  const corners = `${styles[corner]} ${drag ? styles.dragging : ""}`;

  const pipProps = {
    role: "button",
    tabIndex: 0,
    "data-pip": "",
    "aria-label": swapped ? tr("call.pip_peer") : tr("call.pip_label"),
    "aria-describedby": `${id}-pip`,
    onKeyDown: pipKey,
    onPointerDown: pipDown,
    onPointerMove: pipMove,
    onPointerUp: pipUp,
    onPointerCancel: pipCancel,
    style: drag ? { translate: `${drag.x}px ${drag.y}px` } : undefined,
  } as const;

  return (
    <dialog
      ref={dialog}
      className={styles.call}
      data-theme="dark"
      aria-label={tr("call.label", { code })}
      data-testid="omni-call"
      onCancel={(event) => {
        // Esc never ends the call; it closes the menu or the safety check.
        event.preventDefault();
        if (menuOpen) closeMenu();
        else if (call.sasOpen) onSasMatch();
      }}
      onClose={() => {
        const element = dialog.current;
        if (element?.isConnected && typeof element.showModal === "function") element.showModal();
      }}
    >
      <div
        ref={stage}
        className={`${styles.stage} ${visible ? "" : styles.idle}`}
        onClick={onStageClick}
        onFocus={wake}
        onPointerMove={(event) => {
          if (event.pointerType === "mouse") wake();
        }}
      >
        <div
          key="remote"
          className={`${styles.tile} ${swapped ? `${styles.pip} ${corners}` : styles.feed}`}
          {...(swapped ? pipProps : {})}
        >
          {remote ? (
            <StreamVideo stream={remote} data-testid="omni-remote-video" />
          ) : (
            <div className={styles.avatar} aria-hidden="true">
              P
            </div>
          )}
          <span className={styles.tag}>{tr("call.peer")}</span>
        </div>
        <div
          key="local"
          className={`${styles.tile} ${facing === "user" ? styles.mirror : ""} ${swapped ? styles.feed : `${styles.pip} ${corners}`}`}
          {...(swapped ? {} : pipProps)}
        >
          {localShows ? (
            <StreamVideo stream={local} version={localVersion} muted />
          ) : (
            <span className={styles.off}>{tr("call.camera_off")}</span>
          )}
          <span className={styles.tag}>{tr("call.you")}</span>
        </div>
        <p className="vh" id={`${id}-pip`}>
          {tr("call.pip_hint")}
        </p>

        <div className={styles.top}>
          <div className={styles.id}>
            <b>
              <i
                className={`${styles.led} ${call.connection === "connected" ? styles.ledOn : styles.ledWarn}`}
                aria-hidden="true"
              />
              Omni &middot; {code}
            </b>
            <span>
              {tr("call.peer")} &middot; {sub}
            </span>
          </div>
          <span className={styles.spacer} />
          <div className={styles.badges}>
            <span className={styles.badge} data-testid="omni-timer">
              {formatClock(elapsed)}
            </span>
            {call.quality && (
              <span className={styles.badge} title={call.qualityLabel || tr("badge.quality_title")}>
                <span className={styles.bars} data-l={call.quality} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span className={styles.wide}>{tr(`quality.${call.quality}`)}</span>
              </span>
            )}
            {call.secure ? (
              <span className={styles.badge} title={tr("call.e2e_title")}>
                <span aria-hidden="true">E2E</span>
                <span className="vh">{tr("call.e2e_title")}</span>
              </span>
            ) : (
              <span className={`${styles.badge} ${styles.securing}`}>
                <i className={styles.led} aria-hidden="true" />
                {tr("call.securing")}
              </span>
            )}
          </div>
        </div>

        {call.sasOpen && call.safety && !call.ending && (
          <SasPanel tr={tr} safety={call.safety} onMatch={onSasMatch} onReject={onSasReject} />
        )}

        <div className={styles.dock} data-dock="">
          <p className={call.nudge && !mic ? styles.nudge : "vh"} role="status">
            {call.nudge && !mic ? tr("call.muted") : ""}
          </p>
          <p className={notice ? styles.notice : "vh"} role="status">
            {notice ?? ""}
          </p>
          <div
            className={styles.bar}
            role="toolbar"
            aria-label={tr("call.controls")}
            onKeyDown={onToolbarKey}
          >
            <button
              className={`${styles.ctl} ${styles.toggle}`}
              type="button"
              aria-pressed={mic}
              title={tr("ctrl.mute_title")}
              data-ctl=""
              onClick={onMic}
            >
              <Icon>
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                <path className={styles.strike} d="M3 3l18 18" />
              </Icon>
              {tr("ctrl.mic")}
              <span className={styles.meter} ref={meter} aria-hidden="true">
                {Array.from({ length: 12 }, (_, index) => (
                  <i key={index} />
                ))}
              </span>
            </button>
            <button
              className={`${styles.ctl} ${styles.toggle}`}
              type="button"
              aria-pressed={hasVideo && cam}
              aria-disabled={!hasVideo || undefined}
              title={tr("ctrl.camera_title")}
              data-ctl=""
              onClick={() => hasVideo && onCam()}
            >
              <Icon>
                <rect x="3" y="6" width="13" height="12" />
                <path d="M16 10l5-3v10l-5-3" />
                <path className={styles.strike} d="M3 3l18 18" />
              </Icon>
              {tr("ctrl.cam")}
            </button>
            {hasVideo && (
              <button
                className={`${styles.ctl} ${styles.flip}`}
                type="button"
                title={tr("ctrl.flip_title")}
                data-ctl=""
                onClick={onFlip}
              >
                <Icon>
                  <path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2" />
                  <path d="M20 4v5h-5M4 20v-5h5" />
                </Icon>
                {tr("ctrl.flip")}
              </button>
            )}
            <span className={styles.sep} aria-hidden="true" />
            <div>
              <button
                ref={more}
                className={styles.ctl}
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={`${id}-menu`}
                title={tr("ctrl.more_title")}
                data-ctl=""
                onClick={() => setMenuOpen((open) => !open)}
              >
                <Icon fill>
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </Icon>
                {tr("ctrl.more")}
              </button>
              {menuOpen && (
                <div
                  ref={menu}
                  className={styles.menu}
                  id={`${id}-menu`}
                  role="menu"
                  aria-label={tr("ctrl.more_title")}
                  onKeyDown={onMenuKey}
                >
                  {hasVideo && (
                    <button
                      className={styles.narrow}
                      type="button"
                      role="menuitem"
                      tabIndex={-1}
                      onClick={() => {
                        closeMenu();
                        onFlip();
                      }}
                    >
                      {tr("ctrl.flip_title")} <small aria-hidden="true">↻</small>
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => {
                      setCorner(CLOCKWISE[(CLOCKWISE.indexOf(corner) + 1) % CLOCKWISE.length]!);
                      closeMenu();
                    }}
                  >
                    {tr("menu.move")} <small aria-hidden="true">{CORNER_ARROW[corner]}</small>
                  </button>
                  {fullscreen.supported && (
                    <button type="button" role="menuitem" tabIndex={-1} onClick={toggleFullscreen}>
                      {fullscreen.active ? tr("menu.exit_fullscreen") : tr("menu.fullscreen")}{" "}
                      <small aria-hidden="true">▢</small>
                    </button>
                  )}
                </div>
              )}
            </div>
            <button
              className={`${styles.ctl} ${styles.end}`}
              type="button"
              title={tr("ctrl.end_title")}
              data-ctl=""
              onClick={onEnd}
            >
              <Icon>
                <path d="M3 14c5-5 13-5 18 0l-2.5 2.5-3-1.5v-3a10 10 0 0 0-5 0v3l-3 1.5z" />
              </Icon>
              <span className={styles.endText}>{tr("ctrl.end")}</span>
            </button>
          </div>
        </div>

        {call.connection === "reconnecting" && !call.ending && (
          <div className={styles.recon} role="status">
            <span>{tr("call.network_changed")}</span>
          </div>
        )}
        {call.ending && (
          <div className={styles.over}>
            <div role="alert">
              <small>{tr("end.kicker")}</small>
              <p>{tr(call.ending)}</p>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

function menuItems(menu: HTMLElement | null): HTMLButtonElement[] {
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLButtonElement>("[role=menuitem]")).filter(isShown);
}

function isShown(element: HTMLElement): boolean {
  return getComputedStyle(element).display !== "none";
}

function safeMatches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}
