-- MPP schema — single-team internal deployment (PRD §7.3, D3).
--
-- Every reporting surface in this product is an aggregate over time-series event data, which is
-- why this is Postgres and not a document store: the Pulse metrics are SQL over activity_events
-- and stagnation_flags rather than counters maintained on write.
--
-- Row Level Security carries the §5.4 flag-visibility rules here rather than in UI code.
-- "Owner only" enforced by a hidden div is not a privacy setting.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Core tables
-- ---------------------------------------------------------------------------

create table teams (
  id          text primary key,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table users (
  id           uuid primary key references auth.users (id) on delete cascade,
  team_id      text not null references teams (id) on delete cascade,
  email        text not null unique,
  display_name text not null,
  role         text not null default 'member' check (role in ('lead', 'member')),
  -- [{"start":"2026-09-14","end":"2026-09-18"}] — pauses this person's clocks.
  away_spans   jsonb not null default '[]'::jsonb
);

-- Partial by design: an unset value falls back to the system default in application code, so a
-- team that never opens Settings still gets a working radar, and a later change to the system
-- default reaches every team that never overrode it (PRD §5.2, D1).
create table team_settings (
  team_id            text primary key references teams (id) on delete cascade,
  thresholds         jsonb not null default '{}'::jsonb,
  flag_visibility    text check (flag_visibility in ('team', 'owner_lead', 'owner')),
  count_weekends     boolean,
  pause_during_pto   boolean,
  tz_offset_minutes  integer,
  updated_by         uuid references users (id) on delete set null,
  updated_at         timestamptz
);

create table cards (
  id             text primary key,
  team_id        text not null references teams (id) on delete cascade,
  title          text not null,
  description    text not null default '',
  -- Quoted: COLUMN is a reserved word. Kept as the domain name rather than aliased, so the
  -- storage adapter stays a plain camel/snake mapping with no per-field special cases.
  "column"       text not null check ("column" in ('backlog', 'todo', 'in_progress', 'blocked', 'done')),
  assignee_id    uuid references users (id) on delete set null,
  -- A one-line reason is required to tag a card Blocked; the tag applies the Blocked thresholds
  -- wherever the card sits, so declaring a stall never buys a looser clock (PRD §5.1).
  blocked_reason text,
  due_date       date,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz,
  position       integer not null default 0
);

create table sub_tasks (
  id           text primary key,
  card_id      text not null references cards (id) on delete cascade,
  title        text not null,
  est_minutes  integer not null check (est_minutes > 0 and est_minutes <= 5),
  completed_at timestamptz,
  position     integer not null default 0
);

-- resets_clock is stored per row rather than inferred at read time: the activity/non-activity
-- distinction (PRD §5.2) is a property of the event, not logic scattered across call sites.
create table activity_events (
  id           text primary key,
  card_id      text not null references cards (id) on delete cascade,
  user_id      uuid references users (id) on delete set null,
  kind         text not null,
  resets_clock boolean not null,
  detail       text,
  to_column    text,
  created_at   timestamptz not null default now()
);

-- threshold_snapshot records the thresholds in force when the flag was raised. Retuning changes
-- what is flagged now; it must not rewrite the historical trend the lead tuned against.
create table stagnation_flags (
  id                 text primary key,
  card_id            text not null references cards (id) on delete cascade,
  level              text not null check (level in ('amber', 'red')),
  raised_at          timestamptz not null default now(),
  cleared_at         timestamptz,
  threshold_snapshot jsonb not null
);

create table focus_blocks (
  id              text primary key,
  team_id         text not null references teams (id) on delete cascade,
  started_by      uuid not null references users (id) on delete cascade,
  scope           text not null check (scope in ('personal', 'team')),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  ended_early_at  timestamptz,
  participant_ids uuid[] not null default '{}'
);

create table notifications (
  id           text primary key,
  user_id      uuid not null references users (id) on delete cascade,
  title        text not null,
  body         text not null,
  urgent       boolean not null default false,
  created_at   timestamptz not null default now(),
  -- null while held by a Focus Block; set when the digest is released (PRD §5.5).
  delivered_at timestamptz
);

create table catalyst_sessions (
  id           text primary key,
  card_id      text not null references cards (id) on delete cascade,
  sub_task_id  text not null,
  user_id      uuid not null references users (id) on delete cascade,
  started_at   timestamptz not null default now(),
  committed_at timestamptz,
  continued    boolean not null default false
);

create index on activity_events (card_id, created_at desc);
create index on activity_events (kind, created_at desc);
create index on stagnation_flags (card_id) where cleared_at is null;
create index on stagnation_flags (raised_at desc);
create index on cards (team_id, "column");
create index on cards (completed_at desc) where completed_at is not null;
create index on notifications (user_id) where delivered_at is null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function current_member() returns users
language sql stable security definer set search_path = public as $$
  select * from users where id = auth.uid();
$$;

create or replace function is_lead() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'lead' from users where id = auth.uid()), false);
$$;

create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid());
$$;

create or replace function flag_visibility() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select s.flag_visibility from team_settings s limit 1), 'team');
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table teams             enable row level security;
alter table users             enable row level security;
alter table team_settings     enable row level security;
alter table cards             enable row level security;
alter table sub_tasks         enable row level security;
alter table activity_events   enable row level security;
alter table stagnation_flags  enable row level security;
alter table focus_blocks      enable row level security;
alter table notifications     enable row level security;
alter table catalyst_sessions enable row level security;

-- The board itself is shared: this is a single internal team, and the work is the team's work.
create policy team_read   on teams   for select using (is_member());
create policy users_read  on users   for select using (is_member());
create policy users_self  on users   for update using (id = auth.uid()) with check (id = auth.uid());

create policy cards_read  on cards   for select using (is_member());
create policy cards_write on cards   for all    using (is_member()) with check (is_member());

create policy subtasks_read  on sub_tasks for select using (is_member());
create policy subtasks_write on sub_tasks for all    using (is_member()) with check (is_member());

create policy events_read  on activity_events for select using (is_member());
create policy events_write on activity_events for insert with check (is_member());

create policy focus_read  on focus_blocks for select using (is_member());
create policy focus_write on focus_blocks for all    using (is_member()) with check (is_member());

create policy catalyst_read  on catalyst_sessions for select using (is_member());
create policy catalyst_write on catalyst_sessions for all    using (is_member()) with check (is_member());

-- Thresholds and visibility are the lead's to set (PRD §9, OD-3). Everyone can read them:
-- people are entitled to know exactly what the clock on their work is.
create policy settings_read  on team_settings for select using (is_member());
create policy settings_write on team_settings for all    using (is_lead()) with check (is_lead());

-- Notifications are personal.
create policy notifications_own on notifications for all
  using (user_id = auth.uid()) with check (is_member());

-- The visibility rule itself (PRD §5.4). Attribution is what the setting controls, so this
-- policy governs *rows*; aggregate counts come from pulse_flag_counts() below.
create policy flags_read on stagnation_flags for select using (
  is_member() and exists (
    select 1 from cards c
    where c.id = stagnation_flags.card_id
      and (
        flag_visibility() = 'team'
        or c.assignee_id = auth.uid()
        or c.assignee_id is null
        or (flag_visibility() = 'owner_lead' and is_lead())
      )
  )
);

-- Deliberately NOT `for all`: permissive policies are OR'd together, so a `for all` write policy
-- would also grant SELECT on every row and silently defeat flags_read above. Writes are split
-- per command so the read rule is the only thing deciding what can be read.
create policy flags_insert on stagnation_flags for insert with check (is_member());
create policy flags_update on stagnation_flags for update using (is_member()) with check (is_member());
create policy flags_delete on stagnation_flags for delete using (is_member());

-- Aggregates stay with the lead at every visibility level — the setting changes attribution,
-- not the existence of the signal. Security definer so a lead on "Owner only" still gets counts
-- without being able to select the underlying rows.
create or replace function pulse_flag_counts(since timestamptz default now() - interval '28 days')
returns table (level text, raised_count bigint, open_count bigint)
language sql stable security definer set search_path = public as $$
  select f.level,
         count(*) filter (where f.raised_at >= since) as raised_count,
         count(*) filter (where f.cleared_at is null) as open_count
  from stagnation_flags f
  where is_lead()
  group by f.level;
$$;

revoke all on function pulse_flag_counts(timestamptz) from public;
grant execute on function pulse_flag_counts(timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrap
-- ---------------------------------------------------------------------------
-- A person signing in for the first time has no row in public.users, and no policy here lets
-- them create one — by design, since membership is not self-service. This trigger creates it,
-- along with the team and its settings row on the very first sign-in.
--
-- The first person to sign in becomes the lead. For a single-team internal deployment (D3) that
-- is the person who set the deployment up; anyone after them joins as a member, and the lead can
-- change roles.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target_team text;
  member_count integer;
begin
  insert into teams (id, name) values ('team', 'The team') on conflict (id) do nothing;
  select id into target_team from teams order by created_at limit 1;
  insert into team_settings (team_id) values (target_team) on conflict (team_id) do nothing;

  select count(*) into member_count from users;
  insert into users (id, team_id, email, display_name, role)
  values (
    new.id,
    target_team,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    case when member_count = 0 then 'lead' else 'member' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- RLS decides which rows a request may touch; grants decide whether it may touch the table at
-- all. A fresh Supabase project usually carries default privileges that cover this, but relying
-- on project configuration means the schema is not self-contained — and on a plain Postgres it
-- fails outright with "permission denied for table cards".
--
-- anon is granted nothing: every policy here requires a session, so an unauthenticated request
-- should fail at the door rather than return a confusing empty result.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- Realtime for the live board and presence.
alter publication supabase_realtime add table cards, sub_tasks, activity_events,
  stagnation_flags, focus_blocks, notifications, team_settings, catalyst_sessions;
