import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Turnstile } from "./Turnstile";

type Opts = {
  callback: (t: string) => void;
  "expired-callback": () => void;
  "error-callback": () => boolean;
  theme: string;
};

afterEach(() => {
  delete window.turnstile;
  document.head.querySelectorAll("script").forEach((s) => s.remove());
});

const field = () =>
  document.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]')!;

describe("Turnstile", () => {
  it("renders the widget and puts the token in the hidden field", async () => {
    let opts: Opts | undefined;
    const remove = vi.fn();
    window.turnstile = {
      render: vi.fn((_el, o) => {
        opts = o as Opts;
        return "w1";
      }),
      remove,
    };
    const { unmount } = render(<Turnstile siteKey="k" action="welcome" />);
    await vi.waitFor(() => expect(opts).toBeDefined());
    expect(window.turnstile.render).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ sitekey: "k", action: "welcome", "response-field": false }),
    );
    expect(opts!.theme).toBe("light");
    act(() => opts!.callback("tok"));
    expect(field().value).toBe("tok");
    act(() => opts!["expired-callback"]());
    expect(field().value).toBe("");
    act(() => {
      opts!["error-callback"]();
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/didn't load/);
    unmount();
    expect(remove).toHaveBeenCalledWith("w1");
  });

  it("loads Cloudflare's script once and reports a blocked script", async () => {
    render(<Turnstile siteKey="k" action="welcome" />);
    const script = document.head.querySelector<HTMLScriptElement>("script")!;
    expect(script.src).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    );
    act(() => script.dispatchEvent(new Event("error")));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(document.head.querySelector("script")).toBeNull();
  });

  it("renders after the script loads, in the dark theme when the site is dark", async () => {
    document.documentElement.dataset.theme = "dark";
    render(<Turnstile siteKey="k" action="welcome" />);
    const script = document.head.querySelector<HTMLScriptElement>("script")!;
    const render2 = vi.fn((_el: HTMLElement, _o: Opts) => "w2");
    window.turnstile = { render: render2 as never, remove: vi.fn() };
    act(() => script.dispatchEvent(new Event("load")));
    await vi.waitFor(() => expect(render2).toHaveBeenCalled());
    expect(render2.mock.calls[0]![1].theme).toBe("dark");
  });
});
