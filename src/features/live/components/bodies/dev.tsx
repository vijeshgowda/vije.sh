"use client";

import { fmtDay, fmtN, hostOf } from "../../format";
import type { Cycle, Downloads, Release, Story } from "../../types";
import { useNow } from "../../client/use-now";
import s from "../Feeds.module.css";
import { Ago, List, Row } from "./parts";

export function Stories({ data }: { data: Story[] }) {
  return (
    <List>
      {data.map((st, i) => (
        <Row
          key={st.id}
          n={i + 1}
          href={st.url ?? `https://news.ycombinator.com/item?id=${st.id}`}
          title={st.title}
          meta={`${st.url ? hostOf(st.url) : "news.ycombinator.com"} · ${st.comments} comments`}
          value={<>{st.score}&uarr;</>}
          red
        />
      ))}
    </List>
  );
}

export function Releases({ data }: { data: Release[] }) {
  const now = useNow(30_000);
  return (
    <List>
      {data.map((r, i) => {
        const at = r.published ? Date.parse(r.published) : null;
        const fresh = now !== null && at !== null && now - at < 7 * 864e5;
        return (
          <Row
            key={r.repo}
            n={i + 1}
            href={r.url}
            title={r.name}
            meta={r.repo}
            red={fresh}
            value={
              r.tag ? (
                <>
                  {r.tag}
                  <br />
                  <small>{at !== null && <Ago t={at} now={now} />}</small>
                </>
              ) : (
                "n/a"
              )
            }
          />
        );
      })}
    </List>
  );
}

export function Lifecycle({ data }: { data: Cycle[] }) {
  return (
    <List>
      {data.map((c, i) => (
        <Row
          key={`${c.product}-${c.cycle}`}
          n={i + 1}
          title={`${c.product} ${c.cycle}${c.lts ? " LTS" : ""}`}
          meta={`latest ${c.latest}`}
          value={
            c.eol
              ? `EOL ${fmtDay(c.eol, { month: "short", year: "numeric", timeZone: "UTC" })}`
              : "no EOL"
          }
        />
      ))}
    </List>
  );
}

export function NpmDownloads({ data }: { data: Downloads[] }) {
  const max = data[0]?.downloads || 1;
  return (
    <List>
      {data.map((d, i) => (
        <Row
          key={d.pkg}
          n={i + 1}
          href={`https://www.npmjs.com/package/${encodeURIComponent(d.pkg)}`}
          title={
            <>
              {d.pkg}
              <span className={s.nbar} aria-hidden="true">
                <i style={{ width: `${((d.downloads / max) * 100).toFixed(1)}%` }} />
              </span>
            </>
          }
          value={fmtN(d.downloads)}
        />
      ))}
    </List>
  );
}
