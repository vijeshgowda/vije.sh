"use client";

import { useEffect } from "react";
import type { NaturalEvent, Quake } from "../../types";
import { globeBus } from "../../client/globe-bus";
import { useNow } from "../../client/use-now";
import { Ago, Big, List, Note, Row } from "./parts";

export function Quakes({ data }: { data: Quake[] }) {
  const now = useNow(30_000);
  useEffect(() => {
    globeBus.set({ quakes: data });
  }, [data]);
  const big = data.reduce<Quake | null>((a, b) => (!a || b.mag > a.mag ? b : a), null);
  return (
    <>
      <Big value={data.length} red={(big?.mag ?? 0) >= 6}>
        in 24 h{big && <> &middot; strongest M{big.mag.toFixed(1)}</>}
      </Big>
      <List>
        {data.slice(0, 6).map((q, i) => (
          <Row
            key={`${q.time}-${q.place}`}
            n={i + 1}
            href={q.url}
            title={q.place}
            meta={
              <>
                depth {Math.round(q.depth)} km &middot; <Ago t={q.time} now={now} />
              </>
            }
            value={`M${q.mag.toFixed(1)}`}
            red={q.mag >= 6}
          />
        ))}
      </List>
      <Note>Also drawn as rings on the LF-01 globe.</Note>
    </>
  );
}

export function Events({ data }: { data: NaturalEvent[] }) {
  const now = useNow(30_000);
  return (
    <List>
      {data.map((e, i) => (
        <Row
          key={e.title}
          n={i + 1}
          href={e.url}
          title={e.title}
          meta={
            <>
              {e.category}
              {e.date && (
                <>
                  {" "}
                  &middot; <Ago t={Date.parse(e.date)} now={now} />
                </>
              )}
            </>
          }
          value={e.magnitude}
        />
      ))}
    </List>
  );
}
