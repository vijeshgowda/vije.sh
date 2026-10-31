import { act, render, screen, waitFor, within } from "@testing-library/react";
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
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Flip camera ↻", "Move my preview ↘"]);
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{End}");
    expect(items[1]).toHaveFocus();
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
    const { fireEvent } = await import("@testing-library/react");
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
