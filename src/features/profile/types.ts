import type { DisplayRole } from "@/features/forum/roles";
import type { ForumCategory } from "@/features/forum/types";

/**
 * Public read model of a member profile (/u/[handle]). Like the forum's, it never carries the
 * user id, and only visible posts in visible threads count.
 */

/** A thread the member started, or a reply they wrote */
export interface ProfilePost {
  kind: "thread" | "reply";
  /** Thread id for a thread, reply id for a reply */
  id: string;
  threadId: string;
  threadTitle: string;
  category: Pick<ForumCategory, "slug" | "name">;
  createdAt: Date;
}

export interface Profile {
  /** As stored (the canonical casing) */
  handle: string;
  /** Highest global role; category moderators show as members here */
  role: DisplayRole;
  joinedAt: Date;
  threadCount: number;
  replyCount: number;
  /** Newest first, at most RECENT_POSTS */
  posts: ProfilePost[];
}
