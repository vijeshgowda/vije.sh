"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Datasheet";
import { useNow } from "@/features/live/client/use-now";
import { formatClock } from "../client/format";
import type { Message, OmniState } from "../client/state";
import type { Translate } from "./OmniApp";
import { StreamVideo } from "./StreamVideo";
import styles from "./Omni.module.css";

type Props = {
  tr: Translate;
  room: NonNullable<OmniState["room"]>;
  status: Message;
  local: MediaStream | null;
  localVersion: number;
  hasVideo: boolean;
  mic: boolean;
  cam: boolean;
  onMic: () => void;
  onCam: () => void;
  onClose: () => void;
};

type Qr = { dimension: number; path: string };

/** The join link as a QR code. The encoder is its own chunk, loaded once the lobby opens. */
function JoinQr({ tr, url }: { tr: Props["tr"]; url: string }) {
  const [qr, setQr] = useState<{ url: string; qr: Qr | null } | null>(null);
  useEffect(() => {
    let live = true;
    import("../client/core/qrcode")
      .then(({ makeQrPath }) => {
        let next: Qr | null = null;
        try {
          next = makeQrPath(url, { ecc: "MEDIUM", border: 2 });
        } catch {
          // Too long to encode: the link and Share button still work.
        }
        if (live) setQr({ url, qr: next });
      })
      .catch(() => {
        if (live) setQr({ url, qr: null });
      });
    return () => {
      live = false;
    };
  }, [url]);
  const current = qr?.url === url ? qr.qr : null;
  if (qr?.url === url && !current) return null;
  return (
    <div className={styles.pane}>
      <header>
        <span>QR</span>
        <span>{tr("lobby.qr_title")}</span>
      </header>
      <div className={styles.qr} role="img" aria-label={tr("lobby.qr_label")} data-testid="omni-qr">
        {current && (
          <svg
            viewBox={`0 0 ${current.dimension} ${current.dimension}`}
            shapeRendering="crispEdges"
            aria-hidden="true"
            focusable="false"
          >
            <path d={current.path} />
          </svg>
        )}
      </div>
      <p className={styles.small}>{tr("lobby.qr_hint")}</p>
    </div>
  );
}

export function Lobby({
  tr,
  room,
  status,
  local,
  localVersion,
  hasVideo,
  mic,
  cam,
  onMic,
  onCam,
  onClose,
}: Props) {
  const now = useNow();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const reset = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(reset.current), []);

  const url = `${window.location.origin}/lab/omni#${room.code}`;
  const flash = (what: "code" | "link") => {
    setCopied(what);
    clearTimeout(reset.current);
    reset.current = setTimeout(() => setCopied(null), 2_000);
  };
  const copy = async (text: string, what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      flash(what);
    } catch {
      // Clipboard can be blocked; the code and link stay visible to copy by hand.
    }
  };
  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: tr("lobby.share_title"),
          text: tr("lobby.share_text"),
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copy(url, "link");
  };

  const elapsed = now === null ? 0 : (now - room.openedAt) / 1000;
  const peerFound = status.key === "lobby.peer_found";
  const showVideo = hasVideo && cam && local !== null;

  return (
    <Section id="omni-lobby" title={tr("lobby.title")} note={tr("lobby.share_code")}>
      <div className={styles.lobby}>
        <div className={styles.pane}>
          <header>
            <span>TX</span>
            <span>{tr("lobby.room_open")}</span>
          </header>
          <p className={styles.mini} aria-hidden="true">
            {tr("setup.code_label")}
          </p>
          <p className="vh">{tr("lobby.code_sr", { code: room.code.split("").join(" ") })}</p>
          <div
            className={styles.codeBoxes}
            style={{ "--n": room.code.length } as CSSProperties}
            aria-hidden="true"
            data-testid="omni-room-code"
          >
            {room.code.split("").map((char, index) => (
              <span key={index}>{char}</span>
            ))}
          </div>
          <div className={styles.row} data-wrap="">
            <Button size="sm" onClick={() => void copy(room.code, "code")}>
              {copied === "code" ? tr("lobby.copied") : tr("lobby.copy")}
            </Button>
            <Button size="sm" onClick={() => void share()}>
              {copied === "link" ? tr("lobby.link_copied") : tr("lobby.share_link")}
            </Button>
            <Button size="sm" onClick={onClose}>
              {tr("lobby.cancel")}
            </Button>
          </div>
          <div className={styles.urlbox}>
            <code>{url}</code>
          </div>
          <p className={styles.wait}>
            <i className={`${styles.led} ${styles.ledWait} ${styles.pulse}`} aria-hidden="true" />
            <span role="status">{tr(status.key, status.params)}</span>
            <span className={styles.timer}>{formatClock(elapsed)}</span>
          </p>
          <ol className={styles.steps}>
            <li className={styles.done}>{tr("lobby.step_server")}</li>
            <li className={styles.done}>{tr("lobby.step_room", { code: room.code })}</li>
            <li className={peerFound ? styles.done : undefined}>{tr("lobby.step_peer")}</li>
            <li>{tr("lobby.step_keys")}</li>
          </ol>
          {status.key === "lobby.new_room" && (
            <p className={styles.small}>{tr("lobby.code_changes_1")}</p>
          )}
        </div>

        <aside className={styles.side}>
          <div className={styles.pane}>
            <header>
              <span>CAM</span>
              <span>{tr("lobby.preview")}</span>
            </header>
            <div className={styles.self}>
              {showVideo ? (
                <StreamVideo stream={local} version={localVersion} muted />
              ) : (
                <span className={styles.off}>{tr("call.camera_off")}</span>
              )}
              <div className={styles.row}>
                <button className={styles.miniBtn} type="button" aria-pressed={mic} onClick={onMic}>
                  {tr("ctrl.mic")}
                </button>
                <button
                  className={styles.miniBtn}
                  type="button"
                  aria-pressed={cam}
                  disabled={!hasVideo}
                  onClick={onCam}
                >
                  {tr("ctrl.cam")}
                </button>
              </div>
            </div>
            <p className={styles.small}>
              {hasVideo ? tr("lobby.preview_hint") : tr("lobby.audio_only")}
            </p>
          </div>
          <JoinQr tr={tr} url={url} />
        </aside>
      </div>
    </Section>
  );
}
