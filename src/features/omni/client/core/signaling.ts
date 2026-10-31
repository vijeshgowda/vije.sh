import { OmniEvents } from "./events";
import {
  signalingMessageSchema,
  type Signal,
  type SignalingMessage,
  type SignalingRequest,
} from "./protocol";

export interface SignalingSocket extends EventTarget {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
}

type MessageEvents = {
  [Message in SignalingMessage as Message["type"]]: Message;
};
type SignalingEvents = MessageEvents & {
  disconnected: undefined;
  reconnecting: { attempt: number; max: number; delay: number };
  "reconnect-failed": { silent: boolean };
};

export class SignalingClient extends OmniEvents<SignalingEvents> {
  ws: SignalingSocket | null = null;
  phase: "idle" | "lobby" | "call" = "idle";
  roomCode: string | null = null;
  role: "creator" | "joiner" | null = null;
  private customCode = "";
  private intentionalClose = true;
  private attempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private socketListeners: AbortController | null = null;
  private pendingReject: ((error: Error) => void) | null = null;

  constructor(
    readonly serverUrl: string,
    private readonly socketFactory: (url: string) => SignalingSocket = (url) => new WebSocket(url),
  ) {
    super();
  }

  connect(): Promise<void> {
    if (this.pendingReject || this.ws || this.retryTimer) {
      return Promise.reject(new Error("Signalling client is already connecting or connected"));
    }
    this.intentionalClose = false;
    this.attempts = 0;
    return new Promise((resolve, reject) => {
      this.pendingReject = reject;
      this.openSocket(() => {
        this.pendingReject = null;
        resolve();
      });
    });
  }

  createRoom(customCode = "") {
    this.role = "creator";
    this.customCode = customCode;
    this.sendRequest({ type: "create", code: customCode });
  }

  recreateRoom() {
    this.createRoom(this.customCode);
  }

  joinRoom(code: string) {
    this.role = "joiner";
    this.sendRequest({ type: "join", code: code.toUpperCase().trim() });
  }

  sendSignal(payload: Signal) {
    this.sendRequest({ type: "signal", payload });
  }

  disconnect() {
    this.intentionalClose = true;
    this.phase = "idle";
    this.roomCode = null;
    this.role = null;
    this.clearConnectTimer();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.pendingReject?.(new Error("Signalling connection cancelled"));
    this.pendingReject = null;
    this.socketListeners?.abort();
    this.ws?.close();
    this.ws = null;
  }

  private clearConnectTimer() {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private openSocket(onOpen?: () => void) {
    if (this.intentionalClose) return;
    let socket: SignalingSocket;
    try {
      const url = new URL(this.serverUrl);
      if (url.protocol !== "ws:" && url.protocol !== "wss:") {
        throw new Error("Signalling URL must use ws or wss");
      }
      socket = this.socketFactory(this.serverUrl);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error("Invalid signalling server URL"));
      return;
    }
    this.socketListeners?.abort();
    const controller = new AbortController();
    this.socketListeners = controller;
    this.ws = socket;
    const options = { signal: controller.signal };
    this.connectTimer = setTimeout(() => this.fail(new Error("Connection timed out")), 30_000);

    socket.addEventListener(
      "open",
      () => {
        this.clearConnectTimer();
        this.attempts = 0;
        onOpen?.();
        if (this.phase === "lobby" && this.role === "creator" && this.roomCode) {
          this.sendRequest({ type: "rejoin", code: this.roomCode });
        }
      },
      options,
    );
    socket.addEventListener(
      "error",
      () => {
        this.fail(new Error("Could not reach signalling server"));
      },
      options,
    );
    socket.addEventListener(
      "message",
      (event) => {
        try {
          if (!(event instanceof MessageEvent) || typeof event.data !== "string") {
            throw new Error("Signalling message must be text");
          }
          const value: unknown = JSON.parse(event.data);
          const message = signalingMessageSchema.parse(value);
          if (message.type === "created" || message.type === "rejoined") {
            this.roomCode = message.code;
            this.phase = "lobby";
          } else if (message.type === "joined") {
            this.roomCode = message.code;
          }
          this.emit(message.type, message);
        } catch {
          this.emit("error", { type: "error", message: "Invalid signalling message" });
        }
      },
      options,
    );
    socket.addEventListener(
      "close",
      () => {
        controller.abort();
        this.clearConnectTimer();
        this.ws = null;
        if (this.intentionalClose) return;
        if (this.pendingReject) {
          this.fail(new Error("Signalling connection closed before opening"));
        } else if (this.phase === "idle") {
          this.emit("disconnected", undefined);
        } else {
          this.scheduleReconnect();
        }
      },
      options,
    );
  }

  private fail(error: Error) {
    this.clearConnectTimer();
    this.socketListeners?.abort();
    this.ws?.close();
    this.ws = null;
    if (this.pendingReject) {
      this.pendingReject(error);
      this.pendingReject = null;
    } else if (!this.intentionalClose && this.phase !== "idle") {
      this.scheduleReconnect();
    }
    this.emit("error", { type: "error", message: error.message });
  }

  private scheduleReconnect() {
    if (this.intentionalClose || this.retryTimer) return;
    const silent = this.phase === "call";
    if (this.attempts >= 6) {
      this.emit("reconnect-failed", { silent });
      return;
    }
    const delay = Math.min(1000 * 2 ** this.attempts, 30_000);
    this.attempts++;
    if (!silent) this.emit("reconnecting", { attempt: this.attempts, max: 6, delay });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.openSocket();
    }, delay);
  }

  private sendRequest(message: SignalingRequest) {
    if (!this.ws || this.ws.readyState !== 1) throw new Error("Signalling connection is not open");
    this.ws.send(JSON.stringify(message));
  }
}
