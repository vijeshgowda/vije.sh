import type { SafetyString } from "./core/crypto";
import type { QualityLevel } from "./core/quality";
import type { TranslationKey } from "../i18n";

export type Mode = "create" | "join";
export type Params = Record<string, string | number>;
export type Message = { key: TranslationKey; params?: Params };
/** `text` is untranslated server text, shown when the server sends an error we don't recognise. */
export type Alert = Message & { tone: "error" | "info"; text?: string; retry?: boolean };
export type Connection = "connecting" | "connected" | "reconnecting" | "failed";
export type LinkType = "direct" | "relayed" | "unknown";

export type CallState = {
  code: string;
  connection: Connection;
  secure: boolean;
  safety: SafetyString | null;
  sasOpen: boolean;
  link: LinkType;
  quality: QualityLevel | null;
  qualityLabel: string;
  startedAt: number | null;
  ending: TranslationKey | null;
  nudge: boolean;
  notice: string | null;
  /** Bumped on every notice, so a repeated message shows again. */
  noticeId: number;
};

export type OmniState = {
  phase: "setup" | "media" | "connecting" | "lobby" | "call";
  mode: Mode | null;
  /** Increments on every connect attempt, so the progress bar restarts. */
  attempt: number;
  alert: Alert | null;
  room: { code: string; custom: boolean; openedAt: number } | null;
  lobby: Message;
  local: MediaStream | null;
  /** Bumped when the local stream's tracks change (camera flip), so <video> re-binds. */
  localVersion: number;
  remote: MediaStream | null;
  hasVideo: boolean;
  mic: boolean;
  cam: boolean;
  facing: "user" | "environment";
  call: CallState | null;
};

export type OmniAction =
  | { type: "media-request"; mode: Mode }
  | { type: "media-ready"; stream: MediaStream; hasVideo: boolean }
  | { type: "connecting" }
  | { type: "lobby-open"; code: string; custom: boolean; at: number; status: Message }
  | { type: "lobby-status"; status: Message }
  | { type: "call-start"; code: string }
  | { type: "remote"; stream: MediaStream }
  | { type: "connection"; state: Connection; at?: number }
  | { type: "secure"; safety: SafetyString; at: number }
  | { type: "sas-close" }
  | { type: "stats"; quality: QualityLevel; label: string; link: LinkType }
  | { type: "notice"; text: string | null }
  | { type: "mic"; on: boolean }
  | { type: "cam"; on: boolean }
  | { type: "local-tracks"; facing: "user" | "environment" }
  | { type: "nudge"; on: boolean }
  | { type: "ending"; key: TranslationKey }
  | { type: "reset"; alert?: Alert | null }
  | { type: "dismiss-alert" };

export const initialState: OmniState = {
  phase: "setup",
  mode: null,
  attempt: 0,
  alert: null,
  room: null,
  lobby: { key: "lobby.waiting" },
  local: null,
  localVersion: 0,
  remote: null,
  hasVideo: false,
  mic: true,
  cam: true,
  facing: "user",
  call: null,
};

const newCall: Omit<CallState, "code"> = {
  connection: "connecting",
  secure: false,
  safety: null,
  sasOpen: false,
  link: "unknown",
  quality: null,
  qualityLabel: "",
  startedAt: null,
  ending: null,
  nudge: false,
  notice: null,
  noticeId: 0,
};

function withCall(state: OmniState, patch: Partial<CallState>): OmniState {
  return state.call ? { ...state, call: { ...state.call, ...patch } } : state;
}

export function omniReducer(state: OmniState, action: OmniAction): OmniState {
  switch (action.type) {
    case "media-request":
      return { ...initialState, attempt: state.attempt, phase: "media", mode: action.mode };
    case "media-ready":
      return {
        ...state,
        local: action.stream,
        hasVideo: action.hasVideo,
        mic: true,
        cam: action.hasVideo,
        facing: "user",
      };
    case "connecting":
      return { ...state, phase: "connecting", attempt: state.attempt + 1, alert: null };
    case "lobby-open":
      return {
        ...state,
        phase: "lobby",
        room: {
          code: action.code,
          custom: action.custom,
          openedAt: state.room?.code === action.code ? state.room.openedAt : action.at,
        },
        lobby: action.status,
      };
    case "lobby-status":
      return { ...state, lobby: action.status };
    case "call-start":
      return { ...state, phase: "call", call: { ...newCall, code: action.code } };
    case "remote":
      return { ...state, remote: action.stream };
    case "connection": {
      const call = state.call;
      if (!call) return state;
      const startedAt =
        action.state === "connected" ? (call.startedAt ?? action.at ?? null) : call.startedAt;
      return withCall(state, { connection: action.state, startedAt });
    }
    case "secure":
      return withCall(state, {
        secure: true,
        safety: action.safety,
        sasOpen: true,
        startedAt: state.call?.startedAt ?? action.at,
      });
    case "sas-close":
      return withCall(state, { sasOpen: false });
    case "stats":
      return withCall(state, {
        quality: action.quality,
        qualityLabel: action.label,
        link: action.link,
      });
    case "notice":
      return withCall(state, {
        notice: action.text,
        noticeId: (state.call?.noticeId ?? 0) + (action.text ? 1 : 0),
      });
    case "mic":
      return {
        ...withCall(state, action.on ? { nudge: false } : {}),
        mic: action.on,
      };
    case "cam":
      return { ...state, cam: action.on };
    case "local-tracks":
      return { ...state, facing: action.facing, localVersion: state.localVersion + 1 };
    case "nudge":
      return withCall(state, { nudge: action.on });
    case "ending":
      return withCall(state, { ending: action.key, sasOpen: false });
    case "reset":
      return { ...initialState, attempt: state.attempt, alert: action.alert ?? null };
    case "dismiss-alert":
      return { ...state, alert: null };
  }
}
