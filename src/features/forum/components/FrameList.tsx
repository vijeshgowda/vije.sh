import type { ReactNode } from "react";
import { Reveal } from "@/components/motion/Reveal";
import { fmtDateTime, frameLabel } from "../format";
import type { Frame } from "../types";
import { AuthorName } from "./AuthorName";
import { RolePill } from "./RolePill";
import s from "./Frames.module.css";

/** A frame with its body already rendered (sanitised Markdown, see server/render.ts) */
export interface RenderedFrame extends Frame {
  body: ReactNode;
}

export interface FrameActions {
  /**
   * Per-frame controls under the body (edit, report, staff tools). Return null for none.
   * Server-rendered; interactive controls go in a client island returned from here.
   */
  renderActions?: (frame: Frame) => ReactNode;
}

/** One frame (prototype `ol.frames li`): FRAME nn, author, role pill, time, body. */
export function ThreadFrame({ frame, renderActions }: { frame: RenderedFrame } & FrameActions) {
  const actions = renderActions?.(frame) ?? null;
  return (
    <li id={frame.key} className={frame.hidden ? s.hidden : undefined}>
      <header>
        <span>{frameLabel(frame.no)}</span>
        {frame.hidden ? (
          <span>Hidden</span>
        ) : (
          <>
            <AuthorName handle={frame.author?.handle ?? null} />
            {frame.author && <RolePill role={frame.author.role} />}
          </>
        )}
        <span className={s.t}>
          <time dateTime={frame.createdAt.toISOString()}>{fmtDateTime(frame.createdAt)}</time>
          {frame.editedAt && (
            <span title={`Edited ${fmtDateTime(frame.editedAt)}`}> &middot; edited</span>
          )}
        </span>
      </header>
      {frame.hidden ? (
        <p className={s.placeholder}>This reply was hidden by a moderator.</p>
      ) : (
        <div className={s.body}>{frame.body}</div>
      )}
      {actions && <div className={s.actions}>{actions}</div>}
    </li>
  );
}

/** The frames of a thread (prototype `ol.frames`) */
export function FrameList({ frames, renderActions }: { frames: RenderedFrame[] } & FrameActions) {
  return (
    <Reveal as="ol" className={s.frames}>
      {frames.map((f) => (
        <ThreadFrame key={f.key} frame={f} renderActions={renderActions} />
      ))}
    </Reveal>
  );
}
