import type { ReactNode } from "react";
import { ago, p2 } from "../../format";
import s from "../Feeds.module.css";

/** External link that opens in a new tab and says so to screen readers (#newtab is in the site layout). */
export function Ext({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-describedby="newtab"
      className={className}
    >
      {children}
    </a>
  );
}

/** One list row: index, title + meta line, right-aligned value. Linked only when href is safe. */
export function Row({
  n,
  index,
  href,
  title,
  meta,
  value,
  red,
}: {
  n: number;
  index?: ReactNode;
  href?: string | null;
  title: ReactNode;
  meta?: ReactNode;
  value?: ReactNode;
  red?: boolean;
}) {
  const inner = (
    <>
      <span className={s.i}>{index ?? p2(n)}</span>
      <span>
        <b>{title}</b>
        {meta !== undefined && <small>{meta}</small>}
      </span>
      <span className={`${s.v} ${red ? s.r : ""}`}>{value}</span>
    </>
  );
  return <li>{href ? <Ext href={href}>{inner}</Ext> : <div>{inner}</div>}</li>;
}

export function List({ children }: { children: ReactNode }) {
  return <ol className={s.fl}>{children}</ol>;
}

export function Big({
  value,
  red,
  children,
}: {
  value: ReactNode;
  red?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={s.fbig}>
      <b className={red ? s.r : undefined}>{value}</b>
      {children !== undefined && <span>{children}</span>}
    </div>
  );
}

export function Regs({ items }: { items: [string, ReactNode][] }) {
  return (
    <div className={s.regs}>
      {items.map(([k, v]) => (
        <div key={k}>
          <small>{k}</small>
          {v}
        </div>
      ))}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className={s.fmsg}>{children}</p>;
}

/** Relative time that renders nothing until the client clock is known (avoids hydration mismatch). */
export function Ago({ t, now }: { t: number; now: number | null }) {
  return now === null ? null : <>{ago(t, now)}</>;
}
