"use client";

import { openPalette, useShortcutLabel } from "../palette";
import s from "./Palette.module.css";

/** Opens the jump-to palette: the header's "Jump to" box or the footer's "Search" link-style button. */
export function PaletteButton({
  variant,
  className = "",
}: {
  variant: "header" | "footer";
  className?: string;
}) {
  const shortcut = useShortcutLabel();
  if (variant === "footer") {
    return (
      <button
        type="button"
        className={`${s.search} ${className}`}
        aria-haspopup="dialog"
        onClick={openPalette}
      >
        Search <kbd>{shortcut}</kbd>
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`${s.find} ${className}`}
      aria-label={`Jump to: search (${shortcut})`}
      aria-haspopup="dialog"
      onClick={openPalette}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span data-label>Jump to</span>
      <kbd>{shortcut}</kbd>
    </button>
  );
}
