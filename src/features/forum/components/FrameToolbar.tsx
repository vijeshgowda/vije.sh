"use client";

import { useNow } from "@/features/live/client/use-now";
import { useMe } from "../client/me";
import { meAsUser } from "../client/posting";
import type { FrameTool, FrameToolProps, ToolbarFrame, ToolbarThread } from "../client/toolbar";
import { frameLabel } from "../format";
import { FRAME_TOOLS } from "./frame-tools";
import s from "./Frames.module.css";

/**
 * Per-frame controls under a body (FrameList `renderActions`). Renders nothing for guests and for
 * frames where no tool applies, so cached pages stay identical for everyone until the session
 * loads. Tools come from FRAME_TOOLS.
 */
export function FrameToolbar({
  frame,
  thread,
  tools = FRAME_TOOLS,
}: {
  frame: ToolbarFrame;
  thread: ToolbarThread;
  tools?: readonly FrameTool[];
}) {
  const me = useMe();
  // the edit window is checked against this clock; a quarter-minute is close enough for a button
  const now = useNow(15_000);
  if (!me || now === null) return null;
  const props: FrameToolProps = { me, user: meAsUser(me), frame, thread, now };
  const shown = tools.filter((t) => t.show(props));
  if (shown.length === 0) return null;
  return (
    <div className={s.actions} role="group" aria-label={`${frameLabel(frame.no)} tools`}>
      {shown.map(({ id, Tool }) => (
        <Tool key={id} {...props} />
      ))}
    </div>
  );
}
