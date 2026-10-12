-- Supabase pieces the migrations depend on, for a plain Postgres test database (application.md 13.2).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;

create schema if not exists extensions;
create schema if not exists auth;
create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

-- The app's least-privilege role, with the grants from database.md section 3 (no login here:
-- integration tests switch to it with `set local role app_rw`, so a missing grant fails a test).
-- Roles are shared by every database on the server, so creating it twice is not an error.
do $$ begin
  create role app_rw nologin;
exception when duplicate_object or unique_violation then null;
end $$;
create schema if not exists app;
grant usage on schema app to app_rw;
grant usage on schema extensions to app_rw;
alter default privileges in schema app grant select, insert, update, delete on tables to app_rw;
alter default privileges in schema app grant usage, select on sequences to app_rw;
