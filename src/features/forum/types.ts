import type { DisplayRole } from "./roles";

/**
 * Public read model of the forum, as returned by the cached queries. Nothing here identifies an
 * account except its handle (no UUIDs), and hidden replies carry no body or author.
 */

export interface ForumCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

/** A thread row in a list (prototype `ol.threads`) */
export interface ThreadSummary {
  id: string;
  title: string;
  category: Pick<ForumCategory, "slug" | "name">;
  /** null once the author's account is deleted */
  authorHandle: string | null;
  /** visible replies only (kept by a trigger) */
  replyCount: number;
  createdAt: Date;
  lastActivityAt: Date;
  pinned: boolean;
  locked: boolean;
}

export interface FrameAuthor {
  /** null once the account is deleted */
  handle: string | null;
  role: DisplayRole;
}

/** One frame of a thread (prototype `ol.frames`): frame 00 is the opening post, then replies. */
export interface Frame {
  /** Stable DOM id and React key: `thread-<id>` or `reply-<id>` */
  key: string;
  kind: "thread" | "reply";
  /** Thread id for frame 00, reply id otherwise */
  id: string;
  /** Position in the thread, counting hidden replies so numbers never shift */
  no: number;
  createdAt: Date;
  editedAt: Date | null;
  /** Hidden by a moderator: no author and no body are sent */
  hidden: boolean;
  author: FrameAuthor | null;
  bodyMd: string | null;
}

export interface ThreadDetail {
  id: string;
  title: string;
  category: ForumCategory;
  createdAt: Date;
  pinned: boolean;
  locked: boolean;
  frames: Frame[];
}
