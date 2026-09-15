import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createRepository, type Repository } from '../data';
import { emptySnapshot, newId, type Snapshot } from '../data/schema';
import { buildSeed, DEMO_USER_ID, TEAM_ID } from '../data/local/seed';
import { evaluateBoard, reconcileFlags } from '../domain/stagnation';
import { resolveSettings, type ResolvedSettings } from '../domain/thresholds';
import { currentBlockFor, isInDeepWork, shouldQueue } from '../domain/focus';
import {
  CLOCK_RESETTING_KINDS,
  type ActivityEvent,
  type ActivityKind,
  type Card,
  type CatalystSession,
  type ColumnId,
  type Evaluation,
  type FocusScope,
  type QueuedNotification,
  type StagnationFlag,
  type SubTask,
  type TeamSettings,
  type User,
} from '../domain/types';

const TICK_MS = 30_000;

export type Status = 'loading' | 'signed_out' | 'ready' | 'error';

export interface StoreValue {
  ready: boolean;
  status: Status;
  error: string | null;
  backend: 'local' | 'supabase';
  snapshot: Snapshot;
  now: number;
  viewer: User | null;
  users: User[];
  cards: Card[];
  rawSettings: TeamSettings | null;
  settings: ResolvedSettings;
  evaluations: Map<string, Evaluation>;
  inDeepWork: boolean;
  actions: Actions;
}

export interface Actions {
  setViewer(userId: string): void;
  sendMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  retry(): void;
  createCard(input: { title: string; column: ColumnId; assigneeId: string | null; description?: string }): Promise<void>;
  moveCard(cardId: string, column: ColumnId): Promise<void>;
  editCard(cardId: string, patch: Partial<Pick<Card, 'title' | 'description' | 'assigneeId' | 'dueDate'>>): Promise<void>;
  setBlockedReason(cardId: string, reason: string | null): Promise<void>;
  addComment(cardId: string, text: string): Promise<void>;
  stillOnIt(cardId: string): Promise<void>;
  viewCard(cardId: string): Promise<void>;
  addSubTask(cardId: string, title: string, estMinutes: number): Promise<void>;
  toggleSubTask(subTaskId: string): Promise<void>;
  removeSubTask(subTaskId: string): Promise<void>;
  startCatalyst(cardId: string, subTaskId: string): Promise<string>;
  finishCatalyst(sessionId: string, continued: boolean): Promise<void>;
  saveSettings(patch: Partial<TeamSettings>): Promise<void>;
  startFocusBlock(scope: FocusScope, minutes: number): Promise<void>;
  endFocusBlock(blockId: string): Promise<void>;
  dismissNotification(id: string): Promise<void>;
  resetDemoData(): Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // A remembered viewer is a convenience; losing it is not worth breaking the app over.
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const repoRef = useRef<Repository | null>(null);
  repoRef.current ??= createRepository();
  const repo = repoRef.current;

  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // localStorage throws outright in a private window or a frame with site data blocked, and this
  // runs during render — an unguarded read here is a white screen, not a lost preference.
  const [viewerId, setViewerId] = useState<string>(() => readStored('mpp:viewer') ?? DEMO_USER_ID);
  const [now, setNow] = useState(() => Date.now());
  const reconciling = useRef(false);

  const ready = status === 'ready';

  const reload = useCallback(async () => {
    try {
      const loaded = await repo.load();
      setSnapshot(loaded);
      // Advance the clock with the data. Anything time-derived — a Focus Block that starts
      // "now", a card's age — is otherwise evaluated against a `now` up to a tick old, so a
      // block you just started reads as not yet begun and its bar does not appear.
      setNow(Date.now());
    } catch (cause) {
      // Failing loudly matters more here than failing gracefully: a silent empty board looks
      // exactly like a working board with nothing on it.
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  }, [repo]);

  // Track the session on backends that have one. The local build has no auth gateway.
  useEffect(() => {
    if (!repo.auth) return;
    const refresh = () => void repo.auth!.currentUserId().then(setAuthUserId);
    refresh();
    return repo.auth.onChange(refresh);
  }, [repo]);

  // Initial load, seeding the demo team on a first run against local storage.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setStatus('loading');
      setError(null);

      if (repo.auth) {
        const userId = await repo.auth.currentUserId();
        if (cancelled) return;
        if (!userId) {
          setStatus('signed_out');
          return;
        }
      }

      try {
        let loaded = await repo.load();
        if (loaded.users.length === 0 && repo.kind === 'local') {
          const seed = buildSeed(Date.now(), -new Date().getTimezoneOffset());
          await repo.put('users', seed.users);
          await repo.put('settings', seed.settings);
          await repo.put('cards', seed.cards);
          await repo.put('subTasks', seed.subTasks);
          await repo.put('events', seed.events);
          await repo.put('flags', seed.flags);
          await repo.put('catalystSessions', seed.catalystSessions);
          loaded = await repo.load();
        }
        if (cancelled) return;
        if (loaded.users.length === 0) {
          // Signed in, but nothing came back: almost always the migration has not been applied,
          // or this person has no members row. Say so rather than showing an empty board.
          throw new Error(
            'Signed in, but the team has no members. Apply supabase/migrations/0001_init.sql — the bootstrap trigger creates a member row on first sign-in.',
          );
        }
        setSnapshot(loaded);
        setStatus('ready');
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, authUserId, attempt]);

  // Live updates from other tabs (local) or other clients (Supabase).
  useEffect(() => repo.subscribe(() => void reload()), [repo, reload]);

  // The radar is a function of time, so the clock has to tick for it to be live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setNow(Date.now());
        void reload();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reload]);

  const rawSettings = snapshot.settings[0] ?? null;
  const settings = useMemo(() => resolveSettings(rawSettings), [rawSettings]);
  const nowIso = useMemo(() => new Date(now).toISOString(), [now]);

  const evaluations = useMemo(
    () => evaluateBoard(snapshot.cards, snapshot.events, settings, snapshot.users, nowIso),
    [snapshot.cards, snapshot.events, snapshot.users, settings, nowIso],
  );

  const viewer = useMemo(() => {
    if (repo.auth) {
      // No switching identities on a real backend — you are who you signed in as.
      return snapshot.users.find((u) => u.id === authUserId) ?? null;
    }
    return snapshot.users.find((u) => u.id === viewerId) ?? snapshot.users[0] ?? null;
  }, [repo, snapshot.users, viewerId, authUserId]);

  // Persist flag transitions so history survives threshold changes (PRD §5.2).
  useEffect(() => {
    if (!ready || reconciling.current) return;
    const { toOpen, toClose } = reconcileFlags(evaluations, snapshot.flags, nowIso);
    if (toOpen.length === 0 && toClose.length === 0) return;
    reconciling.current = true;
    void (async () => {
      try {
        const closed: StagnationFlag[] = snapshot.flags
          .filter((f) => toClose.includes(f.id))
          .map((f) => ({ ...f, clearedAt: nowIso }));
        const opened: StagnationFlag[] = toOpen.map((f) => ({ ...f, id: newId('fl') }));
        if (closed.length) await repo.put('flags', closed);
        if (opened.length) await repo.put('flags', opened);
        await reload();
      } finally {
        reconciling.current = false;
      }
    })();
  }, [ready, evaluations, snapshot.flags, nowIso, repo, reload]);

  const inDeepWork = viewer ? isInDeepWork(viewer.id, snapshot.focusBlocks, now) : false;

  const actions = useMemo<Actions>(() => {
    const record = async (
      cardId: string,
      kind: ActivityKind,
      extra: Partial<ActivityEvent> = {},
    ): Promise<void> => {
      const event: ActivityEvent = {
        id: newId('ev'),
        cardId,
        userId: viewerId,
        kind,
        resetsClock: CLOCK_RESETTING_KINDS.has(kind),
        createdAt: new Date().toISOString(),
        ...extra,
      };
      await repo.put('events', [event]);
    };

    const notify = async (userIds: string[], title: string, body: string, urgent = false) => {
      const created = new Date().toISOString();
      const rows: QueuedNotification[] = userIds.map((userId) => {
        const queued = shouldQueue({ urgent }, isInDeepWork(userId, snapshot.focusBlocks));
        return {
          id: newId('nt'),
          userId,
          title,
          body,
          urgent,
          createdAt: created,
          deliveredAt: queued ? null : created,
        };
      });
      await repo.put('notifications', rows);
    };

    const patchCard = async (cardId: string, patch: Partial<Card>) => {
      const card = snapshot.cards.find((c) => c.id === cardId);
      if (!card) return;
      await repo.put('cards', [{ ...card, ...patch }]);
    };

    return {
      setViewer(userId) {
        writeStored('mpp:viewer', userId);
        setViewerId(userId);
      },

      async sendMagicLink(email) {
        if (!repo.auth) throw new Error('This build has no sign-in.');
        await repo.auth.sendMagicLink(email);
      },

      async signOut() {
        await repo.auth?.signOut();
      },

      retry() {
        setAttempt((n) => n + 1);
      },

      async createCard({ title, column, assigneeId, description }) {
        const card: Card = {
          id: newId('c'),
          teamId: TEAM_ID,
          title,
          description: description ?? '',
          column,
          assigneeId,
          blockedReason: null,
          dueDate: null,
          createdAt: new Date().toISOString(),
          completedAt: null,
          position: snapshot.cards.length,
        };
        await repo.put('cards', [card]);
        await record(card.id, 'created', { toColumn: column });
        await reload();
      },

      async moveCard(cardId, column) {
        const card = snapshot.cards.find((c) => c.id === cardId);
        if (!card || card.column === column) return;
        await patchCard(cardId, {
          column,
          completedAt: column === 'done' ? new Date().toISOString() : null,
        });
        await record(cardId, 'column_changed', { toColumn: column, detail: column });
        await reload();
      },

      async editCard(cardId, patch) {
        await patchCard(cardId, patch);
        // Renaming a card is attention, not progress — it must not reset the clock.
        await record(cardId, 'title_edited');
        await reload();
      },

      async setBlockedReason(cardId, reason) {
        await patchCard(cardId, { blockedReason: reason });
        if (reason) {
          await record(cardId, 'blocked_reason_set', { detail: reason });
          const card = snapshot.cards.find((c) => c.id === cardId);
          const others = snapshot.users.filter((u) => u.id !== viewerId).map((u) => u.id);
          await notify(others, 'Blocked', `${card?.title ?? 'A card'} — ${reason}`);
        }
        await reload();
      },

      async addComment(cardId, text) {
        await record(cardId, 'comment_added', { detail: text });
        await reload();
      },

      async stillOnIt(cardId) {
        await record(cardId, 'still_on_it', { detail: 'Still on it' });
        await reload();
      },

      async viewCard(cardId) {
        // One view row per person per hour. Views never move the clock, so more than that is
        // noise in the very timeline people use to check why a card is flagged.
        const cutoff = Date.now() - 3_600_000;
        const seenRecently = snapshot.events.some(
          (e) =>
            e.cardId === cardId &&
            e.kind === 'viewed' &&
            e.userId === viewerId &&
            Date.parse(e.createdAt) > cutoff,
        );
        if (!seenRecently) await record(cardId, 'viewed');
      },

      async addSubTask(cardId, title, estMinutes) {
        const subTask: SubTask = {
          id: newId('st'),
          cardId,
          title,
          estMinutes,
          completedAt: null,
          position: snapshot.subTasks.filter((s) => s.cardId === cardId).length,
        };
        await repo.put('subTasks', [subTask]);
        await reload();
      },

      async toggleSubTask(subTaskId) {
        const subTask = snapshot.subTasks.find((s) => s.id === subTaskId);
        if (!subTask) return;
        const completedAt = subTask.completedAt ? null : new Date().toISOString();
        await repo.put('subTasks', [{ ...subTask, completedAt }]);
        if (completedAt) await record(subTask.cardId, 'subtask_completed', { detail: subTask.title });
        await reload();
      },

      async removeSubTask(subTaskId) {
        await repo.remove('subTasks', [subTaskId]);
        await reload();
      },

      async startCatalyst(cardId, subTaskId) {
        const session: CatalystSession = {
          id: newId('cs'),
          cardId,
          subTaskId,
          userId: viewerId,
          startedAt: new Date().toISOString(),
          committedAt: null,
          continued: false,
        };
        await repo.put('catalystSessions', [session]);
        const step = snapshot.subTasks.find((s) => s.id === subTaskId);
        await record(cardId, 'catalyst_started', { detail: step?.title });
        await reload();
        return session.id;
      },

      async finishCatalyst(sessionId, continued) {
        const session = snapshot.catalystSessions.find((s) => s.id === sessionId);
        if (!session) return;
        await repo.put('catalystSessions', [
          { ...session, committedAt: new Date().toISOString(), continued },
        ]);
        await record(session.cardId, 'catalyst_step_committed', {
          detail: continued ? 'kept going' : 'kept the 120-second promise',
        });
        await reload();
      },

      async saveSettings(patch) {
        const current: TeamSettings = rawSettings ?? {
          teamId: TEAM_ID,
          thresholds: {},
          flagVisibility: null,
          countWeekends: null,
          pauseDuringPto: null,
          tzOffsetMinutes: null,
          updatedBy: null,
          updatedAt: null,
        };
        const next: TeamSettings = {
          ...current,
          ...patch,
          updatedBy: viewerId,
          updatedAt: new Date().toISOString(),
        };
        await repo.put('settings', [next]);
        // A silent change to who can see what is exactly what erodes trust in the tool,
        // so a visibility change is announced to the whole team (PRD §5.4).
        if (patch.flagVisibility && patch.flagVisibility !== current.flagVisibility) {
          const viewerName = snapshot.users.find((u) => u.id === viewerId)?.displayName ?? 'A lead';
          await notify(
            snapshot.users.map((u) => u.id),
            'Flag visibility changed',
            `${viewerName} set stagnation flags to "${patch.flagVisibility}".`,
            true,
          );
        }
        await reload();
      },

      async startFocusBlock(scope, minutes) {
        const startsAt = new Date();
        const participantIds =
          scope === 'team' ? snapshot.users.map((u) => u.id) : [viewerId];
        const block = {
          id: newId('fb'),
          teamId: TEAM_ID,
          startedBy: viewerId,
          scope,
          startsAt: startsAt.toISOString(),
          endsAt: new Date(startsAt.getTime() + minutes * 60_000).toISOString(),
          endedEarlyAt: null,
          participantIds,
        };
        await repo.put('focusBlocks', [block]);
        if (scope === 'team') {
          const starter = snapshot.users.find((u) => u.id === viewerId)?.displayName ?? 'Someone';
          await notify(
            participantIds.filter((id) => id !== viewerId),
            'Team Focus Block started',
            `${starter} started a ${minutes}-minute block. Notifications will hold until it ends.`,
            true,
          );
        }
        await reload();
      },

      async endFocusBlock(blockId) {
        const block = snapshot.focusBlocks.find((b) => b.id === blockId);
        if (!block) return;
        await repo.put('focusBlocks', [{ ...block, endedEarlyAt: new Date().toISOString() }]);
        // Release the digest: everything held during the block is delivered at once.
        const held = snapshot.notifications.filter(
          (n) => n.deliveredAt === null && block.participantIds.includes(n.userId),
        );
        if (held.length) {
          const deliveredAt = new Date().toISOString();
          await repo.put('notifications', held.map((n) => ({ ...n, deliveredAt })));
        }
        await reload();
      },

      async dismissNotification(id) {
        await repo.remove('notifications', [id]);
        await reload();
      },

      async resetDemoData() {
        await repo.reset?.();
        const seed = buildSeed(Date.now(), -new Date().getTimezoneOffset());
        await repo.put('users', seed.users);
        await repo.put('settings', seed.settings);
        await repo.put('cards', seed.cards);
        await repo.put('subTasks', seed.subTasks);
        await repo.put('events', seed.events);
        await repo.put('flags', seed.flags);
        await repo.put('catalystSessions', seed.catalystSessions);
        await reload();
      },
    };
  }, [repo, reload, snapshot, viewerId, rawSettings]);

  // When a block ends on its own, release whatever was held for the viewer.
  useEffect(() => {
    if (!viewer || !ready) return;
    if (currentBlockFor(viewer.id, snapshot.focusBlocks, now)) return;
    const held = snapshot.notifications.filter((n) => n.userId === viewer.id && n.deliveredAt === null);
    if (held.length === 0) return;
    const deliveredAt = new Date().toISOString();
    void repo.put('notifications', held.map((n) => ({ ...n, deliveredAt }))).then(reload);
  }, [viewer, ready, snapshot.focusBlocks, snapshot.notifications, now, repo, reload]);

  const value: StoreValue = {
    ready,
    status,
    error,
    backend: repo.kind,
    snapshot,
    now,
    viewer,
    users: snapshot.users,
    cards: snapshot.cards,
    rawSettings,
    settings,
    evaluations,
    inDeepWork,
    actions,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore must be used inside <StoreProvider>');
  return value;
}
