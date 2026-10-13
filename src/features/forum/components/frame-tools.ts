import type { FrameTool } from "../client/toolbar";
import { STAFF_TOOLS } from "@/features/moderation/components/StaffControls";
import { reportTool } from "@/features/moderation/reports/components/ReportTool";
import { editTool } from "./EditPost";

/**
 * The tools FrameToolbar offers on each frame, in order. Add a tool by appending it here: Edit,
 * the staff controls (hide/unhide, reveal, lock, pin, move), then Report. Each tool's `show()`
 * decides who sees it; its action re-checks on the server.
 */
export const FRAME_TOOLS: readonly FrameTool[] = [editTool, ...STAFF_TOOLS, reportTool];
