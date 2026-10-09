"use client";

import { fmtN, hfPath } from "../../format";
import type { Model, Paper } from "../../types";
import { List, Row } from "./parts";

export function Models({ data }: { data: Model[] }) {
  return (
    <List>
      {data.map((m, i) => (
        <Row
          key={m.id}
          n={i + 1}
          href={`https://huggingface.co/${hfPath(m.id)}`}
          title={m.id}
          meta={`${fmtN(m.downloads)} downloads`}
          value={<>{fmtN(m.likes)} &hearts;</>}
        />
      ))}
    </List>
  );
}

export function Papers({ data }: { data: Paper[] }) {
  return (
    <List>
      {data.map((p, i) => (
        <Row
          key={p.id}
          n={i + 1}
          href={`https://huggingface.co/papers/${encodeURIComponent(p.id)}`}
          title={p.title}
          meta={`arXiv ${p.id}`}
          value={<>{p.upvotes}&uarr;</>}
          red
        />
      ))}
    </List>
  );
}
