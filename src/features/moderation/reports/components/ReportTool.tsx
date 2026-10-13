"use client";

import { handleKey } from "@/features/forum/client/posting";
import type { FrameTool, FrameToolProps } from "@/features/forum/client/toolbar";
import { frameLabel } from "@/features/forum/format";
import { can, moderates } from "@/lib/authz";
import { ReportButton } from "./ReportButton";

/**
 * Report in each frame's toolbar (FRAME_TOOLS, after the staff tools): for members on visible
 * posts that aren't their own. Staff who moderate the category don't get it: they hide the post
 * themselves. The server re-checks everything but the staff rule.
 */
export const reportTool: FrameTool = {
  id: "report",
  show: ({ user, frame, thread }) =>
    can(user, "report.create") &&
    !frame.hidden &&
    handleKey(frame.authorHandle) !== user.id &&
    !moderates(user, thread.categoryId),
  Tool: ReportFrame,
};

function ReportFrame({ frame }: FrameToolProps) {
  const thread = frame.kind === "thread";
  return (
    <ReportButton
      target={{ kind: frame.kind, id: frame.id }}
      label={thread ? "Report thread" : "Report"}
      title={thread ? "Report thread" : `Report ${frameLabel(frame.no)}`}
    />
  );
}
