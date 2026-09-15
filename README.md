# MPP

Internal team productivity PWA for a single team (3–20 people). Makes stalled work visible
through a **Stagnation Radar**, lowers the cost of starting daunting tasks with a **Micro-Task
Catalyst**, and protects focused time with **Deep Work blocks** — all on a real-time Kanban board.

- **[Product Requirements Document](docs/PRD.md)** — problem, features, decisions, data model,
  stack rationale, open questions.

## Status

Pre-development. The PRD is at draft v0.2 with the stagnation model, stack, and scope decided.
One decision is open and blocks development of the Focus Block feature specifically: whether Deep
Work suppresses Slack/Teams pings or is an in-app status only (see PRD §9, OD-1).

## Intended stack

React + Tailwind (Vite PWA) · Supabase (Postgres + Auth + Realtime) · Web Push via FCM · Vercel ·
Workbox/IndexedDB for offline. Rationale in PRD §7.
