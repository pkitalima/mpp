import { useMemo } from 'react';
import { useStore } from '../../state/store';
import {
  averageDaysInColumn,
  cardsCreatedInProgress,
  catalystContinuationRate,
  completionsPerWeek,
  flagsRaisedPerWeek,
  medianRedDurationDays,
  selfDeclaredShare,
  trendDirection,
  weekBuckets,
} from '../../domain/metrics';
import { canSeeAggregates, canSeeFlag } from '../../domain/visibility';
import { formatDays } from '../../domain/time';
import { activeBlocks } from '../../domain/focus';
import { ColumnChart, Meter, SERIES_BLUE, SERIES_ORANGE, StatTile } from '../components/Charts';
import { FlagChip } from '../components/Flag';

export function PulseView({ onOpenCard }: { onOpenCard: (cardId: string) => void }) {
  const { snapshot, viewer, settings, evaluations, now } = useStore();
  const nowIso = useMemo(() => new Date(now).toISOString(), [now]);
  const buckets = useMemo(() => weekBuckets(now, 4), [now]);

  const stats = useMemo(() => {
    return {
      completions: completionsPerWeek(snapshot.cards, buckets),
      flags: flagsRaisedPerWeek(snapshot.flags, buckets),
      medianRed: medianRedDurationDays(snapshot.flags, settings, nowIso),
      columns: averageDaysInColumn(snapshot.cards, snapshot.events, settings, nowIso),
      declared: selfDeclaredShare(snapshot.cards, snapshot.events, snapshot.flags),
      catalyst: catalystContinuationRate(snapshot.catalystSessions),
      gaming: cardsCreatedInProgress(snapshot.events),
    };
  }, [snapshot, settings, nowIso, buckets]);

  if (!viewer) return null;

  const flagged = [...evaluations.values()]
    .filter((e) => e.level !== 'green')
    .map((evaluation) => ({
      evaluation,
      card: snapshot.cards.find((c) => c.id === evaluation.cardId)!,
    }))
    .filter((row) => row.card)
    .sort((a, b) => b.evaluation.activeDays - a.evaluation.activeDays);

  // Aggregates stay with the lead at every visibility level; only attribution changes.
  const attributable = flagged.filter((row) => canSeeFlag(viewer, row.card, settings.flagVisibility));
  const hiddenCount = flagged.length - attributable.length;
  const seesAggregates = canSeeAggregates(viewer);

  const flagTrend = trendDirection(stats.flags);
  const blocks = activeBlocks(snapshot.focusBlocks, now);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Stalled now"
          value={flagged.filter((f) => f.evaluation.level === 'red').length}
          context={`${flagged.filter((f) => f.evaluation.level === 'amber').length} more slowing down`}
          tone={flagged.some((f) => f.evaluation.level === 'red') ? 'critical' : 'good'}
        />
        <StatTile
          label="Median red duration"
          value={stats.medianRed === null ? '—' : formatDays(stats.medianRed)}
          context="How long a stall lasts once flagged. Falling is the goal."
        />
        <StatTile
          label="Self-declared stalls"
          value={stats.declared.share === null ? '—' : `${Math.round(stats.declared.share * 100)}%`}
          context={`${stats.declared.declared} of ${stats.declared.total} stalls were tagged Blocked before the radar found them`}
          tone={stats.declared.share !== null && stats.declared.share >= 0.5 ? 'good' : 'neutral'}
        />
        <StatTile
          label="Catalyst continuation"
          value={stats.catalyst.rate === null ? '—' : `${Math.round(stats.catalyst.rate * 100)}%`}
          context={`${stats.catalyst.continued} of ${stats.catalyst.total} commitments kept going past 120s`}
          tone={stats.catalyst.rate !== null && stats.catalyst.rate >= 0.4 ? 'good' : 'neutral'}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-800">Cards completed per week</h2>
          <p className="mb-3 text-xs text-slate-500">Trailing four weeks.</p>
          <ColumnChart data={toPoints(stats.completions, buckets)} color={SERIES_BLUE} />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-800">Flags raised per week</h2>
          <p className="mb-3 text-xs text-slate-500">
            {flagTrend === 'up'
              ? 'More than last week — check the thresholds before chasing people.'
              : flagTrend === 'down'
                ? 'Fewer than last week.'
                : 'Level with last week.'}
          </p>
          <ColumnChart data={toPoints(stats.flags, buckets)} color={SERIES_ORANGE} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-800">Average time in column</h2>
        <div className="grid grid-cols-3 gap-3">
          <Meter label="To Do" value={stats.columns.todo} max={settings.thresholds.todo.redDays} suffix="d" />
          <Meter
            label="In Progress"
            value={stats.columns.in_progress}
            max={settings.thresholds.in_progress.redDays}
            suffix="d"
          />
          <Meter label="Blocked" value={stats.columns.blocked} max={settings.thresholds.blocked.redDays} suffix="d" />
        </div>
        <p className="mt-1.5 text-xs text-slate-400">Each meter is filled against that column's red threshold.</p>
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Needs a nudge</h2>
          {hiddenCount > 0 && (
            <p className="text-xs text-slate-500">
              {seesAggregates
                ? `${hiddenCount} more flagged, hidden by the team's visibility setting`
                : `${hiddenCount} flagged cards are private to their owners`}
            </p>
          )}
        </div>
        {attributable.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            Nothing is stalled. {hiddenCount > 0 ? 'At least, nothing you can see.' : 'Good week.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {attributable.map(({ card, evaluation }) => {
              const owner = snapshot.users.find((u) => u.id === card.assigneeId);
              return (
                <li key={card.id}>
                  <button
                    onClick={() => onOpenCard(card.id)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <FlagChip evaluation={evaluation} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{card.title}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {owner?.displayName ?? 'Unassigned'} ·{' '}
                        {card.blockedReason ? `blocked — ${card.blockedReason}` : evaluation.column.replace('_', ' ')}
                      </span>
                    </span>
                    {card.blockedReason && (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        already declared
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">In Deep Work right now</h2>
          {blocks.length === 0 ? (
            <p className="text-sm text-slate-500">Nobody is in a Focus Block.</p>
          ) : (
            <ul className="space-y-1.5">
              {blocks.map((block) => (
                <li key={block.id} className="text-sm text-slate-700">
                  <span className="font-medium">
                    {block.scope === 'team' ? 'Team block' : snapshot.users.find((u) => u.id === block.startedBy)?.displayName}
                  </span>{' '}
                  <span className="text-slate-500">
                    · {block.participantIds.length} {block.participantIds.length === 1 ? 'person' : 'people'} · until{' '}
                    {new Date(block.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {seesAggregates && (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-800">Worth watching</h2>
            <p className="text-sm text-slate-600">
              {stats.gaming} card{stats.gaming === 1 ? '' : 's'} created straight into In Progress.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              A rise here usually means the radar is being read as judgement rather than help. The fix is
              the thresholds and the visibility setting, not tighter detection.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function toPoints(values: number[], buckets: { label: string }[]) {
  return buckets.map((bucket, index) => ({ label: bucket.label, value: values[index] ?? 0 }));
}
