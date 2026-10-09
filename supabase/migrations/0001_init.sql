-- 0001_init.sql: app schema, roles, blog notes, forum, moderation, notifications, images.
-- Source of truth for the database (docs/database.md section 6). Never edit after it's applied.
create extension if not exists citext with schema extensions;

create schema if not exists app;
revoke all on schema app from public, anon, authenticated;

-- Enums ---------------------------------------------------------------
create type app.role          as enum ('admin', 'moderator');
create type app.post_status   as enum ('draft', 'published');
create type app.visibility    as enum ('public', 'unlisted', 'private');
create type app.report_status as enum ('open', 'actioned', 'dismissed');

-- Helpers -------------------------------------------------------------
create function app.set_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Profiles ------------------------------------------------------------
create table app.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  handle        extensions.citext unique
                check (handle ~ '^[A-Za-z0-9_]{3,24}$'),
  display_name  text check (char_length(display_name) <= 60),
  avatar_url    text check (char_length(avatar_url) <= 500),
  bio           text check (char_length(bio) <= 500),
  onboarded_at  timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_onboarded_has_handle check (onboarded_at is null or handle is not null)
);
create trigger profiles_updated_at before update on app.profiles
  for each row execute function app.set_updated_at();

-- Categories ----------------------------------------------------------
create table app.categories (
  id           bigint generated always as identity primary key,
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name         text not null check (char_length(name) between 1 and 60),
  description  text check (char_length(description) <= 300),
  position     int  not null default 0,
  staff_only   boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Roles and bans ------------------------------------------------------
create table app.user_roles (
  user_id      uuid not null references app.profiles (id) on delete cascade,
  role         app.role not null,
  category_id  bigint references app.categories (id) on delete cascade,
  granted_by   uuid references app.profiles (id) on delete set null,
  granted_at   timestamptz not null default now(),
  constraint user_roles_unique unique nulls not distinct (user_id, role, category_id),
  constraint user_roles_admin_global check (role <> 'admin' or category_id is null)
);
create index user_roles_user_id_idx on app.user_roles (user_id);

create table app.user_bans (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references app.profiles (id) on delete cascade,
  reason      text not null check (char_length(reason) between 1 and 500),
  banned_by   uuid references app.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  lifted_at   timestamptz
);
create index user_bans_active_idx on app.user_bans (user_id) where lifted_at is null;

-- Blog notes (git posts are Markdown files in the repo) ----------------
create table app.posts (
  id            bigint generated always as identity primary key,
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title         text not null check (char_length(title) between 1 and 200),
  summary       text check (char_length(summary) <= 300),
  body_md       text not null default '' check (char_length(body_md) <= 100000),
  status        app.post_status not null default 'draft',
  visibility    app.visibility  not null default 'public',
  tags          text[] not null default '{}',
  author_id     uuid not null references app.profiles (id),
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint posts_published_has_date check (status = 'draft' or published_at is not null)
);
create index posts_public_feed_idx on app.posts (published_at desc)
  where status = 'published' and visibility = 'public';
create index posts_tags_idx on app.posts using gin (tags);
create trigger posts_updated_at before update on app.posts
  for each row execute function app.set_updated_at();

-- Forum ---------------------------------------------------------------
create table app.threads (
  id                bigint generated always as identity primary key,
  category_id       bigint not null references app.categories (id),
  author_id         uuid references app.profiles (id) on delete set null,
  title             text not null check (char_length(title) between 3 and 140),
  body_md           text not null check (char_length(body_md) between 1 and 20000),
  pinned_at         timestamptz,
  locked_at         timestamptz,
  hidden_at         timestamptz,
  hidden_by         uuid references app.profiles (id) on delete set null,
  reply_count       int not null default 0,
  last_activity_at  timestamptz not null default now(),
  edited_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  search            tsvector generated always as (
                      setweight(to_tsvector('english'::regconfig, title), 'A') ||
                      setweight(to_tsvector('english'::regconfig, body_md), 'B')
                    ) stored
);
create index threads_category_listing_idx on app.threads
  (category_id, pinned_at desc nulls last, last_activity_at desc) where hidden_at is null;
create index threads_latest_idx on app.threads (last_activity_at desc) where hidden_at is null;
create index threads_author_idx on app.threads (author_id, created_at desc);
create index threads_search_idx on app.threads using gin (search);
create trigger threads_updated_at before update on app.threads
  for each row execute function app.set_updated_at();

create table app.replies (
  id          bigint generated always as identity primary key,
  thread_id   bigint not null references app.threads (id) on delete cascade,
  author_id   uuid references app.profiles (id) on delete set null,
  body_md     text not null check (char_length(body_md) between 1 and 20000),
  hidden_at   timestamptz,
  hidden_by   uuid references app.profiles (id) on delete set null,
  edited_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  search      tsvector generated always as (to_tsvector('english'::regconfig, body_md)) stored
);
create index replies_thread_idx on app.replies (thread_id, created_at);
create index replies_author_idx on app.replies (author_id, created_at desc);
create index replies_search_idx on app.replies using gin (search);
create trigger replies_updated_at before update on app.replies
  for each row execute function app.set_updated_at();

-- Keep threads.reply_count (visible replies) and last_activity_at in sync.
create function app.replies_counter() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.hidden_at is null then
    update app.threads
       set reply_count = reply_count + 1, last_activity_at = new.created_at
     where id = new.thread_id;
  elsif tg_op = 'DELETE' and old.hidden_at is null then
    update app.threads set reply_count = reply_count - 1 where id = old.thread_id;
  elsif tg_op = 'UPDATE' and (old.hidden_at is null) <> (new.hidden_at is null) then
    update app.threads
       set reply_count = reply_count + case when new.hidden_at is null then 1 else -1 end
     where id = new.thread_id;
  end if;
  return null;
end $$;
create trigger replies_counter
  after insert or delete or update of hidden_at on app.replies
  for each row execute function app.replies_counter();

-- Moderation ----------------------------------------------------------
create table app.reports (
  id           bigint generated always as identity primary key,
  reporter_id  uuid references app.profiles (id) on delete set null,
  thread_id    bigint references app.threads (id) on delete cascade,
  reply_id     bigint references app.replies (id) on delete cascade,
  profile_id   uuid   references app.profiles (id) on delete cascade,
  reason       text not null check (char_length(reason) between 1 and 1000),
  status       app.report_status not null default 'open',
  resolved_by  uuid references app.profiles (id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint reports_one_target check (num_nonnulls(thread_id, reply_id, profile_id) = 1),
  constraint reports_no_duplicates unique nulls not distinct (reporter_id, thread_id, reply_id, profile_id)
);
create index reports_open_idx on app.reports (created_at) where status = 'open';

create table app.moderation_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid references app.profiles (id) on delete set null,
  action      text not null check (action in (
                'hide', 'unhide', 'lock', 'unlock', 'pin', 'unpin', 'move',
                'ban', 'unban', 'role_grant', 'role_revoke', 'report_resolve')),
  thread_id   bigint references app.threads (id) on delete set null,
  reply_id    bigint references app.replies (id) on delete set null,
  profile_id  uuid   references app.profiles (id) on delete set null,
  note        text check (char_length(note) <= 1000),
  created_at  timestamptz not null default now()
);
create index moderation_log_created_idx on app.moderation_log (created_at desc);

-- Notifications (phase 6) -----------------------------------------------
create table app.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references app.profiles (id) on delete cascade,
  type        text not null check (type in ('reply', 'mention', 'moderation')),
  actor_id    uuid references app.profiles (id) on delete set null,
  thread_id   bigint references app.threads (id) on delete cascade,
  reply_id    bigint references app.replies (id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_unread_idx on app.notifications (user_id, created_at desc)
  where read_at is null;

-- Images (R2 objects) -------------------------------------------------
create table app.images (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid references app.profiles (id) on delete set null,
  key_prefix    text not null unique,
  widths        int[] not null,
  width         int not null,
  height        int not null,
  bytes         int not null,
  alt           text check (char_length(alt) <= 300),
  created_at    timestamptz not null default now()
);
create index images_owner_idx on app.images (owner_id, created_at desc);

-- Lock out Data API roles (belt and braces; `app` is also not exposed) --------
revoke all on all tables    in schema app from public, anon, authenticated;
revoke all on all sequences in schema app from public, anon, authenticated;
revoke all on all functions in schema app from public, anon, authenticated;
