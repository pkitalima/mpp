-- Stands up the parts of a Supabase project that the migration depends on, so the schema and its
-- RLS policies can be exercised on a plain Postgres. Not used in production — Supabase provides
-- all of this itself.
create schema if not exists auth;

-- Supabase's real auth.users has many more columns; these are the ones the bootstrap trigger
-- reads.
create table if not exists auth.users (
  id                  uuid primary key,
  email               text,
  raw_user_meta_data  jsonb not null default '{}'::jsonb
);

-- Supabase derives auth.uid() from the request JWT. Here it reads a GUC the tests set directly.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

grant usage on schema public, auth to authenticated, anon;
