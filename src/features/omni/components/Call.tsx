"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useNow } from "@/features/live/client/use-now";
import { formatClock } from "../client/format";
import type { CallState, Connection, Message } from "../client/state";
import type { TranslationKey } from "../i18n";
import type { Translate } from "./OmniApp";
import { ChatSheet, type Tab } from "./ChatSheet";
import { SasPanel } from "./SasPanel";
import { StreamVideo, type Shape } from "./StreamVideo";
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
const BANNER_MS = 4_000;

/** Safari's Picture in Picture predates the standard API. */
type WebkitVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

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
  screen: MediaStream | null;
  recording: boolean;
  onMic: () => void;
  onCam: () => void;
  onFlip: () => void;
  onScreen: () => void;
  onRecord: () => void;
  onAnnounce: (item: Message) => void;
  onEnd: () => void;
  onSasMatch: () => void;
  onSasReject: () => void;
  onLevel: (listener: ((level: number) => void) | null) => void;
  onSend: (text: string) => Promise<boolean>;
  onTyping: () => void;
  onFiles: (files: File[]) => void;
  onClear: () => void;
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
  screen,
  recording,
  onMic,
  onCam,
  onFlip,
  onScreen,
  onRecord,
  onAnnounce,
  onEnd,
  onSasMatch,
  onSasReject,
  onLevel,
  onSend,
  onTyping,
  onFiles,
  onClear,
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
  const sheet = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const chatButton = useRef<HTMLButtonElement>(null);
  const latestId = useRef(0);
  const dragDepth = useRef(0);
  const [tab, setTab] = useState<Tab>("chat");
  const [inChat, setInChat] = useState(false);
  const [seenId, setSeenId] = useState(0);
  const [bannerGone, setBannerGone] = useState(0);
  const [dropping, setDropping] = useState(false);
  const canShare = useSyncExternalStore(noSubscribe, displaySupported, () => false);
  const [pipOn, setPipOn] = useState(false);
  const [remoteShape, setRemoteShape] = useState<Shape | null>(null);
  const [localShape, setLocalShape] = useState<Shape | null>(null);
  const portrait = useSyncExternalStore(subscribeOrientation, isPortrait, () => false);

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

  // Picture in Picture floats the peer's video over other apps. Leaving the tab enters it on its
  // own (where the browser allows that without a tap) and coming back leaves it.
  useEffect(() => {
    const root = dialog.current;
    const sync = () => {
      const video = remoteVideo(root);
      setPipOn(
        (video !== null && document.pictureInPictureElement === video) ||
          video?.webkitPresentationMode === "picture-in-picture",
      );
    };
    const onVisibility = () => {
      const video = remoteVideo(root);
      if (!video) return;
      if (document.hidden) void enterPip(video).catch(() => undefined);
      else void exitPip(video);
    };
    const events = [
      "enterpictureinpicture",
      "leavepictureinpicture",
      "webkitpresentationmodechanged",
    ];
    events.forEach((name) => document.addEventListener(name, sync, true));
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      events.forEach((name) => document.removeEventListener(name, sync, true));
      document.removeEventListener("visibilitychange", onVisibility);
      const video = remoteVideo(root);
      if (video) void exitPip(video);
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

  const lastPeerItem = call.messages.findLast(
    (item) => (item.kind === "chat" && item.from === "peer") || item.kind === "file",
  );
  useEffect(() => {
    latestId.current = call.messages.at(-1)?.id ?? 0;
  }, [call.messages]);

  // The sheet counts as read while a quarter of it is on screen; leaving it marks what was seen.
  useEffect(() => {
    const element = sheet.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry?.isIntersecting ?? false;
        setInChat(visible);
        setSeenId(latestId.current);
      },
      { root: dialog.current, threshold: 0.25 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const banner =
    !inChat && lastPeerItem && lastPeerItem.id > seenId && lastPeerItem.id !== bannerGone
      ? lastPeerItem
      : null;
  const bannerText =
    banner?.kind === "chat"
      ? banner.text
      : banner?.kind === "file"
        ? (call.transfers.find((transfer) => transfer.key === banner.transfer)?.name ?? "")
        : "";
  const bannerId = banner?.id ?? 0;
  useEffect(() => {
    if (!bannerId) return;
    const timer = setTimeout(() => setBannerGone(bannerId), BANNER_MS);
    return () => clearTimeout(timer);
  }, [bannerId]);
  const unread = inChat
    ? 0
    : call.messages.filter(
        (item) =>
          item.id > seenId &&
          ((item.kind === "chat" && item.from === "peer") || item.kind === "file"),
      ).length;

  const goChat = useCallback((focus: "input" | "none" = "input") => {
    sheet.current?.scrollIntoView?.({ behavior: behavior(), block: "start" });
    if (focus === "input") input.current?.focus({ preventScroll: true });
  }, []);
  const goVideo = () => {
    dialog.current?.scrollTo?.({ top: 0, behavior: behavior() });
    chatButton.current?.focus({ preventScroll: true });
  };
  const sendFiles = (files: File[]) => {
    if (!files.length) return;
    setTab("files");
    onFiles(files);
  };

  const onPaste = (event: ClipboardEvent<HTMLDialogElement>) => {
    const data = event.clipboardData;
    const files = Array.from(data?.files ?? []);
    // Text wins: pasting into the message box with text on the clipboard stays a normal paste.
    if (!files.length || data.types.includes("text/plain")) return;
    event.preventDefault();
    sendFiles(files);
  };
  const hasFiles = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");
  const dragProps = {
    onDragEnter: (event: DragEvent<HTMLDialogElement>) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDropping(true);
    },
    onDragOver: (event: DragEvent<HTMLDialogElement>) => {
      if (hasFiles(event)) event.preventDefault();
    },
    onDragLeave: (event: DragEvent<HTMLDialogElement>) => {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDropping(false);
    },
    onDrop: (event: DragEvent<HTMLDialogElement>) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDropping(false);
      sendFiles(Array.from(event.dataTransfer.files));
    },
  };

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

  const togglePip = async () => {
    closeMenu();
    const video = remoteVideo(dialog.current);
    if (video && pipOn) {
      await exitPip(video);
      return;
    }
    try {
      if (!(await enterPip(video))) onAnnounce({ key: "sys.pip_unsupported" });
    } catch {
      onAnnounce({ key: "sys.pip_error" });
    }
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
  const typing = call.typing && call.connection === "connected";
  const elapsed = call.startedAt !== null && now !== null ? (now - call.startedAt) / 1000 : 0;
  const notice = call.notice && call.noticeId !== seenNotice ? call.notice : null;
  const localShows = screen !== null || (hasVideo && cam && local !== null);
  const sharing = screen !== null;
  const shareable = hasVideo && canShare;
  const corners = `${styles[corner]} ${drag ? styles.dragging : ""}`;
  const remoteFit = remote ? remoteShape : null;
  const localFit = localShows ? localShape : null;
  // The full-screen video fills the stage only when it has the stage's orientation; a portrait
  // phone camera on a landscape laptop (or a landscape screen on a phone) is shown whole.
  const fit = (shape: Shape | null) =>
    shape && (shape === "portrait") !== portrait ? styles.whole : "";

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
      onPaste={onPaste}
      {...dragProps}
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
          className={`${styles.tile} ${swapped ? `${styles.pip} ${corners}` : `${styles.feed} ${fit(remoteFit)}`}`}
          data-shape={remoteFit ?? undefined}
          {...(swapped ? pipProps : {})}
        >
          {remote ? (
            <StreamVideo stream={remote} onShape={setRemoteShape} data-testid="omni-remote-video" />
          ) : (
            <div className={styles.avatar} aria-hidden="true">
              P
            </div>
          )}
          <span className={styles.tag}>{tr("call.peer")}</span>
        </div>
        <div
          key="local"
          className={`${styles.tile} ${sharing ? styles.screen : facing === "user" ? styles.mirror : ""} ${swapped ? `${styles.feed} ${fit(localFit)}` : `${styles.pip} ${corners}`}`}
          data-shape={localFit ?? undefined}
          {...(swapped ? {} : pipProps)}
        >
          {localShows ? (
            <StreamVideo
              stream={screen ?? local}
              version={localVersion}
              onShape={setLocalShape}
              muted
              data-testid="omni-local-video"
            />
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
            <span className={typing ? styles.typing : undefined}>
              {typing ? tr("chat.typing") : `${tr("call.peer")} · ${sub}`}
            </span>
          </div>
          <span className={styles.spacer} />
          <div className={styles.badges}>
            {recording && (
              <span className={`${styles.badge} ${styles.rec}`} data-testid="omni-rec">
                <i className={styles.led} aria-hidden="true" />
                <span aria-hidden="true">REC</span>
                <span className="vh">{tr("call.recording")}</span>
              </span>
            )}
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

        {banner && (
          <button className={styles.banner} type="button" onClick={() => goChat()}>
            <small>
              {tr("call.peer")} &middot; {tr("chat.new")}
            </small>
            <span>{bannerText}</span>
          </button>
        )}

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
            {shareable && (
              <button
                className={`${styles.ctl} ${styles.act} ${styles.wide}`}
                type="button"
                aria-pressed={sharing}
                title={tr("ctrl.screen_title")}
                data-ctl=""
                onClick={onScreen}
              >
                <Icon>
                  <rect x="3" y="4" width="18" height="12" />
                  <path d="M8 20h8M12 16v4M12 13V7M9 10l3-3 3 3" />
                </Icon>
                {tr("ctrl.screen")}
              </button>
            )}
            <span className={styles.sep} aria-hidden="true" />
            <button
              ref={chatButton}
              className={styles.ctl}
              type="button"
              title={tr("chat.title")}
              data-ctl=""
              onClick={() => goChat()}
            >
              <Icon>
                <path d="M4 5h16v11H9l-5 4z" />
              </Icon>
              {tr("chat.title")}
              {unread > 0 && " "}
              {unread > 0 && (
                <span className={styles.n} data-testid="omni-unread">
                  <span aria-hidden="true">{unread}</span>
                  <span className="vh">{tr("chat.unread", { count: unread })}</span>
                </span>
              )}
            </button>
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
                  {shareable && (
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={sharing}
                      tabIndex={-1}
                      onClick={() => {
                        closeMenu();
                        onScreen();
                      }}
                    >
                      {tr("ctrl.screen_title")}{" "}
                      <small aria-hidden="true">{sharing ? "ON" : "OFF"}</small>
                    </button>
                  )}
                  {remote && (
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={pipOn}
                      tabIndex={-1}
                      onClick={() => void togglePip()}
                    >
                      {tr("ctrl.pip_title")} <small aria-hidden="true">↗</small>
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={recording}
                    tabIndex={-1}
                    onClick={() => {
                      closeMenu();
                      onRecord();
                    }}
                  >
                    {tr("ctrl.record_title")} <small aria-hidden="true">.webm</small>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => {
                      closeMenu(false);
                      setTab("files");
                      goChat("none");
                      picker.current?.click();
                    }}
                  >
                    {tr("menu.file")} <small aria-hidden="true">↑</small>
                  </button>
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
          <button className={styles.hint} type="button" onClick={() => goChat()}>
            {tr("chat.scroll")} <span aria-hidden="true">↓</span>
          </button>
        </div>

        {dropping && (
          <div className={styles.drop} aria-hidden="true">
            {tr("call.drop")}
          </div>
        )}

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

      <ChatSheet
        tr={tr}
        call={call}
        tab={tab}
        sheet={sheet}
        input={input}
        picker={picker}
        onTab={setTab}
        onSend={onSend}
        onTyping={onTyping}
        onFiles={sendFiles}
        onClear={onClear}
        onBack={goVideo}
      />
    </dialog>
  );
}

function behavior(): ScrollBehavior {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

function menuItems(menu: HTMLElement | null): HTMLButtonElement[] {
  if (!menu) return [];
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>("[role=menuitem], [role=menuitemcheckbox]"),
  ).filter(isShown);
}

const noSubscribe = () => () => undefined;
const PORTRAIT = "(orientation: portrait)";
const subscribeOrientation = (onChange: () => void) => {
  const query = window.matchMedia?.(PORTRAIT);
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
};
const isPortrait = () => window.matchMedia?.(PORTRAIT).matches === true;
const displaySupported = () => typeof navigator.mediaDevices?.getDisplayMedia === "function";

function remoteVideo(root: HTMLElement | null): WebkitVideo | null {
  return root?.querySelector<WebkitVideo>("[data-testid=omni-remote-video]") ?? null;
}

/** Resolves false when this browser has no Picture in Picture; throws when it refuses. */
async function enterPip(video: WebkitVideo | null): Promise<boolean> {
  const standard = document.pictureInPictureEnabled === true;
  const webkit = video?.webkitSupportsPresentationMode?.("picture-in-picture") === true;
  if (!standard && !webkit) return false;
  if (!video?.srcObject || video.readyState < 2) throw new Error("no video yet");
  if (standard) {
    if (document.pictureInPictureElement !== video) await video.requestPictureInPicture();
  } else video.webkitSetPresentationMode?.("picture-in-picture");
  return true;
}

async function exitPip(video: WebkitVideo) {
  try {
    if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
    if (video.webkitPresentationMode === "picture-in-picture")
      video.webkitSetPresentationMode?.("inline");
  } catch {
    // Already closed.
  }
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
