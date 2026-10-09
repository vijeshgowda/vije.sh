/**
 * Row types for the `app` schema, written by hand to match supabase/migrations exactly
 * (docs/database.md section 9). snake_case as returned by pg; bigint ids come back as strings,
 * timestamptz as Date. Update this file in the same PR as any migration.
 */

export type Role = "admin" | "moderator";
export type PostStatus = "draft" | "published";
export type Visibility = "public" | "unlisted" | "private";
export type ReportStatus = "open" | "actioned" | "dismissed";
export type ModerationAction =
  | "hide"
  | "unhide"
  | "lock"
  | "unlock"
  | "pin"
  | "unpin"
  | "move"
  | "ban"
  | "unban"
  | "role_grant"
  | "role_revoke"
  | "report_resolve";
export type NotificationType = "reply" | "mention" | "moderation";

export interface ProfileRow {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  onboarded_at: Date | null;
  last_seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  position: number;
  staff_only: boolean;
  created_at: Date;
}

export interface UserRoleRow {
  user_id: string;
  role: Role;
  category_id: string | null;
  granted_by: string | null;
  granted_at: Date;
}

export interface UserBanRow {
  id: string;
  user_id: string;
  reason: string;
  banned_by: string | null;
  created_at: Date;
  expires_at: Date | null;
  lifted_at: Date | null;
}

export interface PostRow {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body_md: string;
  status: PostStatus;
  visibility: Visibility;
  tags: string[];
  author_id: string;
  published_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ThreadRow {
  id: string;
  category_id: string;
  author_id: string | null;
  title: string;
  body_md: string;
  pinned_at: Date | null;
  locked_at: Date | null;
  hidden_at: Date | null;
  hidden_by: string | null;
  reply_count: number;
  last_activity_at: Date;
  edited_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReplyRow {
  id: string;
  thread_id: string;
  author_id: string | null;
  body_md: string;
  hidden_at: Date | null;
  hidden_by: string | null;
  edited_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ReportRow {
  id: string;
  reporter_id: string | null;
  thread_id: string | null;
  reply_id: string | null;
  profile_id: string | null;
  reason: string;
  status: ReportStatus;
  resolved_by: string | null;
  resolved_at: Date | null;
  created_at: Date;
}

export interface ModerationLogRow {
  id: string;
  actor_id: string | null;
  action: ModerationAction;
  thread_id: string | null;
  reply_id: string | null;
  profile_id: string | null;
  note: string | null;
  created_at: Date;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  actor_id: string | null;
  thread_id: string | null;
  reply_id: string | null;
  read_at: Date | null;
  created_at: Date;
}

export interface ImageRow {
  id: string;
  owner_id: string | null;
  key_prefix: string;
  widths: number[];
  width: number;
  height: number;
  bytes: number;
  alt: string | null;
  created_at: Date;
}
