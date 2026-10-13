"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import w from "./Write.module.css";

/**
 * A modal dialog for posting (prototype `dialog`): mounted while open, shown with showModal() so
 * focus stays inside and Esc closes it. Focus starts on the first field; the opener puts it back
 * on its trigger (useReturnFocus).
 */
export function PostDialog({
  labelledBy,
  onClose,
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);

  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    const d = ref.current!;
    if (!d.open) d.showModal();
    d.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")?.focus();
    return () => {
      if (d.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={w.dialog}
      aria-labelledby={labelledBy}
      onClose={() => close.current()}
    >
      {children}
    </dialog>
  );
}

/**
 * Puts focus back on the button that opened a dialog once the dialog has gone. Focusing it while
 * the modal dialog is still open does nothing: the rest of the page is inert until then.
 */
export function useReturnFocus(open: boolean, trigger: RefObject<HTMLElement | null>) {
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open, trigger]);
}
