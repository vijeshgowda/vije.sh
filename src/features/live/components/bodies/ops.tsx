"use client";

import type { Advisory, Status } from "../../types";
import { useNow } from "../../client/use-now";
import s from "../Feeds.module.css";
import { Ago, List, Note, Row } from "./parts";

export function StatusBoard({ data }: { data: Status[] }) {
  return (
    <>
      <List>
        {data.map((st) => (
          <Row
            key={st.name}
            n={0}
            index={<i className={s.led3} data-i={st.indicator} aria-hidden="true" />}
            href={st.url}
            title={st.name}
            meta={st.indicator === "unknown" ? "no signal" : st.description}
            value={
              st.indicator === "none"
                ? "OK"
                : st.indicator === "unknown"
                  ? "?"
                  : st.indicator.toUpperCase()
            }
          />
        ))}
      </List>
      <Note>The services this site runs on.</Note>
    </>
  );
}

export function Advisories({ data }: { data: Advisory[] }) {
  const now = useNow(30_000);
  return (
    <>
      <List>
        {data.map((a, i) => (
          <Row
            key={`${a.pkg}-${i}`}
            n={i + 1}
            href={a.url}
            title={a.pkg}
            meta={a.summary}
            red
            value={
              <>
                CRIT
                <br />
                <small>{a.published && <Ago t={Date.parse(a.published)} now={now} />}</small>
              </>
            }
          />
        ))}
      </List>
      <Note>Critical npm advisories reviewed by GitHub.</Note>
    </>
  );
}
