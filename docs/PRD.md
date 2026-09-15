# MPP — Product Requirements Document

**Working title:** MPP (Momentum Project Platform)
**Status:** Draft v0.2 — decisions locked for stagnation model, stack, and scope
**Scope:** Single-team internal deployment (3–20 people). Not a commercial multi-tenant product.
**Last updated:** 2026-09-15

---

## 1. Problem

Small teams lose more time to *stalled* work than to *slow* work. A task that sits untouched
in "In Progress" for four days is invisible in a normal Kanban board — the card looks the same
on day one and day nine. The two failure modes behind most stalls are:

1. **Silent blockage** — someone is stuck and hasn't said so.
2. **Avoidance** — the task is daunting, so it gets deferred behind easier work.

MPP makes stalled work visible without turning visibility into surveillance, and gives the
person holding a daunting task a way to start it that costs them almost nothing.

## 2. Product principles

- **Soft peer accountability over manager escalation.** Flags surface to the team, not up a chain.
  The intended first response to a red flag is a teammate asking "need a hand?", not a manager
  asking "why isn't this done?"
- **The flag is about the task, never the person.** Copy, colour, and placement all describe the
  card's state ("no movement for 4 days"), not the owner's character.
- **Every mechanic has an off switch.** A team that finds a mechanic stressful can turn it down
  or off. Defaults are opinionated; nothing is mandatory.
- **Starting beats planning.** The lowest-friction path through the UI should always be the one
  that begins work.

## 3. Locked decisions

| # | Decision | Detail |
|---|----------|--------|
| D1 | **Stagnation thresholds are manager-configurable, with system defaults as fallback** | Each team sets its own per-column thresholds; any unset value falls back to the system default. See §5.2. |
| D2 | **Stagnation flags are visible to teammates by default** | This is what makes the peer-accountability mechanic work. It is a **team-level setting**, not a hard-coded behaviour — see §5.4 and the note below. |
| D3 | **Single-team internal deployment** | One team, one workspace, one deployment. No tenant isolation, no billing, no per-customer configuration surface, no org/tenant hierarchy in the data model. |

> **Note on D2 (carried forward from review, needs a call before build):** default-visible flags are
> the right default for the mechanic, but some team cultures will read a shared red flag as a public
> reprimand rather than a nudge. The setting must therefore ship in v1, not be deferred as a "later
> configurability" item, and it needs at least three levels rather than a boolean — see §5.4. The
> risk of getting this wrong is not a feature gap; it is people quietly working around the board.

## 4. Personas

| Persona | Role | What they need |
|---------|------|----------------|
| **Amina** | Team lead, 8-person marketing team | To see where work is stuck without chasing people; to tune the system's aggressiveness to her team's pace |
| **Josh** | Individual contributor | A way to start a task he's been avoiding without committing to finishing it |
| **Team member (generic)** | IC | To signal "I'm blocked" cheaply, and to be left alone while in focused work |

## 5. Features

### 5.1 Kanban board (foundation)

- Columns: **Backlog → To Do → In Progress → Blocked → Done** (column set is team-configurable).
- Real-time sync — a card moved on one client appears moved on every other client without a refresh.
- Card fields: title, description, assignee, column, due date (optional), blocked reason (optional),
  sub-tasks, activity timestamps.
- Self-tagging a card as **Blocked** requires a one-line reason. This is deliberately the cheapest
  possible action in the UI: one click, one sentence, no meeting. A blocked card with a reason is a
  *success* state for the system, not a failure — it means the stall was declared before the radar
  had to find it.

### 5.2 Stagnation Radar

The core mechanic. A background evaluation marks each active card green / amber / red based on time
since last meaningful activity.

**What counts as activity** (resets the clock):
- Column change
- Comment or blocked-reason added or edited
- Sub-task completed
- Explicit "still on it" ping from the assignee (one click from the card)

**What does not count:** opening the card, being assigned it, cosmetic edits (title typo, label change).
This distinction matters — if viewing a card resets its clock, the radar measures attention, not progress.

**Threshold model (D1):**

| Setting | System default | Manager-configurable |
|---------|----------------|----------------------|
| `to_do_amber_days` | 3 | Yes |
| `to_do_red_days` | 5 | Yes |
| `in_progress_amber_days` | 2 | Yes |
| `in_progress_red_days` | 4 | Yes |
| `blocked_amber_days` | 1 | Yes |
| `blocked_red_days` | 2 | Yes |
| `count_weekends` | false | Yes |
| `pause_during_pto` | true | Yes |

Resolution order for any threshold: **team setting → system default**. A team that has never opened
the settings screen gets a working radar on day one. `Backlog` and `Done` are never evaluated.

`count_weekends: false` and `pause_during_pto: true` are defaults for a reason — a radar that turns
every Monday morning red teaches people to ignore it within two weeks.

**Threshold changes are not retroactive to flag history.** Lowering a threshold re-evaluates current
cards immediately; it does not rewrite past flag records, so the Pulse dashboard's historical trend
stays honest across a tuning change.

### 5.3 Micro-Task Catalyst

For the avoidance failure mode. Opened from any card.

1. User (or a suggestion prompt) breaks the task into steps each estimated under 5 minutes.
2. Each step gets a **Just Start** button that begins a **120-second commitment timer**.
3. At 120 seconds the user is explicitly offered: *stop here* (and the step is still marked as
   progress) or *keep going*. Stopping at 120 seconds must never be presented as failure — the
   commitment was 120 seconds and it was honoured.
4. Any Catalyst activity counts as card activity and resets the stagnation clock.

The 120-second commitment is the whole mechanic: it lowers the psychological cost of starting below
the cost of continuing to avoid. Breaking that promise (nagging at 120s, guilt-tripping on stop)
breaks the feature.

### 5.4 Flag visibility setting (D2)

Team-level, three levels, default **Team**:

| Level | Who sees a card's stagnation flag |
|-------|-----------------------------------|
| **Team** *(default)* | Everyone on the team, on every card |
| **Owner + Lead** | The card's assignee and the team lead |
| **Owner only** | The card's assignee; leads see aggregate counts on the Pulse dashboard but not which card or whose |

Aggregate metrics on the Pulse dashboard remain available to the lead at every level — what changes
is attribution, not the existence of the signal. Changing the level is logged and announced in-app
to the whole team, because a silent change to who can see what is exactly the kind of thing that
erodes trust in the tool.

### 5.5 Deep Work / Focus Blocks

- Any member can start a personal Focus Block; a lead can start a **team-wide** one.
- Duration presets (25 / 30 / 50 / 90 min) plus custom.
- Participants' presence status flips to **Deep Work** with the block's end time shown.
- In-app effects during a block: non-urgent in-app notifications are queued rather than delivered,
  and are released as a single digest when the block ends. Mentions marked urgent still break through.
- A block can be ended early by its participant, always, with no confirmation dialog.

> **Open decision — external integration scope (flagged before build, see §9 OD-1).** Whether
> Deep Work suppresses Slack/Teams pings, or is only a status shown inside MPP, is a materially
> different build. **v1 assumption: in-app only**, with Slack presence sync as a v1.1 add-on behind
> the integration boundary described in §7.4. Rationale and cost in §9.

### 5.6 Team Pulse dashboard

Amina's landing view.

- Current stagnant flags (amber/red), grouped by column, respecting the §5.4 visibility level.
- Completion rate: cards moved to Done per week, trailing 4 weeks.
- Average time-in-column per column, trailing 4 weeks.
- Flag rate trend — *are we generating more or fewer flags than last week?* This is the number that
  tells Amina whether her thresholds are calibrated, and it is the one she should look at before
  changing them.
- Active Focus Blocks and who is in Deep Work right now.

### 5.7 PWA behaviour

- Installable, offline-capable. Offline: read the board, create cards, move cards, add blocked
  reasons, run Catalyst timers. Writes queue and sync on reconnect with last-write-wins per field.
- Web Push for: red flag raised on your own card, team-wide Focus Block started, mention, digest
  release at end of a Focus Block.
- Push is opt-in per category; a user who declines push still gets everything in-app.

## 6. Persona workflow (walkthrough)

**Amina, team lead, 8-person marketing team — a Monday.**

1. **9:00 AM** — Amina opens the dashboard to the **Team Pulse** view. Two cards are flagged red by
   the Stagnation Radar; both have been in "In Progress" for 4+ days, past her team's configured
   `in_progress_red_days` threshold.
2. She clicks into the first. It is a teammate's card, visible to her because the team is on the
   default **Team** visibility level. She doesn't need to ping anyone — the teammate has already
   self-tagged it **Blocked** with a one-line reason. The system worked: the stall was declared,
   not discovered.
3. **9:15 AM** — with a client deadline approaching, Amina starts a **team-wide 30-minute Focus
   Block**. Everyone's presence flips to **Deep Work**; in-app notifications queue until the block
   ends. *(Whether Slack/Teams pings are also suppressed depends on OD-1.)*
4. Meanwhile **Josh** has been avoiding the other flagged card — "Rewrite Q3 report". He opens the
   **Micro-Task Catalyst**, breaks it into four sub-5-minute steps, and hits **Just Start** on step
   one for a 120-second commitment. That activity clears the card's red flag, because the clock
   measures movement and the card moved.
5. **End of day** — Amina checks Pulse again: completion rate ticked up, no new stagnant flags. Two
   flags felt slightly aggressive for her team's pace, so she nudges `in_progress_red_days` from 4
   to 5 for next week. The change applies to live cards immediately and leaves the historical trend
   line intact.

## 7. Technical stack

### 7.1 Recommendation

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | **React + Tailwind CSS** (Vite) | Fast to build, large ecosystem, good PWA tooling via the Vite PWA plugin |
| State / realtime | **Supabase (Postgres)** | Real-time sync out of the box — needed for live Kanban updates and Deep Work presence |
| Auth | **Supabase Auth** | Email/SSO login for a 3–20 person team; no reason to build this |
| Push notifications | **Web Push API + FCM** | Native PWA push support; free tier is ample at this team size |
| Hosting | **Vercel** (Netlify equivalent) | Zero-config PWA deployment; free tier covers a small internal tool |
| Offline storage | **IndexedDB via Workbox** | Standard PWA offline caching for the board and queued writes |

### 7.2 Supabase over Firebase

Supabase gives a real relational database. Every reporting surface in this product — stagnation
rates, completion rates, time-in-column averages, flag-rate trends — is an aggregate over time-series
event data. In Postgres those are SQL queries against an `activity_events` table, written once and
changed freely. In Firestore they require either denormalised counters maintained on write or
client-side aggregation over a fan-out read, and every new dashboard metric becomes a schema
migration plus a backfill.

For a dashboard-heavy app this matters more than it looks on day one. It is also the decision that
is most expensive to reverse.

Row Level Security carries the §5.4 visibility rules at the database level rather than in UI code,
which is the other reason to prefer it here: "Owner only" that is enforced only by a hidden div is
not a privacy setting.

### 7.3 Data model sketch

```
teams            (id, name, created_at)
users            (id, team_id, email, display_name, role)          -- role: 'lead' | 'member'
team_settings    (team_id PK, thresholds jsonb, flag_visibility,
                  count_weekends, pause_during_pto, updated_by, updated_at)
cards            (id, team_id, title, description, column, assignee_id,
                  blocked_reason, due_date, created_at, completed_at)
sub_tasks        (id, card_id, title, est_minutes, completed_at, position)
activity_events  (id, card_id, user_id, kind, resets_clock bool, created_at)
stagnation_flags (id, card_id, level, raised_at, cleared_at, threshold_snapshot jsonb)
focus_blocks     (id, team_id, started_by, scope, starts_at, ends_at)
focus_block_participants (block_id, user_id, left_early_at)
```

Two notes. `activity_events.resets_clock` makes the §5.2 activity/non-activity distinction a data
property rather than logic scattered across call sites. `stagnation_flags.threshold_snapshot` records
the thresholds in force when the flag was raised, which is what keeps historical trends readable
after a manager retunes.

Because scope is single-team (D3), `team_id` exists for query clarity and a possible future, not as
a tenancy boundary. No tenant-isolation work is in scope.

### 7.4 Integration boundary

External integrations (Slack/Teams presence, calendar) sit behind one internal interface —
`PresenceSink` — with an in-app implementation as the default. This is what keeps OD-1 a
configuration decision rather than a rewrite: adding Slack later means adding an implementation,
not threading integration calls through the focus-block feature.

## 8. Non-goals (v1)

- Multi-tenant architecture, billing, or a customer-facing admin surface (D3)
- Time tracking or billable-hours reporting
- Individual performance scoring, leaderboards, or any ranking of people
- Native mobile apps (the PWA is the mobile story)
- Cross-team rollups or org-level dashboards
- AI-generated task breakdown in v1 — the Catalyst is manual first; suggestion is a fast-follow once
  there is real data on how people actually split tasks

## 9. Open decisions

**OD-1 — Does Deep Work suppress external pings?** *(raised by the workflow walkthrough; needs a
call before development starts)*

| Option | Build cost | What Amina gets |
|--------|-----------|-----------------|
| **A. In-app status only** *(v1 assumption)* | Low — presence field, UI, in-app notification queue | Status visible inside MPP; teammates who look will know not to interrupt. Slack still pings. |
| **B. Slack/Teams presence sync** | Medium — OAuth app, workspace install, token storage, status write/revert, failure handling | Status flips in Slack too. Real interruption reduction, since Slack is where interruptions come from. |
| **C. Full notification suppression / DND control** | High — Slack DND API, per-user consent, edge cases around urgent messages, "who can override" policy | Genuine protected focus time, and the largest surface for getting it wrong (a suppressed urgent message is a serious failure) |

Recommendation: **ship A in v1, plan B for v1.1.** Option A is honest about what it does, and most
of the value of a Focus Block for an 8-person co-located-ish team comes from the shared signal
rather than from technical enforcement. Option C should wait until the team has actually used
Focus Blocks and can say whether Slack is the real leak. The §7.4 boundary keeps the upgrade cheap.

**OD-2 — Default flag visibility level.** D2 sets **Team**, and the setting ships in v1 (§5.4). Open
sub-question: should a *new* team be walked through the choice during onboarding rather than
silently defaulted? Recommendation: yes — one screen, three options, default pre-selected. A team
that consciously chose "Team" reacts very differently to its first red flag than one that discovers
the setting after being surprised by it.

**OD-3 — Who can change thresholds?** D1 says "manager-configurable". Sub-question: lead only, or
lead-proposes/team-confirms? Recommendation for a single internal team: lead-only, with the change
announced in-app — the same transparency rule as §5.4.

## 10. Success criteria (first 8 weeks)

| Signal | Target | Why it's the right measure |
|--------|--------|---------------------------|
| Median time a card spends flagged red | Falling week over week | The radar's job is shortening stalls, not counting them |
| Share of stalls self-declared as Blocked before the radar flags them | Rising | The healthiest possible outcome: the team surfaces stalls itself |
| Catalyst "Just Start" sessions that continue past 120 seconds | ≥ 40% | Confirms the mechanic starts real work, not just timers |
| Threshold edits by the lead | A few in weeks 1–3, then near zero | Calibration converging rather than the lead fighting the tool |
| Weekly active users | ≥ 7 of 8 | If people quietly stop opening it, nothing else here matters |

An anti-signal worth watching explicitly: **cards created already in "In Progress"**, or a rise in
cosmetic edits on stale cards. Either means people are gaming the clock, which means the radar is
being read as judgement rather than as help — and the fix is in §5.4 and the thresholds, not in
tightening detection.
