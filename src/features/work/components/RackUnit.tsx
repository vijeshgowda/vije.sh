"use client";

import { useState } from "react";
import { uart } from "@/lib/uart";
import s from "./Work.module.css";

/** One rack unit: the face is a button that pulls the unit out to show its spec. */
export function RackUnit({
  index,
  code,
  label,
  title,
  text,
}: {
  index: number;
  code: string;
  label: string;
  title: string;
  text: string;
}) {
  const [open, setOpen] = useState(false);
  const id = `unit-${code.toLowerCase()}`;
  const toggle = () => {
    setOpen(!open);
    uart(`rack: ${code} ${open ? "racked" : "pulled out"}`);
  };

  return (
    <div className={s.unit}>
      <button
        type="button"
        className={s.face}
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
      >
        <span className={s.ear} aria-hidden="true" />
        <span className={s.uid}>U{index + 1}</span>
        <span className={s.ucode}>{code}</span>
        <span className={s.utitle}>
          {title} <small>{label}</small>
        </span>
        <span className={s.vent} aria-hidden="true" />
        <span className={s.leds} aria-hidden="true">
          <i />
          <i
            className={s.act}
            style={{
              animationDuration: `${(0.5 + ((index * 0.37) % 1.1)).toFixed(2)}s`,
              animationDelay: `${(index * 0.21).toFixed(2)}s`,
            }}
          />
        </span>
        <span className={s.ear} aria-hidden="true" />
      </button>
      <div className={s.spec} id={id} inert={!open}>
        <div>
          <p>{text}</p>
        </div>
      </div>
    </div>
  );
}
