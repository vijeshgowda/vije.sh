-- 0002_fk_indexes.sql: an index for every foreign key that had none, so deleting a thread, reply
-- or profile doesn't scan the tables that point at it (partial indexes don't count for that), and
-- default privileges so tables, sequences and functions added later are locked out of the Data API
-- like the ones in 0001.

create index threads_category_id_idx        on app.threads (category_id);
create index threads_hidden_by_idx          on app.threads (hidden_by);
create index replies_hidden_by_idx          on app.replies (hidden_by);
create index posts_author_id_idx            on app.posts (author_id);
create index user_roles_category_id_idx     on app.user_roles (category_id);
create index user_roles_granted_by_idx      on app.user_roles (granted_by);
create index user_bans_user_id_idx          on app.user_bans (user_id);
create index user_bans_banned_by_idx        on app.user_bans (banned_by);
create index reports_thread_id_idx          on app.reports (thread_id);
create index reports_reply_id_idx           on app.reports (reply_id);
create index reports_profile_id_idx         on app.reports (profile_id);
create index reports_resolved_by_idx        on app.reports (resolved_by);
create index moderation_log_actor_id_idx    on app.moderation_log (actor_id);
create index moderation_log_thread_id_idx   on app.moderation_log (thread_id);
create index moderation_log_reply_id_idx    on app.moderation_log (reply_id);
create index moderation_log_profile_id_idx  on app.moderation_log (profile_id);
create index notifications_user_id_idx      on app.notifications (user_id);
create index notifications_actor_id_idx     on app.notifications (actor_id);
create index notifications_thread_id_idx    on app.notifications (thread_id);
create index notifications_reply_id_idx     on app.notifications (reply_id);

alter default privileges in schema app revoke all on tables    from public, anon, authenticated;
alter default privileges in schema app revoke all on sequences from public, anon, authenticated;
alter default privileges in schema app revoke all on functions from public, anon, authenticated;
