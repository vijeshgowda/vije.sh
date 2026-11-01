"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { t, type TranslationKey } from "../i18n";
import { languagePreference } from "../i18n/preference";
import { ICE_SERVERS } from "../config";
import { initialState, omniReducer, type Params } from "../client/state";
import type { OmniSession } from "../client/session";
import { Setup, type SetupRequest } from "./Setup";
import { Lobby } from "./Lobby";
import { Call } from "./Call";
import styles from "./Omni.module.css";

export type Translate = (key: TranslationKey, params?: Params) => string;

type SessionModule = typeof import("../client/session");
let sessionModule: Promise<SessionModule> | null = null;

/** The session (signalling, WebRTC, crypto) only downloads once someone shows intent to call. */
export function prefetchSession(): Promise<SessionModule> {
  sessionModule ??= import("../client/session").catch((error: unknown) => {
    sessionModule = null;
    throw error;
  });
  return sessionModule;
}

export function OmniApp({ signalingUrl }: { signalingUrl: string }) {
  const language = languagePreference.use();
  const tr = useCallback<Translate>((key, params) => t(language, key, params), [language]);
  const [state, dispatch] = useReducer(omniReducer, initialState);
  const [request, setRequest] = useState<SetupRequest | null>(null);
  const session = useRef<OmniSession | null>(null);
  const mounted = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const lastPhase = useRef(state.phase);
  const onLevel = useCallback(
    (listener: ((level: number) => void) | null) => session.current?.setLevelListener(listener),
    [],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      // Leaving the page (palette, back, link) ends the call and releases camera and microphone.
      mounted.current = false;
      session.current?.dispose();
      session.current = null;
    };
  }, []);

  const start = useCallback(
    async (next: SetupRequest) => {
      setRequest(next);
      dispatch({ type: "media-request", mode: next.mode });
      let mod: SessionModule;
      try {
        mod = await prefetchSession();
      } catch {
        if (mounted.current)
          dispatch({
            type: "reset",
            alert: { tone: "error", key: "err.connect_failed", retry: true },
          });
        return;
      }
      if (!mounted.current) return;
      session.current ??= new mod.OmniSession({ signalingUrl, iceServers: ICE_SERVERS, dispatch });
      void session.current.start(next);
    },
    [signalingUrl],
  );

  // Move focus to the new view's heading (or the alert) when the view changes, never on first load.
  const view = state.phase === "media" || state.phase === "connecting" ? "setup" : state.phase;
  useEffect(() => {
    const previous = lastPhase.current;
    lastPhase.current = view;
    if (previous === view || view === "call") return;
    const target =
      root.current?.querySelector<HTMLElement>("[data-omni-focus]") ??
      root.current?.querySelector<HTMLElement>("h2");
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus();
  }, [view]);

  // A new alert on the same view (e.g. a failed Create, whose button was disabled) also takes focus.
  const alert = state.alert;
  useEffect(() => {
    if (alert) root.current?.querySelector<HTMLElement>("[data-omni-focus]")?.focus();
  }, [alert]);

  return (
    <div ref={root} lang={language} className={styles.app}>
      {view === "setup" && (
        <Setup
          tr={tr}
          phase={state.phase}
          mode={state.mode}
          attempt={state.attempt}
          alert={state.alert}
          defaults={request}
          onStart={(next) => void start(next)}
          onRetry={() => request && void start(request)}
          onDismiss={() => dispatch({ type: "dismiss-alert" })}
          onPrefetch={() => void prefetchSession().catch(() => undefined)}
        />
      )}
      {view === "lobby" && state.room && (
        <Lobby
          tr={tr}
          room={state.room}
          status={state.lobby}
          local={state.local}
          localVersion={state.localVersion}
          hasVideo={state.hasVideo}
          mic={state.mic}
          cam={state.cam}
          onMic={() => session.current?.toggleMic()}
          onCam={() => session.current?.toggleCam()}
          onClose={() => session.current?.cancel()}
        />
      )}
      {view === "call" && state.call && (
        <Call
          tr={tr}
          code={state.call.code}
          call={state.call}
          local={state.local}
          localVersion={state.localVersion}
          remote={state.remote}
          hasVideo={state.hasVideo}
          mic={state.mic}
          cam={state.cam}
          facing={state.facing}
          onMic={() => session.current?.toggleMic()}
          onCam={() => session.current?.toggleCam()}
          onFlip={() => void session.current?.flip()}
          onEnd={() => session.current?.hangup()}
          onSasMatch={() => session.current?.confirmSas()}
          onSasReject={() => session.current?.rejectSas()}
          onLevel={onLevel}
          onSend={async (text) => (await session.current?.sendChat(text)) ?? false}
          onTyping={() => session.current?.typing()}
          onFiles={(files) => session.current?.sendFiles(files)}
          onClear={() => session.current?.clearChat()}
        />
      )}
    </div>
  );
}
