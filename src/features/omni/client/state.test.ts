import { describe, expect, it } from "vitest";
import { initialState, omniReducer, type OmniAction, type OmniState } from "./state";

const stream = {} as MediaStream;
const run = (actions: OmniAction[], from: OmniState = initialState) =>
  actions.reduce(omniReducer, from);
const inCall = () =>
  run([
    { type: "media-request", mode: "create" },
    { type: "media-ready", stream, hasVideo: true },
    { type: "connecting" },
    {
      type: "lobby-open",
      code: "K7Q2M9",
      custom: false,
      at: 1_000,
      status: { key: "lobby.waiting" },
    },
    { type: "call-start", code: "K7Q2M9" },
  ]);

describe("omniReducer", () => {
  it("walks setup → media → connecting → lobby → call", () => {
    let state = omniReducer(initialState, { type: "media-request", mode: "join" });
    expect(state).toMatchObject({ phase: "media", mode: "join" });
    state = omniReducer(state, { type: "media-ready", stream, hasVideo: false });
    expect(state).toMatchObject({ local: stream, hasVideo: false, cam: false, mic: true });
    state = omniReducer(state, { type: "connecting" });
    expect(state).toMatchObject({ phase: "connecting", attempt: 1, alert: null });
    state = omniReducer(state, {
      type: "lobby-open",
      code: "ABCD",
      custom: true,
      at: 5,
      status: { key: "lobby.custom_ready" },
    });
    expect(state.room).toEqual({ code: "ABCD", custom: true, openedAt: 5 });
    expect(state.lobby).toEqual({ key: "lobby.custom_ready" });
    state = omniReducer(state, { type: "call-start", code: "K7Q2M9" });
    expect(state.phase).toBe("call");
    expect(state.call).toMatchObject({ connection: "connecting", secure: false, sasOpen: false });
  });

  it("keeps the lobby timer for the same code and restarts it for a new one", () => {
    const lobby = inCall();
    const same = omniReducer(lobby, {
      type: "lobby-open",
      code: "K7Q2M9",
      custom: false,
      at: 9_000,
      status: { key: "lobby.reconnected" },
    });
    expect(same.room?.openedAt).toBe(1_000);
    const fresh = omniReducer(lobby, {
      type: "lobby-open",
      code: "NEW1",
      custom: false,
      at: 9_000,
      status: { key: "lobby.new_room" },
    });
    expect(fresh.room?.openedAt).toBe(9_000);
    expect(
      omniReducer(fresh, { type: "lobby-status", status: { key: "lobby.peer_found" } }).lobby,
    ).toEqual({ key: "lobby.peer_found" });
  });

  it("tracks the call: connection, secure channel, stats, notices", () => {
    let state = inCall();
    state = omniReducer(state, { type: "remote", stream });
    expect(state.remote).toBe(stream);
    state = omniReducer(state, { type: "connection", state: "connected", at: 2_000 });
    expect(state.call).toMatchObject({ connection: "connected", startedAt: 2_000 });
    state = omniReducer(state, { type: "connection", state: "reconnecting" });
    state = omniReducer(state, { type: "connection", state: "connected", at: 9_999 });
    expect(state.call?.startedAt).toBe(2_000);
    state = omniReducer(state, {
      type: "secure",
      safety: { emoji: "🦊 🌙 🚀 🍎 ⚽", code: "3F9A C21E" },
      at: 3_000,
    });
    expect(state.call).toMatchObject({ secure: true, sasOpen: true, startedAt: 2_000 });
    state = omniReducer(state, { type: "sas-close" });
    expect(state.call?.sasOpen).toBe(false);
    state = omniReducer(state, { type: "stats", quality: "fair", label: "x", link: "relayed" });
    expect(state.call).toMatchObject({ quality: "fair", qualityLabel: "x", link: "relayed" });
    state = omniReducer(state, { type: "notice", text: "oops" });
    expect(state.call?.notice).toBe("oops");
  });

  it("starts the timer on secure when ICE never reported connected", () => {
    const state = omniReducer(inCall(), {
      type: "secure",
      safety: { emoji: "", code: "" },
      at: 4_000,
    });
    expect(state.call?.startedAt).toBe(4_000);
    expect(omniReducer(inCall(), { type: "connection", state: "connected" }).call?.startedAt).toBe(
      null,
    );
  });

  it("controls: mic clears the nudge, cam, flip bumps the local version", () => {
    let state = omniReducer(inCall(), { type: "mic", on: false });
    state = omniReducer(state, { type: "nudge", on: true });
    expect(state.call?.nudge).toBe(true);
    state = omniReducer(state, { type: "mic", on: true });
    expect(state).toMatchObject({ mic: true, call: { nudge: false } });
    expect(omniReducer(state, { type: "mic", on: false }).call?.nudge).toBe(false);
    expect(omniReducer(state, { type: "cam", on: false }).cam).toBe(false);
    const flipped = omniReducer(state, { type: "local-tracks", facing: "environment" });
    expect(flipped).toMatchObject({ facing: "environment", localVersion: state.localVersion + 1 });
  });

  it("ending closes the safety check; reset keeps the attempt counter", () => {
    let state = omniReducer(inCall(), {
      type: "secure",
      safety: { emoji: "", code: "" },
      at: 1,
    });
    state = omniReducer(state, { type: "ending", key: "end.peer_left" });
    expect(state.call).toMatchObject({ ending: "end.peer_left", sasOpen: false });
    state = omniReducer(state, { type: "reset", alert: { tone: "info", key: "end.peer_left" } });
    expect(state).toMatchObject({ phase: "setup", attempt: 1, call: null, local: null });
    expect(state.alert).toEqual({ tone: "info", key: "end.peer_left" });
    expect(omniReducer(state, { type: "dismiss-alert" }).alert).toBeNull();
    expect(omniReducer(state, { type: "reset" }).alert).toBeNull();
  });

  it("ignores call actions outside a call", () => {
    for (const action of [
      { type: "connection", state: "connected", at: 1 },
      { type: "sas-close" },
      { type: "nudge", on: true },
      { type: "notice", text: "x" },
    ] as OmniAction[]) {
      expect(omniReducer(initialState, action)).toBe(initialState);
    }
  });

  it("bumps the notice id so a repeated notice shows again", () => {
    let state = omniReducer(initialState, { type: "call-start", code: "K7Q2M9" });
    state = omniReducer(state, { type: "notice", text: "Connection lost." });
    const first = state.call!.noticeId;
    state = omniReducer(state, { type: "notice", text: "Connection lost." });
    expect(state.call!.noticeId).toBe(first + 1);
    state = omniReducer(state, { type: "notice", text: null });
    expect(state.call!.noticeId).toBe(first + 1);
  });
});
