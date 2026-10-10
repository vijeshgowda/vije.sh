import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WelcomeState } from "../actions";

const nav = vi.hoisted(() => ({ pathname: "/lab", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
}));
const actions = vi.hoisted(() => ({
  signIn: vi.fn(async (_f: FormData) => {}),
  completeWelcome: vi.fn(async (prev: WelcomeState, _f: FormData): Promise<WelcomeState> => prev),
}));
vi.mock("../actions", () => actions);
vi.mock("@/components/ui/Turnstile", () => ({
  Turnstile: () => <input type="hidden" name="cf-turnstile-response" value="tok" />,
}));

const { LoginButtons, LoginForm } = await import("./LoginButtons");
const { UserMenu, hasSessionCookie } = await import("./UserMenu");
const { WelcomeForm } = await import("./WelcomeForm");

const member = { handle: "vije", displayName: "Vijesh", onboarded: true, roles: [] };

function session(user: object | null, { cookie = true, status = 200 } = {}) {
  document.cookie = cookie ? "test_session=x; path=/" : "test_session=; max-age=0; path=/";
  const fetch = vi.fn(async () => Response.json({ user }, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  nav.pathname = "/lab";
  nav.search = "";
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.cookie = "test_session=; max-age=0; path=/";
});

describe("hasSessionCookie()", () => {
  it("spots Supabase (chunked) and test session cookies", () => {
    expect(hasSessionCookie("a=1; sb-abc-auth-token=x")).toBe(true);
    expect(hasSessionCookie("sb-abc-auth-token.0=x")).toBe(true);
    expect(hasSessionCookie("test_session=x")).toBe(true);
    expect(hasSessionCookie("vj:theme=dark; sb-abc-other=x")).toBe(false);
    expect(hasSessionCookie("")).toBe(false);
  });
});

describe("LoginForm", () => {
  it("offers each provider and submits the chosen one with next", async () => {
    nav.search = "next=/forum";
    render(<LoginButtons />);
    await userEvent.click(screen.getByRole("button", { name: "Continue with Microsoft" }));
    const data = actions.signIn.mock.calls[0]![0];
    expect(data.get("provider")).toBe("azure");
    expect(data.get("next")).toBe("/forum");
  });

  it.each([
    ["oauth", /Couldn't reach/],
    ["provider", /isn't available/],
    ["anything", /didn't complete/],
  ])("explains error=%s", (error, text) => {
    render(<LoginForm next="" error={error} />);
    expect(screen.getByRole("alert")).toHaveTextContent(text);
  });

  it("shows no alert without an error", () => {
    render(<LoginForm next="" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("UserMenu", () => {
  it("links guests to sign-in without calling the server", async () => {
    const fetch = session(null, { cookie: false });
    render(<UserMenu />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?next=%2Flab",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("doesn't add next on the auth pages themselves", async () => {
    session(null, { cookie: false });
    nav.pathname = "/login";
    render(<UserMenu />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("asks unonboarded users to finish sign-up", async () => {
    session({ ...member, handle: null, onboarded: false });
    render(<UserMenu />);
    expect(await screen.findByRole("link", { name: "Finish sign-up" })).toHaveAttribute(
      "href",
      "/welcome",
    );
  });

  it("shows the member's handle and a sign-out form", async () => {
    session(member);
    render(<UserMenu />);
    await userEvent.click(await screen.findByText("@vije"));
    const button = screen.getByRole("button", { name: "Sign out" });
    expect(button.closest("form")).toHaveAttribute("action", "/auth/signout");
    expect(button.closest("form")).toHaveAttribute("method", "post");
  });

  it("re-checks the session after navigating", async () => {
    const fetch = session({ ...member, handle: null, onboarded: false });
    const { rerender } = render(<UserMenu />);
    await screen.findByRole("link", { name: "Finish sign-up" });
    fetch.mockResolvedValueOnce(Response.json({ user: member }));
    nav.pathname = "/forum";
    rerender(<UserMenu />);
    expect(await screen.findByText("@vije")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to guest when /api/me fails", async () => {
    session(member, { status: 500 });
    render(<UserMenu />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<UserMenu />);
    await waitFor(() => expect(screen.getAllByRole("link", { name: "Sign in" })).toHaveLength(2));
  });
});

describe("WelcomeForm", () => {
  it("asks guests to sign in first", async () => {
    session(null, { cookie: false });
    render(<WelcomeForm siteKey="k" />);
    expect(await screen.findByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?next=/welcome",
    );
  });

  it("tells onboarded members they're set and links to a safe next", async () => {
    nav.search = "next=//evil.example";
    session(member);
    render(<WelcomeForm siteKey="k" />);
    expect(await screen.findByText(/all set as @vije/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/");
  });

  it("prefills a handle and submits handle, consent, token and next", async () => {
    nav.search = "next=/lab";
    session({ ...member, handle: null, onboarded: false, displayName: "Ada Lovelace" });
    render(<WelcomeForm siteKey="k" />);
    const handle = await screen.findByLabelText("Handle");
    expect(handle).toHaveValue("Ada_Lovelace");
    await userEvent.click(screen.getByRole("checkbox", { name: /community guidelines/ }));
    await userEvent.click(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(actions.completeWelcome).toHaveBeenCalled());
    const data = actions.completeWelcome.mock.calls[0]![1];
    expect(Object.fromEntries(data)).toEqual({
      next: "/lab",
      handle: "Ada_Lovelace",
      accept: "on",
      "cf-turnstile-response": "tok",
    });
  });

  it("shows the server's error, marks the field and keeps the typed handle", async () => {
    session({ ...member, handle: null, onboarded: false });
    actions.completeWelcome.mockResolvedValueOnce({
      attempt: 1,
      error: "That handle is taken.",
      field: "handle",
      handle: "Taken",
    });
    render(<WelcomeForm siteKey="k" />);
    await userEvent.type(await screen.findByLabelText("Handle"), "Taken");
    await userEvent.click(screen.getByRole("checkbox", { name: /community guidelines/ }));
    await act(() => userEvent.click(screen.getByRole("button", { name: "Join" })));
    expect(await screen.findByText("That handle is taken.")).toBeInTheDocument();
    expect(screen.getByLabelText("Handle")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Handle")).toHaveValue("Taken");
  });
});
