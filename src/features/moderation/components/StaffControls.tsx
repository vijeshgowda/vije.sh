"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { FrameTool, FrameToolProps } from "@/features/forum/client/toolbar";
import { useReturnFocus } from "@/features/forum/components/PostDialog";
import { frameLabel } from "@/features/forum/format";
import { can } from "@/lib/authz";
import { lockThread, pinThread, unhidePost } from "../actions";
import { mayMoveFrom } from "../client/staff";
import { useModerate } from "../client/use-moderate";
import type { ModerationResult } from "../results";
import { HideButton } from "./HideDialog";
import { MoveButton } from "./MoveDialog";
import { RevealDialog } from "./RevealDialog";

/**
 * Staff controls in each frame's toolbar (FRAME_TOOLS), shown only to staff who moderate the
 * thread's category (moderators of it, global moderators, superusers, the owner). Hidden replies get
 * Reveal and Unhide; visible frames get Hide; frame 00 also carries the thread's Lock, Pin and Move.
 * Every action checks again on the server.
 */

const inScope = ({ user, thread }: FrameToolProps) =>
  can(user, "post.hide", { categoryId: thread.categoryId });
const opening = ({ frame }: FrameToolProps) => frame.kind === "thread";

/** Runs a one-click action; its error goes to a toast (there's no form to show it in) */
function OneClick({
  label,
  busy,
  action,
}: {
  label: string;
  busy: string;
  action: () => Promise<ModerationResult>;
}) {
  const { pending, run } = useModerate({ toastErrors: true });
  return (
    <Button size="sm" disabled={pending} onClick={() => run(action)}>
      {pending ? busy : label}
    </Button>
  );
}

function UnhideButton({ frame }: FrameToolProps) {
  return (
    <OneClick
      label="Unhide"
      busy={"Unhiding\u2026"}
      action={() => unhidePost({ kind: frame.kind, id: frame.id })}
    />
  );
}

function RevealButton({ frame }: FrameToolProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useReturnFocus(open, trigger);
  return (
    <>
      <Button ref={trigger} size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        Reveal
      </Button>
      {open && (
        <RevealDialog
          kind={frame.kind}
          id={frame.id}
          title={`Hidden ${frame.kind === "thread" ? "thread" : frameLabel(frame.no)}`}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function LockButton({ thread }: FrameToolProps) {
  const on = !thread.locked;
  return (
    <OneClick
      label={on ? "Lock" : "Unlock"}
      busy={on ? "Locking\u2026" : "Unlocking\u2026"}
      action={() => lockThread({ id: thread.id, on })}
    />
  );
}

function PinButton({ thread }: FrameToolProps) {
  const on = !thread.pinned;
  return (
    <OneClick
      label={on ? "Pin" : "Unpin"}
      busy={on ? "Pinning\u2026" : "Unpinning\u2026"}
      action={() => pinThread({ id: thread.id, on })}
    />
  );
}

export const revealTool: FrameTool = {
  id: "reveal",
  show: (p) => p.frame.hidden && inScope(p),
  Tool: RevealButton,
};

export const unhideTool: FrameTool = {
  id: "unhide",
  show: (p) => p.frame.hidden && inScope(p),
  Tool: UnhideButton,
};

export const hideTool: FrameTool = {
  id: "hide",
  show: (p) => !p.frame.hidden && inScope(p),
  Tool: ({ frame }) => <HideButton frame={frame} />,
};

export const lockTool: FrameTool = {
  id: "lock",
  show: (p) => opening(p) && can(p.user, "thread.lock", { categoryId: p.thread.categoryId }),
  Tool: LockButton,
};

export const pinTool: FrameTool = {
  id: "pin",
  show: (p) => opening(p) && can(p.user, "thread.pin", { categoryId: p.thread.categoryId }),
  Tool: PinButton,
};

export const moveTool: FrameTool = {
  id: "move",
  show: (p) =>
    opening(p) &&
    can(p.user, "thread.move", { categoryId: p.thread.categoryId }) &&
    mayMoveFrom(p.user, p.thread.categoryId),
  Tool: ({ thread }) => <MoveButton threadId={thread.id} />,
};

/** The staff tools, in toolbar order; appended to FRAME_TOOLS after Edit */
export const STAFF_TOOLS: readonly FrameTool[] = [
  revealTool,
  unhideTool,
  hideTool,
  lockTool,
  pinTool,
  moveTool,
];
