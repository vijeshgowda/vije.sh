import type { ComponentType } from "react";
import type { CurrentUser } from "@/lib/authz";
import type { Me } from "@/features/auth/components/UserMenu";
import type { PostKind } from "../schemas";
import type { Frame, ThreadDetail } from "../types";

/**
 * FrameToolbar's model (components/FrameToolbar.tsx). The thread page renders one toolbar per
 * frame; each tool in FRAME_TOOLS (components/frame-tools.ts) decides from the viewer and the frame
 * whether it shows. Later tools append to that list: staff controls (hide, lock, pin, move) and a
 * Report button.
 */

/** A frame as the toolbar sees it: plain JSON, the author by handle only */
export interface ToolbarFrame {
  key: string;
  kind: PostKind;
  id: string;
  no: number;
  hidden: boolean;
  /** null for a deleted account or a hidden reply */
  authorHandle: string | null;
  /** ISO time */
  createdAt: string;
}

/** The thread around the frame */
export interface ToolbarThread {
  id: string;
  categoryId: string;
  categorySlug: string;
  locked: boolean;
  pinned: boolean;
}

export interface FrameToolProps {
  me: Me;
  /** `me` for can(): the id is handleKey(handle), so compare with handleKey(frame.authorHandle) */
  user: CurrentUser;
  frame: ToolbarFrame;
  thread: ToolbarThread;
  /** Current time (ms), ticking; never read during prerender */
  now: number;
}

export interface FrameTool {
  /** React key */
  id: string;
  /** Whether this viewer gets the tool on this frame (pure; the server checks again) */
  show: (p: FrameToolProps) => boolean;
  Tool: ComponentType<FrameToolProps>;
}

export function toolbarFrame(f: Frame): ToolbarFrame {
  return {
    key: f.key,
    kind: f.kind,
    id: f.id,
    no: f.no,
    hidden: f.hidden,
    authorHandle: f.author?.handle ?? null,
    createdAt: f.createdAt.toISOString(),
  };
}

export function toolbarThread(t: ThreadDetail): ToolbarThread {
  return {
    id: t.id,
    categoryId: t.category.id,
    categorySlug: t.category.slug,
    locked: t.locked,
    pinned: t.pinned,
  };
}
