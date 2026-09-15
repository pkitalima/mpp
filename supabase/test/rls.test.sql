-- Exercises the Row Level Security policies that carry the flag-visibility rules (PRD §5.4).
-- These run against a throwaway database created by `npm run db:test`.
--
-- The point of these tests: the visibility setting has to hold at the database level. A policy
-- that only hides rows in the UI is not a privacy setting, and this file is what proves the
-- difference.

\set ON_ERROR_STOP on
\set QUIET on

create or replace function assert(condition boolean, message text) returns void
language plpgsql as $$
begin
  if condition is not true then
    raise exception 'FAIL: %', message;
  end if;
  raise notice 'ok: %', message;
end $$;

-- --------------------------------------------------------------------------
-- Fixtures (inserted as the owner, which bypasses RLS)
-- --------------------------------------------------------------------------
\set lead_id  '''11111111-1111-1111-1111-111111111111'''
\set josh_id  '''22222222-2222-2222-2222-222222222222'''
\set peer_id  '''33333333-3333-3333-3333-333333333333'''

-- Signing in is what creates a member: the bootstrap trigger on auth.users does the rest.
insert into auth.users (id, email) values (:lead_id, 'amina@example.com');
select assert(
  (select role from users where id = :lead_id) = 'lead',
  'the first person to sign in becomes the lead');
select assert(
  (select count(*) from teams) = 1 and (select count(*) from team_settings) = 1,
  'the first sign-in creates the team and its settings row');

insert into auth.users (id, email) values (:josh_id, 'josh@example.com'), (:peer_id, 'priya@example.com');
select assert(
  (select count(*) from users where role = 'member') = 2,
  'everyone after the first joins as a member');
select assert(
  (select display_name from users where id = :josh_id) = 'josh',
  'a display name is derived from the email when the identity carries none');

update users set display_name = 'Amina' where id = :lead_id;

insert into cards (id, team_id, title, "column", assignee_id) values
  ('c_josh',   'team', 'Rewrite Q3 report',   'in_progress', :josh_id),
  ('c_peer',   'team', 'September newsletter','in_progress', :peer_id),
  ('c_orphan', 'team', 'Unassigned work',     'todo',        null);

insert into stagnation_flags (id, card_id, level, threshold_snapshot) values
  ('f_josh',   'c_josh',   'red',   '{"column":"in_progress","amberDays":2,"redDays":4}'),
  ('f_peer',   'c_peer',   'amber', '{"column":"in_progress","amberDays":2,"redDays":4}'),
  ('f_orphan', 'c_orphan', 'amber', '{"column":"todo","amberDays":3,"redDays":5}');

insert into notifications (id, user_id, title, body) values
  ('n_josh', :josh_id, 'Blocked', 'something'),
  ('n_peer', :peer_id, 'Blocked', 'something else');

-- --------------------------------------------------------------------------
-- Helpers to act as a given person. The claim is set session-wide, not transaction-local:
-- psql autocommits each statement, so a transaction-local claim would be gone by the next one.
-- --------------------------------------------------------------------------
create or replace function visible_flags() returns bigint
language sql stable as $$ select count(*) from stagnation_flags $$;

-- --------------------------------------------------------------------------
-- No session at all
-- --------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '', false);
select assert((select count(*) from cards) = 0, 'a request with no session sees no cards');
select assert(visible_flags() = 0, 'a request with no session sees no flags');
reset role;

-- --------------------------------------------------------------------------
-- Default visibility: team. Everyone sees every flag — the mechanic depends on it.
-- --------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select assert((select count(*) from cards) = 3, 'a member sees the whole board');
select assert((select count(*) from users) = 3, 'reading users does not recurse through its own policy');
select assert(visible_flags() = 3, 'at "team", a peer sees every flag');
reset role;

-- --------------------------------------------------------------------------
-- owner_lead: uninvolved peers lose attribution; the lead keeps it.
-- --------------------------------------------------------------------------
update team_settings set flag_visibility = 'owner_lead' where team_id = 'team';

set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select assert(visible_flags() = 2, 'at "owner+lead", a peer sees only their own flag and the unassigned one');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select assert(visible_flags() = 3, 'at "owner+lead", the lead still sees every flag');
reset role;

-- --------------------------------------------------------------------------
-- owner: even the lead loses attribution, but keeps aggregates.
-- --------------------------------------------------------------------------
update team_settings set flag_visibility = 'owner' where team_id = 'team';

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select assert(visible_flags() = 1, 'at "owner only", the lead sees only the unassigned flag');
select assert(
  (select coalesce(sum(open_count), 0) from pulse_flag_counts()) = 3,
  'at "owner only", the lead still gets aggregate counts through the definer function');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select assert(visible_flags() = 2, 'at "owner only", Josh sees his own flag and the unassigned one');
select assert(
  (select count(*) from pulse_flag_counts()) = 0,
  'aggregates are the lead''s: a member gets nothing from the definer function');
reset role;

update team_settings set flag_visibility = null where team_id = 'team';

-- --------------------------------------------------------------------------
-- Thresholds are the lead's to set (PRD §9, OD-3), and everyone may read them.
-- --------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
select assert((select count(*) from team_settings) = 1, 'a member can read the thresholds they are judged by');
update team_settings set count_weekends = true where team_id = 'team';
select assert(
  (select count_weekends from team_settings where team_id = 'team') is distinct from true,
  'a member cannot change the thresholds');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
update team_settings set count_weekends = true where team_id = 'team';
reset role;
select assert(
  (select count_weekends from team_settings where team_id = 'team') is true,
  'the lead can change the thresholds');

-- --------------------------------------------------------------------------
-- Notifications are personal.
-- --------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select assert((select count(*) from notifications) = 1, 'a person sees only their own notifications');
reset role;

select 'ALL RLS TESTS PASSED' as result;
