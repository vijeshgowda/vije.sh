-- 0003_staff_roles.sql: the superuser role, scope rules for grants, a single owner that only the
-- database owner can create or remove, and category changes in the moderation log
-- (docs/database.md section 4, docs/application.md 8.7).
--
-- `alter type ... add value` may run inside the migration's transaction, but the new value can't be
-- used until that transaction commits. Nothing below mentions 'superuser', so the file applies in
-- one transaction (supabase db push, npm run db:test:setup).

-- Owner (stored as 'admin') > superuser (global) > moderator (global or one category).
alter type app.role add value if not exists 'superuser' before 'moderator';

-- Only moderators may be scoped to a category; admin and superuser are always global.
alter table app.user_roles drop constraint user_roles_admin_global;
alter table app.user_roles
  add constraint user_roles_scope check (role = 'moderator' or category_id is null);

-- One owner. Fails if more than one 'admin' row exists: revoke the extra grants first.
create unique index user_roles_one_owner_idx on app.user_roles (role) where role = 'admin';

-- The app (app_rw) can never create, change or remove the owner; that stays a manual step in the
-- SQL editor (database.md "Granting the first admin"). Cascades from deleting a profile run as the
-- table owner, so deleting an account still removes its roles.
create function app.user_roles_protect_owner() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'app_rw'
     and ((tg_op <> 'INSERT' and old.role = 'admin') or (tg_op <> 'DELETE' and new.role = 'admin')) then
    raise exception 'the owner role can only be changed by the database owner'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger user_roles_protect_owner
  before insert or update or delete on app.user_roles
  for each row execute function app.user_roles_protect_owner();

-- Category management (owner) is logged like every other staff action.
alter table app.moderation_log drop constraint moderation_log_action_check;
alter table app.moderation_log add constraint moderation_log_action_check check (action in (
  'hide', 'unhide', 'lock', 'unlock', 'pin', 'unpin', 'move',
  'ban', 'unban', 'role_grant', 'role_revoke', 'report_resolve',
  'category_create', 'category_update', 'category_delete'));
