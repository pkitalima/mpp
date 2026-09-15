import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import { visibleEvaluation } from '../../domain/visibility';
import { presenceOf } from '../../domain/focus';
import { formatDays } from '../../domain/time';
import { COLUMNS, type Card, type ColumnId } from '../../domain/types';
import { BORDER_BY_LEVEL, FlagChip } from '../components/Flag';

type Filter = 'all' | 'mine' | 'flagged';

export function BoardView({ onOpenCard }: { onOpenCard: (cardId: string) => void }) {
  const { snapshot, viewer, settings, evaluations, actions, now } = useStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [dragOver, setDragOver] = useState<ColumnId | null>(null);
  const [adding, setAdding] = useState<ColumnId | null>(null);
  const [draft, setDraft] = useState('');

  const visible = useMemo(() => {
    if (!viewer) return [];
    return snapshot.cards.filter((card) => {
      if (filter === 'mine') return card.assigneeId === viewer.id;
      if (filter === 'flagged') {
        const evaluation = visibleEvaluation(viewer, card, evaluations.get(card.id), settings.flagVisibility);
        return evaluation !== null && evaluation.level !== 'green';
      }
      return true;
    });
  }, [snapshot.cards, viewer, filter, evaluations, settings.flagVisibility]);

  if (!viewer) return null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 py-3">
        {(['all', 'mine', 'flagged'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-2.5 py-1 text-sm font-medium capitalize ${
              filter === f ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            {f === 'flagged' ? 'Needs a nudge' : f}
          </button>
        ))}
      </div>

      <div className="flex flex-1 gap-3 overflow-x-auto px-4 pb-4">
        {COLUMNS.map((column) => {
          const cards = visible
            .filter((c) => c.column === column.id)
            .sort((a, b) => a.position - b.position);
          return (
            <section
              key={column.id}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(column.id);
              }}
              onDragLeave={() => setDragOver((c) => (c === column.id ? null : c))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const cardId = e.dataTransfer.getData('text/plain');
                if (cardId) void actions.moveCard(cardId, column.id);
              }}
              className={`flex w-72 shrink-0 flex-col rounded-xl bg-slate-200/60 ${
                dragOver === column.id ? 'column-drop-active' : ''
              }`}
            >
              <header className="flex items-center justify-between px-3 py-2">
                <h2 className="text-sm font-semibold text-slate-700">
                  {column.label}
                  <span className="ml-1.5 text-slate-400">{cards.length}</span>
                </h2>
                <button
                  onClick={() => {
                    setAdding(column.id);
                    setDraft('');
                  }}
                  className="rounded px-1.5 text-lg leading-none text-slate-400 hover:bg-slate-300 hover:text-slate-700"
                  aria-label={`Add a card to ${column.label}`}
                >
                  +
                </button>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                {adding === column.id && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!draft.trim()) return setAdding(null);
                      void actions.createCard({
                        title: draft.trim(),
                        column: column.id,
                        assigneeId: viewer.id,
                      });
                      setDraft('');
                      setAdding(null);
                    }}
                  >
                    <textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => setAdding(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setAdding(null);
                        if (e.key === 'Enter' && !e.shiftKey) e.currentTarget.form?.requestSubmit();
                      }}
                      rows={2}
                      placeholder="What needs doing?"
                      className="w-full resize-none rounded-lg border border-slate-300 bg-white p-2 text-sm outline-none focus:border-slate-500"
                    />
                  </form>
                )}

                {cards.map((card) => (
                  <CardTile key={card.id} card={card} onOpen={() => onOpenCard(card.id)} />
                ))}

                {cards.length === 0 && adding !== column.id && (
                  <p className="px-2 py-4 text-center text-xs text-slate-400">
                    {filter === 'flagged' ? 'Nothing stalled here.' : 'Empty'}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <p className="px-4 pb-3 text-xs text-slate-400">
        Radar: To Do amber {settings.thresholds.todo.amberDays}d / red {settings.thresholds.todo.redDays}d ·
        In Progress {settings.thresholds.in_progress.amberDays}d / {settings.thresholds.in_progress.redDays}d ·
        Blocked {settings.thresholds.blocked.amberDays}d / {settings.thresholds.blocked.redDays}d ·{' '}
        {settings.countWeekends ? 'weekends counted' : 'weekends not counted'} ·{' '}
        {new Date(now).toLocaleTimeString()}
      </p>
    </div>
  );
}

function CardTile({ card, onOpen }: { card: Card; onOpen: () => void }) {
  const { snapshot, viewer, settings, evaluations, now } = useStore();
  if (!viewer) return null;
  const evaluation = visibleEvaluation(viewer, card, evaluations.get(card.id), settings.flagVisibility);
  const assignee = snapshot.users.find((u) => u.id === card.assigneeId) ?? null;
  const presence = assignee ? presenceOf(assignee, snapshot.focusBlocks, now) : null;
  const steps = snapshot.subTasks.filter((s) => s.cardId === card.id);
  const doneSteps = steps.filter((s) => s.completedAt).length;

  return (
    <article
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', card.id)}
      onClick={onOpen}
      className={`card-tile cursor-pointer rounded-xl border-2 bg-white p-3 shadow-sm hover:shadow ${
        evaluation ? BORDER_BY_LEVEL[evaluation.level] : 'border-slate-200'
      }`}
    >
      <p className="mb-2 text-sm font-medium leading-snug text-slate-800">{card.title}</p>

      {card.blockedReason && (
        <p className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
          Blocked — {card.blockedReason}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {evaluation && evaluation.level !== 'green' && <FlagChip evaluation={evaluation} />}
        {evaluation && evaluation.level === 'green' && (
          <span className="text-xs text-slate-400">moved {formatDays(evaluation.activeDays)} ago</span>
        )}
        {steps.length > 0 && (
          <span className="text-xs text-slate-400">
            {doneSteps}/{steps.length} steps
          </span>
        )}
      </div>

      {assignee && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700">
            {initials(assignee.displayName)}
          </span>
          <span>{assignee.displayName.split(' ')[0]}</span>
          {presence?.status === 'deep_work' && (
            <span className="rounded bg-sky-100 px-1 text-[10px] font-medium text-sky-700">Deep Work</span>
          )}
          {assignee.awaySpans?.length ? (
            <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">away · clock paused</span>
          ) : null}
        </div>
      )}
    </article>
  );
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
