# MPP

Internal team productivity PWA for a single team (3–20 people). A real-time Kanban board with
three mechanics layered on it:

- **Stagnation Radar** — flags cards that have stopped moving, against per-column thresholds the
  team lead configures. Weekends and PTO don't age a card.
- **Micro-Task Catalyst** — breaks a daunting card into sub-5-minute steps, each startable with a
  120-second commitment. Stopping at 120 seconds is a kept promise, not a failure.
- **Deep Work blocks** — personal or team-wide focus windows that hold non-urgent notifications and
  release them as one digest.

Full product rationale: **[docs/PRD.md](docs/PRD.md)**.

## Open it in an IDE

Any VS Code-based editor — VS Code, Cursor, Antigravity — opens this the same way:

```bash
git clone https://github.com/pkitalima/mpp.git
cd mpp
git checkout claude/stagnation-radar-prd-tech-f1il1y
npm install
npm run dev
```

Then open the `mpp` folder in the editor. **Node 22.12 or newer is required** (Vitest 5 sets the
floor); `node -v` tells you what you have, and `.nvmrc` pins it for anyone using nvm. The editor
will offer the two recommended extensions from `.vscode/extensions.json` — Tailwind IntelliSense
matters here because Tailwind v4 keeps its configuration in `src/index.css` rather than a JS file.

## Quick start

```bash
npm install
npm run dev
```

That's it — no backend needed. With no Supabase credentials configured the app runs against
IndexedDB and seeds an eight-person marketing team mid-week, including the two stalled cards from
the PRD walkthrough. The header's person switcher stands in for signing in as a teammate; it is
also the fastest way to see what each flag-visibility level actually hides.

| Command | What it does |
|---------|--------------|
| `npm run dev` | Dev server |
| `npm run build` | Typecheck, then production build with service worker |
| `npm test` | Domain unit tests (57) |
| `npm run typecheck` | Types only |
| `npm run smoke` | End-to-end browser walkthrough against a running `npm run preview` |
| `npm run db:test` | Applies the migration to a throwaway Postgres and runs the RLS policy tests |
| `npm run supabase:check` | Tells you whether a Supabase project is set up correctly, and what is missing |

## Running against Supabase (multi-person)

1. Create a Supabase project at supabase.com (the free tier is ample for one team).
2. Run `supabase/migrations/0001_init.sql` in the project's SQL editor (or
   `psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql`).
3. `cp .env.example .env.local`, then fill in **Project URL** and the **anon public** key from
   Settings → API. The anon key is public by design — it ships inside the browser bundle, and RLS
   is what protects the data. The `service_role` key must never go in this file.
4. `npm run supabase:check` — it verifies the project is reachable, the schema is applied, RLS
   actually hides data from an unauthenticated request, and email sign-in is enabled.
5. `npm run dev`, then sign in with a magic link. The first person to sign in becomes the lead, and
   can put example work on the board from Settings → Load example board.

Magic links come back to wherever the app is served from, so add that origin under
Authentication → URL Configuration (`http://localhost:5173` for local development, plus your
deployed URL).

**The first person to sign in becomes the team lead** and can set thresholds and flag visibility;
everyone after that joins as a member. A bootstrap trigger on `auth.users` creates the member row,
the team and its settings — membership is not self-service, so no RLS policy lets a person insert
their own `users` row.

The same app then talks to Postgres with realtime subscriptions instead of IndexedDB — the storage
adapter is chosen at startup in `src/data/index.ts` and nothing above it changes.

The migration is not just tables. Row Level Security carries the flag-visibility rules at the
database level, because "Owner only" enforced by a hidden div is not a privacy setting, and
`pulse_flag_counts()` is `security definer` so a lead still gets aggregate counts at a visibility
level that hides the underlying rows. `npm run db:test` proves it: 19 assertions covering each
visibility level from each vantage point, who may change thresholds, and the bootstrap trigger.

## Architecture

```
src/
  domain/     Pure, tested, no React and no I/O — the radar, thresholds,
              visibility rules, Pulse metrics, day counting
  data/       Repository seam: IndexedDB adapter, Supabase adapter, shared schema
  state/      React store: loads a snapshot, ticks the clock, runs the flag
              reconciler, exposes actions
  ui/         Board, Pulse, Settings, card drawer, Catalyst
supabase/     Postgres schema + RLS
```

Three things are worth knowing before changing it:

1. **The radar is a function of time**, so the store ticks a clock and re-evaluates; flag
   *records* are written by a reconciler that compares current levels against open flags.
2. **Each flag stores the thresholds in force when it was raised.** Retuning changes what is
   flagged now without rewriting the trend the lead tuned against.
3. **`resets_clock` lives on the event row**, not in branching at call sites. Opening a card,
   renaming it, or being assigned it are attention, not progress — they must never reset the clock,
   and the card timeline marks which events counted.

## Not built yet

- **Web Push.** The PWA installs and works offline, and in-app notifications plus the Focus Block
  digest work today, but the FCM sender and push-subscription storage need a deployed backend.
- **Slack/Teams suppression during Deep Work.** v1 is in-app only, which is the open decision OD-1
  in the PRD, resolved as option A. The upgrade is additive rather than a rewrite.
- **Role management.** The first sign-in becomes the lead and the rest are members; changing that
  afterwards is a SQL update, not a screen.
