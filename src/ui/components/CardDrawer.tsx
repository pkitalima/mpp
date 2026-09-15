import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { visibleEvaluation } from '../../domain/visibility';
import { formatDays, formatRelative } from '../../domain/time';
import { COLUMNS, columnLabel, type ActivityEvent, type Card } from '../../domain/types';
import { FlagChip } from './Flag';
import { CatalystModal } from './CatalystModal';

const KIND_LABEL: Record<string, string> = {
  created: 'created',
  column_changed: 'moved',
  comment_added: 'commented',
  blocked_reason_set: 'flagged as blocked',
  subtask_completed: 'finished a step',
  still_on_it: 'said “still on it”',
  catalyst_started: 'started the Catalyst',
  catalyst_step_committed: 'kept a 120-second commitment',
  viewed: 'opened the card',
  title_edited: 'edited details',
  assigned: 'reassigned',
};

export function CardDrawer({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const { snapshot, viewer, settings, evaluations, actions, now } = useStore();
  const card = snapshot.cards.find((c) => c.id === cardId) ?? null;
  const [comment, setComment] = useState('');
  const [blockedDraft, setBlockedDraft] = useState('');
  const [editingBlocked, setEditingBlocked] = useState(false);
  const [catalystOpen, setCatalystOpen] = useState(false);

  useEffect(() => {
    // Opening a card is attention, not progress — recorded, but it does not reset the clock.
    if (card) void actions.viewCard(card.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const events = useMemo(
    () =>
      snapshot.events
        .filter((e) => e.cardId === cardId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 25),
    [snapshot.events, cardId],
  );

  if (!card || !viewer) return null;
  const evaluation = visibleEvaluation(viewer, card, evaluations.get(card.id), settings.flagVisibility);
  const assignee = snapshot.users.find((u) => u.id === card.assigneeId) ?? null;
  const steps = snapshot.subTasks.filter((s) => s.cardId === card.id);
  const doneSteps = steps.filter((s) => s.completedAt).length;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/20" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <header className="border-b border-slate-200 p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <input
              value={card.title}
              onChange={(e) => void actions.editCard(card.id, { title: e.target.value })}
              className="w-full rounded-lg border border-transparent px-1 py-0.5 text-lg font-semibold text-slate-900 hover:border-slate-200 focus:border-slate-400 focus:outline-none"
            />
            <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">
              Close
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              value={card.column}
              onChange={(e) => void actions.moveCard(card.id, e.target.value as Card['column'])}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            >
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={card.assigneeId ?? ''}
              onChange={(e) => void actions.editCard(card.id, { assigneeId: e.target.value || null })}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="">Unassigned</option>
              {snapshot.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName}
                </option>
              ))}
            </select>
            {evaluation && <FlagChip evaluation={evaluation} />}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {evaluation && evaluation.level !== 'green' && (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {/* The copy describes the card, never the person holding it. */}
              <p className="text-sm text-slate-700">
                This card has not moved in <strong>{formatDays(evaluation.activeDays)}</strong>.{' '}
                {columnLabel(evaluation.column)} turns {evaluation.level} at{' '}
                {evaluation.level === 'red' ? evaluation.threshold.redDays : evaluation.threshold.amberDays} days.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => void actions.stillOnIt(card.id)}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                >
                  Still on it
                </button>
                <button
                  onClick={() => setCatalystOpen(true)}
                  className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                >
                  Break it down
                </button>
              </div>
            </div>
          )}

          <section className="mb-4">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Blocked?</h3>
            {card.blockedReason && !editingBlocked ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm text-amber-900">{card.blockedReason}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => {
                      setBlockedDraft(card.blockedReason ?? '');
                      setEditingBlocked(true);
                    }}
                    className="text-xs font-medium text-amber-800 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void actions.setBlockedReason(card.id, null)}
                    className="text-xs font-medium text-amber-800 hover:underline"
                  >
                    Unblocked now
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!blockedDraft.trim()) return;
                  void actions.setBlockedReason(card.id, blockedDraft.trim());
                  setBlockedDraft('');
                  setEditingBlocked(false);
                }}
                className="flex gap-2"
              >
                <input
                  value={blockedDraft}
                  onChange={(e) => setBlockedDraft(e.target.value)}
                  placeholder="One line: what is holding this up?"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500"
                />
                <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Tag blocked
                </button>
              </form>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Saying it early is the win — a declared stall never needs to be discovered.
            </p>
          </section>

          <section className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Steps {steps.length > 0 && `(${doneSteps}/${steps.length})`}
              </h3>
              <button
                onClick={() => setCatalystOpen(true)}
                className="text-xs font-medium text-slate-600 hover:underline"
              >
                Open Catalyst
              </button>
            </div>
            {steps.length === 0 ? (
              <p className="text-sm text-slate-500">No steps yet.</p>
            ) : (
              <ul className="space-y-1">
                {steps.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={s.completedAt !== null}
                      onChange={() => void actions.toggleSubTask(s.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className={s.completedAt ? 'text-slate-400 line-through' : 'text-slate-700'}>
                      {s.title}
                    </span>
                    <span className="text-xs text-slate-400">{s.estMinutes}m</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Activity</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!comment.trim()) return;
                void actions.addComment(card.id, comment.trim());
                setComment('');
              }}
              className="mb-3 flex gap-2"
            >
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a note…"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500"
              />
              <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Post
              </button>
            </form>
            <ul className="space-y-2">
              {events.map((event) => (
                <ActivityRow key={event.id} event={event} now={now} names={snapshot.users} />
              ))}
            </ul>
          </section>
        </div>

        <footer className="border-t border-slate-200 px-4 py-2 text-xs text-slate-400">
          {assignee ? `${assignee.displayName} · ` : ''}created {formatRelative(card.createdAt, now)}
        </footer>
      </aside>

      {catalystOpen && <CatalystModal card={card} onClose={() => setCatalystOpen(false)} />}
    </>
  );
}

function ActivityRow({
  event,
  now,
  names,
}: {
  event: ActivityEvent;
  now: number;
  names: { id: string; displayName: string }[];
}) {
  const who = names.find((u) => u.id === event.userId)?.displayName ?? 'Someone';
  return (
    <li className="flex gap-2 text-sm">
      <span
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
          event.resetsClock ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
        title={event.resetsClock ? 'Counted as movement' : 'Did not reset the stagnation clock'}
      />
      <div className="min-w-0">
        <p className="text-slate-700">
          <span className="font-medium">{who}</span> {KIND_LABEL[event.kind] ?? event.kind}
          {event.detail && <span className="text-slate-500"> — {event.detail}</span>}
        </p>
        <p className="text-[11px] text-slate-400">{formatRelative(event.createdAt, now)}</p>
      </div>
    </li>
  );
}
