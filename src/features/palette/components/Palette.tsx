"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/layout/toast";
import { setTheme } from "@/components/theme/ThemeToggle";
import { fmtDate } from "@/features/blog/format";
import { launch } from "@/features/launch/launch";
import { DEFAULT_PINS } from "@/features/live/catalog";
import { liveFilter, pins } from "@/features/live/client/prefs";
import { goTo } from "../go-to";
import {
  buildItems,
  filterItems,
  type CommandId,
  type PaletteItem,
  type PaletteNote,
} from "../items";
import { setPaletteOpen, usePaletteOpen, useShortcutLabel } from "../palette";
import s from "./Palette.module.css";

function runCommand(command: CommandId) {
  switch (command) {
    case "theme":
      return setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    case "launch":
      return launch();
    case "copy": {
      const fail = () => toast("Could not copy the link");
      if (!navigator.clipboard) return fail();
      return void navigator.clipboard
        .writeText(window.location.href)
        .then(() => toast("Link copied"), fail);
    }
    case "feeds":
      pins.set(DEFAULT_PINS);
      return toast("Overview feeds reset");
    case "top": {
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      return document.getElementById("main")?.focus({ preventScroll: true });
    }
  }
}

/** Jump-to palette (Ctrl/Cmd K): search pages, overview sections, notes, feeds and commands. */
export function Palette({ notes }: { notes: PaletteNote[] }) {
  const open = usePaletteOpen();
  const router = useRouter();
  const pinned = pins.use();
  const shortcut = useShortcutLabel();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setSel(0);
    }
  }

  const items = useMemo<PaletteItem[]>(
    () =>
      open
        ? buildItems({
            notes,
            pinned,
            path: window.location.pathname,
            dark: document.documentElement.dataset.theme === "dark",
            formatDate: fmtDate,
          })
        : [],
    [open, notes, pinned],
  );
  const results = useMemo(() => filterItems(items, query), [items, query]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      input.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!dialog.current?.open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) document.getElementById(`pal-o${sel}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, sel]);

  const run = (i: number) => {
    const it = results[i];
    if (!it) return;
    setPaletteOpen(false);
    const a = it.action;
    if (a.type === "run") return runCommand(a.command);
    if (a.showAllFeeds) liveFilter.set("");
    goTo((href) => router.push(href), a);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = results.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (n) setSel((sel + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(sel);
    }
  };

  return (
    <dialog
      ref={dialog}
      className={s.pal}
      aria-label="Jump to"
      onClose={() => setPaletteOpen(false)}
      onClick={(e) => e.target === dialog.current && setPaletteOpen(false)}
    >
      {open && (
        <>
          <div className={s.in}>
            <span aria-hidden="true">&gt;</span>
            <input
              ref={input}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="pal-list"
              aria-autocomplete="list"
              aria-activedescendant={results.length ? `pal-o${sel}` : undefined}
              aria-label="Search pages, notes, feeds and commands"
              placeholder="Pages, notes, feeds, commands"
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSel(0);
              }}
              onKeyDown={onKeyDown}
            />
            <kbd>Esc</kbd>
          </div>
          <ul id="pal-list" className={s.list} role="listbox" aria-label="Results">
            {results.length ? (
              results.map((it, i) => (
                <li
                  key={`${it.group}-${it.code}-${it.title}`}
                  id={`pal-o${i}`}
                  role="option"
                  aria-selected={i === sel}
                  onClick={() => run(i)}
                  onPointerMove={() => i !== sel && setSel(i)}
                >
                  <span className={s.code}>{it.code}</span>
                  <span>
                    <b>{it.title}</b>
                    <small>{it.sub}</small>
                  </span>
                  <span className={s.group}>{it.group}</span>
                </li>
              ))
            ) : (
              <li className={s.none} role="option" aria-selected="false" aria-disabled="true">
                Nothing matches. Try &ldquo;feed&rdquo;, &ldquo;note&rdquo; or &ldquo;dark&rdquo;.
              </li>
            )}
          </ul>
          <p className={s.foot}>
            <span>
              <kbd>&uarr;</kbd> <kbd>&darr;</kbd> move
            </span>
            <span>
              <kbd>Enter</kbd> open
            </span>
            <span>
              <kbd>{shortcut}</kbd> anywhere
            </span>
          </p>
        </>
      )}
    </dialog>
  );
}
