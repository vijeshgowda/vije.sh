"use client";

import { useEffect, useRef, useState } from "react";

interface TurnstileApi {
  render(
    el: HTMLElement,
    opts: {
      sitekey: string;
      action: string;
      theme: "light" | "dark";
      "response-field": boolean;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => boolean;
    },
  ): string | undefined;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | undefined;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = undefined;
      s.remove();
      reject(new Error("turnstile"));
    };
    document.head.append(s);
  });
  return loading;
}

/**
 * Cloudflare Turnstile (application.md 10.2). Renders the managed widget and submits its token in a
 * hidden `cf-turnstile-response` field. Tokens are single-use: remount (change `key`) to get a new
 * one after a failed submit. The page needs the Turnstile CSP (security-headers.ts).
 */
export function Turnstile({ siteKey, action }: { siteKey: string; action: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let id: string | undefined;
    let gone = false;
    loadScript().then(
      () => {
        if (gone || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          action,
          theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
          "response-field": false,
          callback: (t) => {
            setToken(t);
            setFailed(false);
          },
          "expired-callback": () => setToken(""),
          "error-callback": () => {
            setFailed(true);
            return true;
          },
        });
      },
      () => {
        if (!gone) setFailed(true);
      },
    );
    return () => {
      gone = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey, action]);

  return (
    <div>
      <div ref={box} />
      <input type="hidden" name="cf-turnstile-response" value={token} />
      {failed && (
        <p role="alert">
          The human check didn&apos;t load. Allow challenges.cloudflare.com or reload the page.
        </p>
      )}
    </div>
  );
}
