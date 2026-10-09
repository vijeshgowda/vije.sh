"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { storage } from "@/lib/storage";
import { ago } from "../format";
import { FEED_BY_KEY, type FeedKey, type ServerFeedKey } from "../catalog";
import type { FeedResult } from "../types";
import { useNow } from "../client/use-now";
import { BODIES } from "./bodies";
import { IssFeed } from "./IssFeed";
import { MoonFeed } from "./MoonFeed";
import { WeatherFeed } from "./WeatherFeed";
import s from "./Feeds.module.css";

export type FeedStatus =
  | { kind: "standby" | "acquiring" | "nosignal" | "computed" }
  | { kind: "live" | "stale"; at: number };

function statusText(st: FeedStatus, now: number | null): string {
  switch (st.kind) {
    case "standby":
      return "STANDBY";
    case "acquiring":
      return "ACQUIRING";
    case "nosignal":
      return "NO SIGNAL";
    case "computed":
      return "COMPUTED";
    case "live":
      if (now === null) return "LIVE";
      return now - st.at < 60_000 ? "LIVE" : `UPDATED ${ago(st.at, now)}`;
    case "stale":
      return now === null ? "STALE" : `STALE ${ago(st.at, now)}`;
  }
}

const dotOf = (st: FeedStatus) =>
  st.kind === "live" ? "live" : st.kind === "stale" || st.kind === "nosignal" ? "warn" : undefined;

function Skeleton() {
  return (
    <div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={s.fsk} />
      ))}
    </div>
  );
}

/**
 * Server feed data: uses the prerendered result when given, otherwise fetches /api/feeds/[key]
 * once the card is within 300px of the viewport. Keeps the last good result in localStorage and
 * shows it as STALE if the server reports an upstream failure.
 */
type OkResult = Extract<FeedResult, { ok: true }>;

function useServerFeed(
  key: ServerFeedKey,
  initial: FeedResult | undefined,
  ref: React.RefObject<HTMLElement | null>,
) {
  const [result, setResult] = useState<FeedResult | null>(initial ?? null);
  const [fallback, setFallback] = useState<OkResult | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    let r: FeedResult;
    try {
      r = (await (await fetch(`/api/feeds/${key}`)).json()) as FeedResult;
    } catch {
      r = { ok: false, key, at: Date.now(), error: "network" };
    }
    if (r.ok) storage.set(`feed:${key}`, r);
    else {
      const c = storage.get<FeedResult | null>(`feed:${key}`, null);
      setFallback(c?.ok && c.key === key ? c : null);
    }
    setResult(r);
    setBusy(false);
  }, [key]);

  useEffect(() => {
    if (initial?.ok) storage.set(`feed:${key}`, initial);
  }, [key, initial]);

  useEffect(() => {
    if (initial?.ok) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect();
          void load();
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [initial, load, ref]);

  const shown = result?.ok ? result : fallback;
  const status: FeedStatus =
    busy && !shown
      ? { kind: "acquiring" }
      : result?.ok
        ? { kind: "live", at: result.at }
        : fallback
          ? { kind: "stale", at: fallback.at }
          : result
            ? { kind: "nosignal" }
            : { kind: "standby" };
  return { shown, status, busy, load, failed: !!result && !result.ok && !fallback };
}

function Frame({
  feedKey,
  status,
  onRefresh,
  picker,
  hidden,
  pinned,
  onTogglePin,
  cardRef,
  children,
}: {
  feedKey: FeedKey;
  status: FeedStatus;
  onRefresh?: () => void;
  picker?: boolean;
  hidden?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
  cardRef: React.RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const f = FEED_BY_KEY[feedKey];
  const now = useNow(30_000);
  const [spin, setSpin] = useState(false);
  return (
    <Card
      ref={cardRef as React.RefObject<HTMLElement>}
      id={`feed-${f.key}`}
      lift={false}
      hidden={hidden}
      className={`${s.feed} ${f.size ? s[f.size] : ""} ${picker && pinned ? s.picked : ""}`}
      data-feed={f.key}
      aria-labelledby={`fh-${f.key}`}
      code={f.code}
      meta={
        <span className={s.fsrc}>
          <i className={s.fdot} data-s={dotOf(status)} aria-hidden="true" />
          <span>{statusText(status, now)}</span> &middot; {f.host}
          {onRefresh && (
            <button
              type="button"
              className={s.frf}
              aria-label={`Refresh ${f.title}`}
              title="Refresh"
              data-spin={spin || undefined}
              onAnimationEnd={() => setSpin(false)}
              onClick={() => {
                setSpin(true);
                onRefresh();
              }}
            >
              &#8635;
            </button>
          )}
        </span>
      }
      title={f.title}
      titleId={`fh-${f.key}`}
    >
      <div className={s.fb}>{children}</div>
      {picker && (
        <div className={s.pickRow}>
          <Button size="sm" aria-pressed={!!pinned} onClick={onTogglePin}>
            {pinned ? "On overview" : "Add to overview"}
          </Button>
        </div>
      )}
    </Card>
  );
}

export interface FeedCardProps {
  feedKey: FeedKey;
  initial?: FeedResult;
  picker?: boolean;
  hidden?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
}

export function FeedCard(props: FeedCardProps) {
  const f = FEED_BY_KEY[props.feedKey];
  if (f.source === "server")
    return <ServerFeedCard {...props} feedKey={props.feedKey as ServerFeedKey} />;
  return <ClientFeedCard {...props} />;
}

function ServerFeedCard({ feedKey, initial, ...rest }: FeedCardProps & { feedKey: ServerFeedKey }) {
  const ref = useRef<HTMLElement>(null);
  const { shown, status, busy, load, failed } = useServerFeed(feedKey, initial, ref);
  const Body = BODIES[feedKey] as React.ComponentType<{ data: unknown }>;
  const refresh = () => {
    if (!busy) void load();
  };
  return (
    <Frame feedKey={feedKey} status={status} onRefresh={refresh} cardRef={ref} {...rest}>
      {shown ? (
        <Body data={shown.data} />
      ) : failed ? (
        <p className={s.fmsg}>
          No signal from {FEED_BY_KEY[feedKey].host}.
          <Button size="sm" onClick={refresh}>
            Retry
          </Button>
        </p>
      ) : (
        <Skeleton />
      )}
    </Frame>
  );
}

function ClientFeedCard({ feedKey, initial: _initial, ...rest }: FeedCardProps) {
  const ref = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<FeedStatus>({ kind: "standby" });
  const body =
    feedKey === "iss" ? (
      <IssFeed onStatus={setStatus} />
    ) : feedKey === "wx" ? (
      <WeatherFeed onStatus={setStatus} cardRef={ref} />
    ) : (
      <MoonFeed onStatus={setStatus} />
    );
  return (
    <Frame feedKey={feedKey} status={status} cardRef={ref} {...rest}>
      {body}
    </Frame>
  );
}
