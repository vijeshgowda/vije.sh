import type { FrameTool } from "../client/toolbar";
import { STAFF_TOOLS } from "@/features/moderation/components/StaffControls";
import { editTool } from "./EditPost";

/**
 * The tools FrameToolbar offers on each frame, in order. Add a tool by appending it here: staff
 * controls (hide/unhide, lock, pin, move) and a Report button are planned next to Edit. Each tool's
 * `show()` decides who sees it; its action re-checks on the server.
 */
export const FRAME_TOOLS: readonly FrameTool[] = [editTool, ...STAFF_TOOLS];
