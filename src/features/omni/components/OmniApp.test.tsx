import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OmniAction } from "../client/state";
import { OmniApp } from "./OmniApp";

const sessions = vi.hoisted(() => [] as FakeSession[]);
type FakeSession = {
  deps: { dispatch: (action: OmniAction) => void; signalingUrl: string };
  start: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  hangup: ReturnType<typeof vi.fn>;
  toggleMic: ReturnType<typeof vi.fn>;
  toggleCam: ReturnType<typeof vi.fn>;
  flip: ReturnType<typeof vi.fn>;
  confirmSas: ReturnType<typeof vi.fn>;
  rejectSas: ReturnType<typeof vi.fn>;
  setLevelListener: ReturnType<typeof vi.fn>;
  sendChat: ReturnType<typeof vi.fn>;
  typing: ReturnType<typeof vi.fn>;
  sendFiles: ReturnType<typeof vi.fn>;
  clearChat: ReturnType<typeof vi.fn>;
  toggleScreen: ReturnType<typeof vi.fn>;
  toggleRecording: ReturnType<typeof vi.fn>;
  announce: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};

vi.mock("../client/session", () => ({
  OmniSession: class {
    start = vi.fn(async () => undefined);
    cancel = vi.fn();
    hangup = vi.fn();
    toggleMic = vi.fn();
    toggleCam = vi.fn();
    flip = vi.fn(async () => undefined);
    confirmSas = vi.fn();
    rejectSas = vi.fn();
    setLevelListener = vi.fn();
    sendChat = vi.fn(async () => true);
    typing = vi.fn();
    sendFiles = vi.fn();
    clearChat = vi.fn();
    toggleScreen = vi.fn(async () => undefined);
    toggleRecording = vi.fn(async () => undefined);
    announce = vi.fn();
    dispose = vi.fn();
    constructor(public deps: FakeSession["deps"]) {
      sessions.push(this as unknown as FakeSession);
    }
  },
}));

const stream = {
  getTracks: () => [],
  getVideoTracks: () => [],
  getAudioTracks: () => [],
} as unknown as MediaStream;

function dispatch(...actions: OmniAction[]) {
  act(() => actions.forEach((action) => sessions.at(-1)!.deps.dispatch(action)));
}

async function startCreate() {
  const user = userEvent.setup();
  const view = render(<OmniApp signalingUrl="ws://localhost:8765" />);
  await user.click(screen.getByRole("button", { name: "Create Room" }));
  await waitFor(() => expect(sessions).toHaveLength(1));
  return { user, view, session: sessions[0]! };
}

async function startCall() {
  const env = await startCreate();
  dispatch(
    { type: "media-ready", stream, hasVideo: true },
    { type: "connecting" },
    {
      type: "lobby-open",
      code: "K7Q2M9",
      custom: false,
      at: Date.now(),
      status: { key: "lobby.waiting" },
    },
    { type: "call-start", code: "K7Q2M9" },
  );
  return env;
}

beforeEach(() => {
  sessions.length = 0;
  window.location.hash = "";
  HTMLMediaElement.prototype.play = vi.fn(async () => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("Omni setup", () => {
  it("renders create, join, password and the link spec", () => {
    render(<OmniApp signalingUrl="ws://localhost:8765" />);
    expect(screen.getByRole("heading", { name: "Link setup" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Room password/)).toHaveAttribute("type", "password");
    const spec = screen.getByRole("complementary", { name: "Link status" });
    expect(spec).toHaveTextContent("STUN 2 · TURN 3");
    expect(spec).toHaveTextContent("IDLE");
  });

  it("validates codes like the original and toggles the custom code", async () => {
    const user = userEvent.setup();
    render(<OmniApp signalingUrl="ws://localhost:8765" />);
    await user.click(screen.getByRole("button", { name: "Join" }));
    expect(screen.getByText("Enter a valid code (4-10 characters).")).toBeInTheDocument();
    expect(screen.getByLabelText("Room code")).toHaveAttribute("aria-invalid", "true");

    const toggle = screen.getByRole("button", { name: "Choose my own code" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.type(screen.getByLabelText("Custom code"), "ab");
    await user.click(screen.getByRole("button", { name: "Create Room" }));
    expect(
      screen.getByText("Custom codes must be between 4 and 10 characters."),
    ).toBeInTheDocument();
    expect(sessions).toHaveLength(0);
  });

  it("prefills the join code from a share link and joins with the password", async () => {
    window.location.hash = "#k7q2m9";
    const user = userEvent.setup();
    render(<OmniApp signalingUrl="ws://localhost:8765" />);
    expect(screen.getByLabelText("Room code")).toHaveValue("K7Q2M9");
    await user.type(screen.getByLabelText(/Room password/), "pw");
    await user.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(sessions).toHaveLength(1));
    expect(sessions[0]!.deps.signalingUrl).toBe("ws://localhost:8765");
    expect(sessions[0]!.start).toHaveBeenCalledWith({
      mode: "join",
      code: "K7Q2M9",
      password: "pw",
    });
  });

  it("shows media and connecting progress, then alerts with retry", async () => {
    const { user, session } = await startCreate();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Waiting for camera and microphone permission…",
    );
    expect(screen.getByRole("button", { name: "Create Room" })).toBeDisabled();
    dispatch({ type: "media-ready", stream, hasVideo: true }, { type: "connecting" });
    expect(screen.getByRole("status")).toHaveTextContent("Connecting to server…");
    expect(screen.getByText("LINKING")).toBeInTheDocument();

    dispatch({ type: "reset", alert: { tone: "error", key: "err.timeout", retry: true } });
    const alert = screen
      .getByText(/didn't answer within 30 seconds/)
      .closest<HTMLElement>("[role=alert]")!;
    await waitFor(() => expect(alert).toHaveFocus());
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(session.start).toHaveBeenCalledTimes(2);
    expect(session.start).toHaveBeenLastCalledWith({ mode: "create", code: "", password: "" });

    dispatch({ type: "reset", alert: { tone: "error", key: "alert.error", text: "Server busy" } });
    expect(screen.getByText("Server busy")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Server busy")).not.toBeInTheDocument();
  });

  it("renders the progress status inside the form whose button was pressed", async () => {
    const { session } = await startCreate();
    const createForm = screen.getByRole("button", { name: "Create Room" }).closest("form")!;
    expect(within(createForm).getByRole("status")).toHaveTextContent(
      "Waiting for camera and microphone permission…",
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
    dispatch({ type: "media-ready", stream, hasVideo: true }, { type: "connecting" });
    expect(within(createForm).getByRole("status")).toHaveTextContent("Connecting to server…");
    expect(screen.getByText("LINKING")).toBeInTheDocument();
    dispatch({ type: "reset", alert: { tone: "error", key: "err.timeout", retry: true } });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(session.start).toHaveBeenCalledTimes(1);
  });

  it("renders the join progress status inside the join form", async () => {
    window.location.hash = "#k7q2m9";
    const user = userEvent.setup();
    render(<OmniApp signalingUrl="ws://localhost:8765" />);
    await user.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(sessions).toHaveLength(1));
    const joinForm = screen.getByRole("button", { name: "Join" }).closest("form")!;
    expect(within(joinForm).getByRole("status")).toBeInTheDocument();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("Omni lobby", () => {
  it("shows the code accessibly, copies it, and closes the room", async () => {
    const { user, session } = await startCreate();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    dispatch(
      { type: "media-ready", stream, hasVideo: false },
      { type: "connecting" },
      {
        type: "lobby-open",
        code: "K7Q2M9",
        custom: false,
        at: Date.now(),
        status: { key: "lobby.waiting" },
      },
    );
    expect(screen.getByRole("heading", { name: "Waiting room" })).toHaveFocus();
    expect(screen.getByText("Room code K 7 Q 2 M 9")).toBeInTheDocument();
    expect(screen.getByTestId("omni-room-code")).toHaveAttribute("aria-hidden", "true");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Waiting for peer to join…");
    expect(status).not.toHaveTextContent("00:");
    expect(screen.getByText("http://localhost:3000/lab/omni#K7Q2M9")).toBeInTheDocument();
    expect(
      screen.getByText("No camera available. You'll join with audio only."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cam" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Copy Code" }));
    expect(writeText).toHaveBeenCalledWith("K7Q2M9");
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Share link" }));
    expect(writeText).toHaveBeenLastCalledWith("http://localhost:3000/lab/omni#K7Q2M9");
    await user.click(screen.getByRole("button", { name: "Mic" }));
    expect(session.toggleMic).toHaveBeenCalled();

    dispatch({ type: "lobby-status", status: { key: "lobby.new_room" } });
    expect(screen.getByText(/If the code changes after sharing/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(session.cancel).toHaveBeenCalled();
  });

  it("shares with the Web Share API when available", async () => {
    const { user } = await startCreate();
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    dispatch(
      { type: "media-ready", stream, hasVideo: true },
      {
        type: "lobby-open",
        code: "ABCD",
        custom: true,
        at: Date.now(),
        status: { key: "lobby.custom_ready" },
      },
    );
    await user.click(screen.getByRole("button", { name: "Share link" }));
    expect(share).toHaveBeenCalledWith(
      expect.objectContaining({ url: "http://localhost:3000/lab/omni#ABCD" }),
    );
    Reflect.deleteProperty(navigator, "share");
  });
});

describe("Omni call", () => {
  it("renders a full-screen dark dialog with stable toggle labels", async () => {
    const { user, session } = await startCall();
    const call = screen.getByTestId("omni-call");
    expect(call.tagName).toBe("DIALOG");
    expect(call).toHaveAttribute("data-theme", "dark");
    expect(call).toHaveAttribute("aria-label", "Call K7Q2M9");
    expect(call).toHaveTextContent("Securing");
    expect(call).not.toHaveTextContent("E2E");

    const toolbar = screen.getByRole("toolbar", { name: "Call controls" });
    const mic = within(toolbar).getByRole("button", { name: "Mic" });
    expect(mic).toHaveAttribute("aria-pressed", "true");
    await user.click(mic);
    expect(session.toggleMic).toHaveBeenCalled();
    dispatch({ type: "mic", on: false });
    expect(within(toolbar).getByRole("button", { name: "Mic" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await user.click(within(toolbar).getByRole("button", { name: "Cam" }));
    expect(session.toggleCam).toHaveBeenCalled();
    await user.click(within(toolbar).getByRole("button", { name: "Flip" }));
    expect(session.flip).toHaveBeenCalled();

    mic.focus();
    await user.keyboard("{ArrowRight}");
    expect(within(toolbar).getByRole("button", { name: "Cam" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(within(toolbar).getByRole("button", { name: "End" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(mic).toHaveFocus();
    await user.keyboard("{Home}{ArrowLeft}");
    expect(within(toolbar).getByRole("button", { name: "End" })).toHaveFocus();

    await user.click(within(toolbar).getByRole("button", { name: "End" }));
    expect(session.hangup).toHaveBeenCalled();
  });

  it("shows link, quality, timer and E2E only once secure", async () => {
    await startCall();
    const start = Date.now() - 65_000;
    dispatch(
      { type: "connection", state: "connected", at: start },
      { type: "stats", quality: "fair", label: "500kbps", link: "relayed" },
    );
    const call = screen.getByTestId("omni-call");
    expect(call).toHaveTextContent("Peer · relayed");
    expect(call).toHaveTextContent("Fair");
    await waitFor(() => expect(screen.getByTestId("omni-timer")).toHaveTextContent(/^01:[01]\d$/), {
      timeout: 2_000,
    });
    dispatch({ type: "stats", quality: "good", label: "x", link: "direct" });
    expect(call).toHaveTextContent("Peer · direct link");
    dispatch({ type: "connection", state: "reconnecting" });
    expect(within(call).getByText("Network changed. Reconnecting")).toBeInTheDocument();
    expect(call).toHaveTextContent("Peer · Reconnecting…");
  });

  it("safety check takes focus, Esc dismisses, and a mismatch is reported", async () => {
    const { user, session } = await startCall();
    dispatch({
      type: "secure",
      safety: { emoji: "🦊 🌙 🚀 🍎 ⚽", code: "3F9A C21E" },
      at: Date.now(),
    });
    const sas = screen.getByRole("dialog", { name: "Verify your peer" });
    expect(sas).toHaveTextContent("🦊 🌙 🚀 🍎 ⚽");
    expect(sas).toHaveTextContent("3F9A C21E");
    expect(within(sas).getByRole("button", { name: "They match" })).toHaveFocus();
    expect(screen.getByTestId("omni-call")).toHaveTextContent("E2E");
    await user.keyboard("{Escape}");
    expect(session.confirmSas).toHaveBeenCalled();
    await user.click(within(sas).getByRole("button", { name: "Don’t match" }));
    expect(session.rejectSas).toHaveBeenCalled();
    dispatch({ type: "sas-close" });
    expect(screen.queryByRole("dialog", { name: "Verify your peer" })).not.toBeInTheDocument();
  });

  it("More menu: arrow keys, Esc returns focus, move preview", async () => {
    const { user } = await startCall();
    const more = screen.getByRole("button", { name: "More" });
    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    const items = Array.from(menu.querySelectorAll("button"));
    expect(items.map((item) => item.textContent)).toEqual([
      "Flip camera ↻",
      "Record call (saved locally) .webm",
      "Send a file ↑",
      "Move my preview ↘",
    ]);
    expect(items[1]).toHaveAttribute("role", "menuitemcheckbox");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{End}");
    expect(items[3]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(more).toHaveFocus();

    await user.click(more);
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: /Move/ }));
    await user.click(more);
    expect(screen.getByRole("menuitem", { name: /Move/ })).toHaveTextContent("↙");
    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("self-view: Enter swaps feeds, arrows move it, a tap toggles the controls", async () => {
    const { user } = await startCall();
    const pip = screen.getByRole("button", { name: "Your camera" });
    expect(pip.className).toMatch(/br/);
    pip.focus();
    await user.keyboard("{ArrowUp}");
    expect(pip.className).toMatch(/tr/);
    await user.keyboard("{ArrowLeft}");
    expect(pip.className).toMatch(/tl/);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("button", { name: "Peer's camera" })).toBeInTheDocument();

    const stage = screen.getByTestId("omni-call").firstElementChild as HTMLElement;
    await user.click(stage);
    expect(stage.className).toMatch(/idle/);
    await user.click(stage);
    expect(stage.className).not.toMatch(/idle/);
  });

  it("drags the self-view to the nearest corner; a short tap swaps", async () => {
    await startCall();
    const pip = screen.getByRole("button", { name: "Your camera" });
    const stage = screen.getByTestId("omni-call").firstElementChild as HTMLElement;
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      top: 0,
      left: 0,
      width: 400,
      height: 800,
    } as DOMRect);
    fireEvent.pointerDown(pip, { button: 0, clientX: 350, clientY: 700 });
    fireEvent.pointerMove(pip, { clientX: 60, clientY: 80 });
    expect(pip.style.translate).toBe("-290px -620px");
    fireEvent.pointerUp(pip, { clientX: 60, clientY: 80 });
    expect(pip.className).toMatch(/tl/);
    fireEvent.pointerDown(pip, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(pip, { clientX: 11, clientY: 10 });
    expect(screen.getByRole("button", { name: "Peer's camera" })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Peer's camera" }), {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    fireEvent.pointerCancel(screen.getByRole("button", { name: "Peer's camera" }));
  });

  it("hides the controls after 4 s, writes the meter, and shows nudges and endings", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { session } = await startCall();
      const stage = screen.getByTestId("omni-call").firstElementChild as HTMLElement;
      act(() => vi.advanceTimersByTime(4_100));
      expect(stage.className).toMatch(/idle/);

      const listener = session.setLevelListener.mock.calls.at(-1)![0] as (level: number) => void;
      act(() => listener(0.5));
      const meter = screen
        .getByRole("button", { name: "Mic" })
        .querySelector("[aria-hidden=true]:last-child")!;
      expect(meter.querySelectorAll("i[class]").length).toBeGreaterThan(0);

      dispatch({ type: "mic", on: false }, { type: "nudge", on: true });
      expect(screen.getByText("You’re muted")).toBeInTheDocument();
      dispatch({ type: "notice", text: "Connection lost." });
      expect(screen.getByText("Connection lost.")).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(6_100));
      expect(screen.queryByText("Connection lost.")).not.toBeInTheDocument();
      dispatch({ type: "notice", text: "Connection lost." });
      expect(screen.getByText("Connection lost.")).toBeInTheDocument();

      dispatch({ type: "ending", key: "end.peer_left" });
      expect(screen.getByRole("alert")).toHaveTextContent("The other person left the call.");
      expect(stage.className).not.toMatch(/idle/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("disposes the session on unmount", async () => {
    const { view, session } = await startCall();
    view.unmount();
    expect(session.dispose).toHaveBeenCalled();
  });
});

describe("Omni chat and files", () => {
  const secure = () =>
    dispatch(
      { type: "connection", state: "connected", at: Date.now() },
      { type: "secure", safety: { emoji: "", code: "" }, at: Date.now() },
      { type: "sas-close" },
    );

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("sends messages, signals typing and renders the log as text", async () => {
    const { user, session } = await startCall();
    const sheet = screen.getByRole("region", { name: "Chat and files" });
    const input = within(sheet).getByRole("textbox", { name: "Message" });
    const send = within(sheet).getByRole("button", { name: "Send message" });
    expect(send).toBeDisabled();
    expect(sheet).toHaveTextContent("chat will be available once encrypted channel is ready");
    secure();
    expect(send).toBeEnabled();
    expect(sheet).toHaveTextContent("Paste or drop a file to send it, encrypted.");

    await user.type(input, "hi");
    expect(session.typing).toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(session.sendChat).toHaveBeenCalledWith("hi");
    await waitFor(() => expect(input).toHaveValue(""));

    session.sendChat.mockResolvedValueOnce(false);
    await user.type(input, "kept{Enter}");
    expect(input).toHaveValue("kept");

    dispatch(
      { type: "chat", from: "me", text: "hi", at: Date.now() },
      { type: "chat", from: "peer", text: "<b>yo</b>", at: Date.now() },
      { type: "system", message: { key: "sys.sent", params: { name: "a.txt" } }, at: Date.now() },
    );
    const log = within(sheet).getByRole("log", { name: "Message" });
    const items = within(log).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/You.*hi/);
    expect(items[1]).toHaveTextContent("Peer");
    expect(items[1]).toHaveTextContent("<b>yo</b>");
    expect(log.querySelector("b b")).toBeNull();
    expect(items[2]).toHaveTextContent("✓ Sent “a.txt”.");

    await user.click(within(sheet).getByRole("button", { name: "Clear" }));
    expect(session.clearChat).toHaveBeenCalled();
  });

  it("counts unread peer messages, shows a banner and goes to the chat", async () => {
    const { user } = await startCall();
    secure();
    dispatch({ type: "chat", from: "peer", text: "look at this", at: Date.now() });
    const chat = screen.getByRole("button", { name: /^Chat/ });
    expect(chat).toHaveAccessibleName("Chat 1 unread");
    const banner = screen.getByRole("button", { name: /New message/ });
    expect(banner).toHaveTextContent("look at this");
    await user.click(banner);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveFocus();

    dispatch({ type: "typing", on: true });
    expect(screen.getByTestId("omni-call")).toHaveTextContent("Peer is typing");
    await user.click(screen.getByRole("button", { name: /Scroll for chat/ }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: /Video/ }));
    expect(chat).toHaveFocus();
  });

  it("switches tabs with arrow keys and lists transfers with safe Save links", async () => {
    const { user } = await startCall();
    secure();
    dispatch(
      {
        type: "transfer-start",
        transfer: { key: "out:1", direction: "out", name: "deck.pdf", size: 2048, total: 4 },
      },
      { type: "transfer-progress", key: "out:1", done: 1 },
      {
        type: "transfer-start",
        transfer: { key: "in:2", direction: "in", name: "cat.png", size: 10, total: 1 },
      },
      { type: "transfer-done", key: "in:2", url: "blob:cat", preview: "image", at: Date.now() },
    );
    const log = screen.getByRole("log", { name: "Message" });
    const preview = within(log).getByRole("img", { name: "cat.png" });
    expect(preview).toHaveAttribute("src", "blob:cat");
    expect(within(log).getByText(/cat\.png · 10 B · SHA-256 ok/)).toBeInTheDocument();
    const save = within(log).getByRole("link", { name: "Save" });
    expect(save).toHaveAttribute("download", "cat.png");
    expect(save).not.toHaveAttribute("target");

    const chatTab = screen.getByRole("tab", { name: "Chat" });
    expect(chatTab).toHaveAttribute("aria-selected", "true");
    chatTab.focus();
    await user.keyboard("{ArrowRight}");
    const filesTab = screen.getByRole("tab", { name: "Files 2" });
    expect(filesTab).toHaveFocus();
    expect(filesTab).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: "Files 2" });
    const rows = within(panel).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Sending deck.pdf: 25%");
    expect(rows[1]).toHaveTextContent("Received · SHA-256 ok");
    expect(within(rows[1]!).getByRole("link", { name: "Save" })).toHaveAttribute(
      "download",
      "cat.png",
    );
    await user.keyboard("{Home}");
    expect(chatTab).toHaveFocus();
  });

  it("sends picked, pasted and dropped files; pasted text stays text", async () => {
    const { user, session } = await startCall();
    secure();
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    await user.upload(screen.getByTestId("omni-file-input"), file);
    expect(session.sendFiles).toHaveBeenLastCalledWith([file]);
    expect(screen.getByRole("tab", { name: "Files" })).toHaveAttribute("aria-selected", "true");

    const dialog = screen.getByTestId("omni-call");
    const paste = (types: string[], files: File[]) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.assign(event, { clipboardData: { types, files } });
      act(() => void dialog.dispatchEvent(event));
      return event;
    };
    expect(paste(["Files"], [file]).defaultPrevented).toBe(true);
    expect(session.sendFiles).toHaveBeenCalledTimes(2);
    expect(paste(["text/plain", "Files"], [file]).defaultPrevented).toBe(false);
    expect(session.sendFiles).toHaveBeenCalledTimes(2);

    const drag = (type: string, files: File[] = []) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { dataTransfer: { types: ["Files"], files } });
      act(() => void dialog.dispatchEvent(event));
    };
    drag("dragenter");
    expect(dialog).toHaveTextContent("Drop files to send");
    drag("dragleave");
    expect(dialog).not.toHaveTextContent("Drop files to send");
    drag("dragenter");
    drag("drop", [file]);
    expect(dialog).not.toHaveTextContent("Drop files to send");
    expect(session.sendFiles).toHaveBeenCalledTimes(3);

    const click = vi.spyOn(HTMLInputElement.prototype, "click");
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("menuitem", { name: /Send a file/ }));
    expect(click).toHaveBeenCalled();
  });
});

describe("Omni extras", () => {
  it("switches the language, remembers it and announces the change", async () => {
    const user = userEvent.setup();
    render(<OmniApp signalingUrl="ws://localhost:8765" />);
    const group = screen.getByRole("group", { name: "Language" });
    const english = within(group).getByRole("button", { name: "English" });
    expect(english).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getAllByRole("button")).toHaveLength(6);

    const kannada = within(group).getByRole("button", { name: "ಕನ್ನಡ" });
    expect(kannada).toHaveAttribute("lang", "kn");
    await user.click(kannada);
    expect(kannada).toHaveAttribute("aria-pressed", "true");
    expect(english).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { name: "ಲಿಂಕ್ ಸೆಟಪ್" })).toBeInTheDocument();
    expect(screen.getByTestId("omni-lang-status")).toHaveTextContent("ಕನ್ನಡ");
    expect(screen.getByTestId("omni-lang-status").closest("[lang]")).toHaveAttribute("lang", "kn");
    expect(localStorage.getItem("vj:omni-lang")).toBe('"kn"');
  });

  it("shows the join link as a QR code in the lobby", async () => {
    await startCreate();
    dispatch(
      { type: "media-ready", stream, hasVideo: true },
      { type: "connecting" },
      {
        type: "lobby-open",
        code: "K7Q2M9",
        custom: false,
        at: Date.now(),
        status: { key: "lobby.waiting" },
      },
    );
    const qr = screen.getByRole("img", { name: "QR code for the join link" });
    await waitFor(() => expect(qr.querySelector("svg path")).toHaveAttribute("d"));
    expect(qr.querySelector("svg")).toHaveAttribute("viewBox");
    expect(screen.getByText("Scan to join")).toBeInTheDocument();
  });

  it("shares the screen from the toolbar and the menu", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: vi.fn() },
      configurable: true,
    });
    try {
      const { user, session } = await startCall();
      const share = screen.getByRole("button", { name: "Screen" });
      expect(share).toHaveAttribute("aria-pressed", "false");
      await user.click(share);
      expect(session.toggleScreen).toHaveBeenCalledTimes(1);

      dispatch({ type: "screen", stream });
      expect(share).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("omni-local-video").closest("[data-pip]")).not.toHaveClass(
        /mirror/,
      );
      await user.click(screen.getByRole("button", { name: "More" }));
      const item = screen.getByRole("menuitemcheckbox", { name: /Share screen/ });
      expect(item).toHaveAttribute("aria-checked", "true");
      expect(item).toHaveTextContent("ON");
      await user.click(item);
      expect(session.toggleScreen).toHaveBeenCalledTimes(2);
    } finally {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });

  it("hides screen sharing in an audio-only call", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: vi.fn() },
      configurable: true,
    });
    try {
      const { user } = await startCreate();
      dispatch(
        { type: "media-ready", stream, hasVideo: false },
        { type: "connecting" },
        {
          type: "lobby-open",
          code: "K7Q2M9",
          custom: false,
          at: Date.now(),
          status: { key: "lobby.waiting" },
        },
        { type: "call-start", code: "K7Q2M9" },
      );
      expect(screen.queryByRole("button", { name: "Screen" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "More" }));
      expect(screen.queryByRole("menuitemcheckbox", { name: /Share screen/ })).toBeNull();
    } finally {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });

  it("records locally and shows a REC badge", async () => {
    const { user, session } = await startCall();
    expect(screen.queryByTestId("omni-rec")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: /Record call/ }));
    expect(session.toggleRecording).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    dispatch({ type: "recording", on: true });
    expect(screen.getByTestId("omni-rec")).toHaveTextContent("RECRecording");
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menuitemcheckbox", { name: /Record call/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    dispatch({ type: "recording", on: false });
    expect(screen.queryByTestId("omni-rec")).not.toBeInTheDocument();
  });

  it("shows a video whole when its orientation differs from the screen's", async () => {
    const matchMedia = window.matchMedia;
    let portrait = false;
    window.matchMedia = ((query: string) => ({
      matches: query === "(orientation: portrait)" ? portrait : false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    const size = (video: HTMLVideoElement, width: number, height: number) => {
      Object.defineProperty(video, "videoWidth", { value: width, configurable: true });
      Object.defineProperty(video, "videoHeight", { value: height, configurable: true });
      act(() => void video.dispatchEvent(new Event("resize")));
    };
    try {
      await startCall();
      dispatch({ type: "remote", stream });
      const video = screen.getByTestId("omni-remote-video") as HTMLVideoElement;
      const tile = video.parentElement!;
      expect(tile).not.toHaveClass(/whole/);

      // A phone's portrait camera on a landscape laptop is letterboxed, not cropped.
      size(video, 720, 1280);
      expect(tile).toHaveClass(/whole/);
      expect(tile).toHaveAttribute("data-shape", "portrait");
      size(video, 1280, 720);
      expect(tile).not.toHaveClass(/whole/);

      // A laptop camera or shared screen on a portrait phone is shown whole too.
      size(video, 720, 1280);
      portrait = true;
      size(video, 1280, 720);
      expect(tile).toHaveClass(/whole/);

      // Swapped into the self-view, the peer's video takes its own shape there instead.
      const pip = screen.getByRole("button", { name: "Your camera" });
      fireEvent.pointerDown(pip, { button: 0, clientX: 10, clientY: 10 });
      fireEvent.pointerUp(pip, { clientX: 10, clientY: 10 });
      expect(tile).toHaveAttribute("data-pip");
      expect(tile).not.toHaveClass(/whole/);
      expect(tile).toHaveAttribute("data-shape", "landscape");
    } finally {
      window.matchMedia = matchMedia;
    }
  });

  it("puts the peer's video in Picture in Picture, or says why it can't", async () => {
    const { user, session } = await startCall();
    dispatch({ type: "remote", stream });
    const more = screen.getByRole("button", { name: "More" });
    const pipItem = () => screen.getByRole("menuitemcheckbox", { name: /Picture in Picture/ });

    await user.click(more);
    await user.click(pipItem());
    expect(session.announce).toHaveBeenLastCalledWith({ key: "sys.pip_unsupported" });

    const video = screen.getByTestId("omni-remote-video") as HTMLVideoElement;
    Object.defineProperty(document, "pictureInPictureEnabled", { value: true, configurable: true });
    const request = vi.fn(async () => {
      Object.defineProperty(document, "pictureInPictureElement", {
        value: video,
        configurable: true,
      });
      video.dispatchEvent(new Event("enterpictureinpicture"));
      return {} as PictureInPictureWindow;
    });
    const exit = vi.fn(async () => {
      Object.defineProperty(document, "pictureInPictureElement", {
        value: null,
        configurable: true,
      });
      video.dispatchEvent(new Event("leavepictureinpicture"));
    });
    video.requestPictureInPicture = request;
    document.exitPictureInPicture = exit;
    try {
      await user.click(more);
      await user.click(pipItem());
      expect(session.announce).toHaveBeenLastCalledWith({ key: "sys.pip_error" });
      expect(request).not.toHaveBeenCalled();

      Object.defineProperty(video, "readyState", { value: 4, configurable: true });
      await user.click(more);
      await user.click(pipItem());
      expect(request).toHaveBeenCalledTimes(1);
      await user.click(more);
      expect(pipItem()).toHaveAttribute("aria-checked", "true");
      await user.click(pipItem());
      expect(exit).toHaveBeenCalledTimes(1);
      await user.click(more);
      expect(pipItem()).toHaveAttribute("aria-checked", "false");
    } finally {
      Reflect.deleteProperty(document, "pictureInPictureEnabled");
      Reflect.deleteProperty(document, "pictureInPictureElement");
      Reflect.deleteProperty(document, "exitPictureInPicture");
    }
  });
});
