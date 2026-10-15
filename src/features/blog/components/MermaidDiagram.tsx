"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { diagramLabel, mermaidConfig } from "../mermaid";
import s from "./MermaidDiagram.module.css";

type Mermaid = (typeof import("mermaid"))["default"];

let loading: Promise<Mermaid> | undefined;

/** Mermaid is large: fetched once, on the first page that has a diagram. */
function loadMermaid(): Promise<Mermaid> {
  loading ??= import("mermaid").then(
    (m) => m.default,
    (err: unknown) => {
      loading = undefined;
      throw err;
    },
  );
  return loading;
}

function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const isDark = () => document.documentElement.dataset.theme === "dark";
const notDark = () => false;

async function renderSvg(id: string, source: string, dark: boolean, measureIn?: Element) {
  const mermaid = await loadMermaid();
  const root = getComputedStyle(document.documentElement);
  const font = getComputedStyle(document.body).fontFamily;
  mermaid.initialize(mermaidConfig(dark, (name) => root.getPropertyValue(name), font));
  // Mermaid empties measureIn and sizes the labels in it, so they get the same CSS as the final
  // SVG. It must be laid out (not display: none) and hold nothing React manages.
  return mermaid.render(id, source, measureIn);
}

/**
 * One ```mermaid block. The server renders its source as a code block (readable without JS); this
 * island swaps in the SVG, re-rendering when the site theme changes. On failure the source stays,
 * with a note.
 */
export function MermaidDiagram({ source }: { source: string }) {
  const id = `mermaid-${useId().replace(/[^\w-]/g, "")}`;
  const dark = useSyncExternalStore(subscribe, isDark, notDark);
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"source" | "diagram" | "error">("source");

  useEffect(() => {
    let live = true;
    renderSvg(id, source, dark, box.current ?? undefined).then(
      ({ svg, bindFunctions }) => {
        const el = box.current;
        if (!live || !el) return;
        // React renders this div empty and never touches its children. securityLevel "strict"
        // has Mermaid run the SVG through DOMPurify before returning it.
        el.innerHTML = svg;
        bindFunctions?.(el);
        setState("diagram");
      },
      () => {
        if (live) setState("error");
      },
    );
    return () => {
      live = false;
    };
  }, [id, source, dark]);

  return (
    <div className={s.diagram}>
      <div
        ref={box}
        className={state === "diagram" ? s.svg : `${s.svg} ${s.pending}`}
        role="img"
        aria-label={diagramLabel(source)}
        aria-hidden={state !== "diagram" || undefined}
      />
      {state !== "diagram" && (
        <pre className={s.source}>
          <code>{source}</code>
        </pre>
      )}
      {state === "error" && <p className={s.note}>Diagram failed to render; showing its source.</p>}
    </div>
  );
}
