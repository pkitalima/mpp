import { useMemo, useState } from 'react';
import { useStore } from '../../state/store';
import {
  averageDaysInColumn,
  cardsCompletedIn,
  flagsRaisedIn,
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
import { columnLabel } from '../../domain/types';
import type { WeekBucket } from '../../domain/metrics';
import { formatDays, formatRelative } from '../../domain/time';
import { activeBlocks } from '../../domain/focus';
import { ColumnChart, Meter, SERIES_BLUE, SERIES_ORANGE, StatTile } from '../components/Charts';
import { FlagChip } from '../components/Flag';

export function PulseView({ onOpenCard }: { onOpenCard: (cardId: string) => void }) {
  const { snapshot, viewer, settings, evaluations, now } = useStore();
  const nowIso = useMemo(() => new Date(now).toISOString(), [now]);
  const buckets = useMemo(() => weekBuckets(now, 4), [now]);
  // Which bar, in which chart, is opened. Clicking the same bar again closes it.
  const [drill, setDrill] = useState<{ chart: 'completions' | 'flags'; index: number } | null>(null);

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
          <ColumnChart
            data={toPoints(stats.completions, buckets)}
            color={SERIES_BLUE}
            selectLabel="List the cards completed"
            selectedIndex={drill?.chart === 'completions' ? drill.index : null}
            onSelect={(index) =>
              setDrill((current) =>
                current?.chart === 'completions' && current.index === index
                  ? null
                  : { chart: 'completions', index },
              )
            }
          />
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
          <ColumnChart
            data={toPoints(stats.flags, buckets)}
            color={SERIES_ORANGE}
            selectLabel="List the flags raised"
            selectedIndex={drill?.chart === 'flags' ? drill.index : null}
            onSelect={(index) =>
              setDrill((current) =>
                current?.chart === 'flags' && current.index === index ? null : { chart: 'flags', index },
              )
            }
          />
        </div>
      </section>

      {drill && buckets[drill.index] && (
        <BarDetail
          chart={drill.chart}
          bucket={buckets[drill.index]!}
          onClose={() => setDrill(null)}
          onOpenCard={onOpenCard}
        />
      )}

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
                        {card.blockedReason ? `blocked — ${card.blockedReason}` : columnLabel(evaluation.column)}
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

/**
 * The rows behind a bar. A flag list is attribution, not just a count, so it obeys the team's
 * visibility setting exactly as the board does — a lead on "Owner only" gets the number from the
 * chart and is told what the list cannot show them.
 */
function BarDetail({
  chart,
  bucket,
  onClose,
  onOpenCard,
}: {
  chart: 'completions' | 'flags';
  bucket: WeekBucket;
  onClose: () => void;
  onOpenCard: (cardId: string) => void;
}) {
  const { snapshot, viewer, settings, now } = useStore();
  if (!viewer) return null;

  const cardsById = new Map(snapshot.cards.map((card) => [card.id, card]));
  const completed = chart === 'completions' ? cardsCompletedIn(snapshot.cards, bucket) : [];
  const raised = chart === 'flags' ? flagsRaisedIn(snapshot.flags, bucket) : [];
  const visibleFlags = raised.filter((flag) => {
    const card = cardsById.get(flag.cardId);
    return card ? canSeeFlag(viewer, card, settings.flagVisibility) : false;
  });
  const hidden = raised.length - visibleFlags.length;

  const total = chart === 'completions' ? completed.length : raised.length;
  const heading =
    chart === 'completions'
      ? `Completed ${bucket.label.toLowerCase()}`
      : `Flags raised ${bucket.label.toLowerCase()}`;

  return (
    <section className="rounded-xl border border-slate-300 bg-white">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-800">
          {heading}
          <span className="ml-2 font-normal text-slate-500">
            {total} {total === 1 ? 'card' : chart === 'completions' ? 'cards' : 'flags'}
          </span>
        </h2>
        <button onClick={onClose} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
          Close
        </button>
      </header>

      {total === 0 && (
        <p className="px-4 py-6 text-center text-sm text-slate-500">
          {chart === 'completions' ? 'Nothing was finished that week.' : 'Nothing was flagged that week.'}
        </p>
      )}

      <ul className="divide-y divide-slate-100">
        {chart === 'completions' &&
          completed.map((card) => {
            const owner = snapshot.users.find((u) => u.id === card.assigneeId);
            return (
              <li key={card.id}>
                <button
                  onClick={() => onOpenCard(card.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{card.title}</span>
                  <span className="shrink-0 text-xs text-slate-500">{owner?.displayName ?? 'Unassigned'}</span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {card.completedAt ? formatRelative(card.completedAt, now) : ''}
                  </span>
                </button>
              </li>
            );
          })}

        {chart === 'flags' &&
          visibleFlags.map((flag) => {
            const card = cardsById.get(flag.cardId);
            const owner = snapshot.users.find((u) => u.id === card?.assigneeId);
            return (
              <li key={flag.id}>
                <button
                  onClick={() => card && onOpenCard(card.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50"
                >
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-full ${
                      flag.level === 'red' ? 'bg-rose-500' : 'bg-amber-500'
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                    {card?.title ?? 'Card since deleted'}
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {flag.level === 'red' ? 'Stalled' : 'Slowing'} in {columnLabel(flag.thresholdSnapshot.column)}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {owner?.displayName ?? 'Unassigned'} · {formatRelative(flag.raisedAt, now)}
                  </span>
                </button>
              </li>
            );
          })}
      </ul>

      {chart === 'flags' && hidden > 0 && (
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
          {hidden} more {hidden === 1 ? 'flag is' : 'flags are'} counted in the chart but private to
          {' '}their owners at this visibility level.
        </p>
      )}

      {chart === 'flags' && total > 0 && (
        <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-400">
          Each flag shows the threshold that was in force when it was raised, not today's.
        </p>
      )}
    </section>
  );
}
