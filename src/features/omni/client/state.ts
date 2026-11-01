import type { SafetyString } from "./core/crypto";
import type { PreviewKind } from "./core/files";
import type { QualityLevel } from "./core/quality";
import type { TranslationKey } from "../i18n";

export type Mode = "create" | "join";
export type Params = Record<string, string | number>;
export type Message = { key: TranslationKey; params?: Params };
/** `text` is untranslated server text, shown when the server sends an error we don't recognise. */
export type Alert = Message & { tone: "error" | "info"; text?: string; retry?: boolean };
export type Connection = "connecting" | "connected" | "reconnecting" | "failed";
export type LinkType = "direct" | "relayed" | "unknown";

/** Oldest chat items are dropped past this, so a long call can't grow the log without bound. */
export const MAX_MESSAGES = 500;
/** As in the original: a chat message is cut to 4000 characters, on both ends. */
export const MAX_CHAT = 4_000;

export type ChatItem =
  | { id: number; kind: "chat"; from: "me" | "peer"; text: string; at: number }
  | { id: number; kind: "system"; message: Message; at: number }
  | { id: number; kind: "file"; transfer: string; at: number };

export type Transfer = {
  /** `in:<fileId>` or `out:<fileId>`; the two directions have separate ID spaces. */
  key: string;
  direction: "in" | "out";
  name: string;
  size: number;
  done: number;
  total: number;
  status: "active" | "done" | "failed";
  /** Object URL of a received, verified file; owned (and revoked) by the session. */
  url: string | null;
  preview: PreviewKind | null;
};

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
  messages: ChatItem[];
  nextId: number;
  transfers: Transfer[];
  typing: boolean;
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
  | { type: "chat"; from: "me" | "peer"; text: string; at: number }
  | { type: "system"; message: Message; at: number }
  | { type: "typing"; on: boolean }
  | {
      type: "transfer-start";
      transfer: Pick<Transfer, "key" | "direction" | "name" | "size" | "total">;
    }
  | { type: "transfer-progress"; key: string; done: number }
  | {
      type: "transfer-done";
      key: string;
      url: string | null;
      preview: PreviewKind | null;
      at: number;
    }
  | { type: "transfer-failed"; key: string }
  | { type: "chat-clear"; at: number }
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
  messages: [],
  nextId: 1,
  transfers: [],
  typing: false,
};

function withCall(state: OmniState, patch: Partial<CallState>): OmniState {
  return state.call ? { ...state, call: { ...state.call, ...patch } } : state;
}

type NewItem =
  | Omit<Extract<ChatItem, { kind: "chat" }>, "id">
  | Omit<Extract<ChatItem, { kind: "system" }>, "id">
  | Omit<Extract<ChatItem, { kind: "file" }>, "id">;

function addItem(call: CallState, item: NewItem): Partial<CallState> {
  const messages = [...call.messages, { ...item, id: call.nextId } as ChatItem];
  return { messages: messages.slice(-MAX_MESSAGES), nextId: call.nextId + 1 };
}

function patchTransfer(call: CallState, key: string, patch: Partial<Transfer>): Transfer[] {
  return call.transfers.map((transfer) =>
    transfer.key === key ? { ...transfer, ...patch } : transfer,
  );
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
    case "chat": {
      const call = state.call;
      if (!call) return state;
      const item = { kind: "chat", from: action.from, text: action.text, at: action.at } as const;
      return withCall(state, {
        ...addItem(call, item),
        typing: action.from === "peer" ? false : call.typing,
      });
    }
    case "system":
      return state.call
        ? withCall(
            state,
            addItem(state.call, { kind: "system", message: action.message, at: action.at }),
          )
        : state;
    case "typing":
      return withCall(state, { typing: action.on });
    case "transfer-start": {
      const call = state.call;
      if (!call) return state;
      const transfer: Transfer = {
        ...action.transfer,
        done: 0,
        status: "active",
        url: null,
        preview: null,
      };
      return withCall(state, {
        transfers: [...call.transfers.filter((t) => t.key !== transfer.key), transfer],
      });
    }
    case "transfer-progress":
      return state.call
        ? withCall(state, {
            transfers: patchTransfer(state.call, action.key, { done: action.done }),
          })
        : state;
    case "transfer-done": {
      const call = state.call;
      const transfer = call?.transfers.find((t) => t.key === action.key);
      if (!call || !transfer) return state;
      const transfers = patchTransfer(call, action.key, {
        status: "done",
        done: transfer.total,
        url: action.url,
        preview: action.preview,
      });
      // A received file also shows in the chat log, with its preview and Save link.
      const item = action.url
        ? addItem(call, { kind: "file", transfer: action.key, at: action.at })
        : {};
      return withCall(state, { transfers, ...item });
    }
    case "transfer-failed":
      return state.call
        ? withCall(state, {
            transfers: patchTransfer(state.call, action.key, { status: "failed", url: null }),
          })
        : state;
    case "chat-clear": {
      const call = state.call;
      if (!call) return state;
      return withCall(state, {
        messages: [],
        transfers: call.transfers.filter((transfer) => transfer.status === "active"),
        ...addItem(
          { ...call, messages: [] },
          { kind: "system", message: { key: "sys.chat_cleared" }, at: action.at },
        ),
      });
    }
    case "reset":
      return { ...initialState, attempt: state.attempt, alert: action.alert ?? null };
    case "dismiss-alert":
      return { ...state, alert: null };
  }
}
