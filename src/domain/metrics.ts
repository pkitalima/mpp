import { countableDaysBetween } from './time';
import type { ResolvedSettings } from './thresholds';
import {
  isEvaluated,
  type ActivityEvent,
  type Card,
  type CatalystSession,
  type EvaluatedColumn,
  type StagnationFlag,
} from './types';

const DAY_MS = 86_400_000;

export interface WeekBucket {
  label: string;
  start: number;
  end: number;
}

/** Trailing `weeks` buckets ending now, oldest first. */
export function weekBuckets(now: number = Date.now(), weeks = 4): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    const end = now - i * 7 * DAY_MS;
    buckets.push({
      start: end - 7 * DAY_MS,
      end,
      label: i === 0 ? 'This week' : i === 1 ? 'Last week' : `${i} wks ago`,
    });
  }
  return buckets;
}

function bucketCounts(timestamps: (string | null)[], buckets: WeekBucket[]): number[] {
  const counts = buckets.map(() => 0);
  for (const iso of timestamps) {
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) continue;
    for (let i = 0; i < buckets.length; i += 1) {
      const b = buckets[i]!;
      if (ms >= b.start && ms < b.end) {
        counts[i] = (counts[i] ?? 0) + 1;
        break;
      }
    }
  }
  return counts;
}

export function completionsPerWeek(cards: Card[], buckets: WeekBucket[]): number[] {
  return bucketCounts(cards.map((c) => c.completedAt), buckets);
}

export function flagsRaisedPerWeek(flags: StagnationFlag[], buckets: WeekBucket[]): number[] {
  return bucketCounts(flags.map((f) => f.raisedAt), buckets);
}

/**
 * Median days a card spends flagged red. The radar's job is shortening stalls, not counting
 * them, so this is the number that says whether it is working (PRD §10).
 */
export function medianRedDurationDays(
  flags: StagnationFlag[],
  settings: ResolvedSettings,
  now: string,
): number | null {
  const durations = flags
    .filter((f) => f.level === 'red')
    .map((f) =>
      countableDaysBetween(f.raisedAt, f.clearedAt ?? now, {
        countWeekends: settings.countWeekends,
        tzOffsetMinutes: settings.tzOffsetMinutes,
      }),
    )
    .sort((a, b) => a - b);
  if (durations.length === 0) return null;
  const mid = Math.floor(durations.length / 2);
  return durations.length % 2 === 1
    ? (durations[mid] ?? 0)
    : ((durations[mid - 1] ?? 0) + (durations[mid] ?? 0)) / 2;
}

/** Average days cards currently sit in each watched column. */
export function averageDaysInColumn(
  cards: Card[],
  events: ActivityEvent[],
  settings: ResolvedSettings,
  now: string,
): Record<EvaluatedColumn, number | null> {
  const enteredAt = new Map<string, string>();
  for (const event of events) {
    if (!event.toColumn) continue;
    const previous = enteredAt.get(event.cardId);
    if (!previous || Date.parse(event.createdAt) > Date.parse(previous)) {
      enteredAt.set(event.cardId, event.createdAt);
    }
  }

  const totals: Record<string, { sum: number; count: number }> = {};
  for (const card of cards) {
    if (!isEvaluated(card.column)) continue;
    const since = enteredAt.get(card.id) ?? card.createdAt;
    const days = countableDaysBetween(since, now, {
      countWeekends: settings.countWeekends,
      tzOffsetMinutes: settings.tzOffsetMinutes,
    });
    const bucket = (totals[card.column] ??= { sum: 0, count: 0 });
    bucket.sum += days;
    bucket.count += 1;
  }

  const result = {} as Record<EvaluatedColumn, number | null>;
  for (const column of ['todo', 'in_progress', 'blocked'] as EvaluatedColumn[]) {
    const bucket = totals[column];
    result[column] = bucket && bucket.count > 0 ? bucket.sum / bucket.count : null;
  }
  return result;
}

/**
 * Share of stalls the team declared itself (moved to Blocked with a reason) before the radar
 * had to raise a flag. The healthiest outcome in the product — rising is good.
 */
export function selfDeclaredShare(
  cards: Card[],
  events: ActivityEvent[],
  flags: StagnationFlag[],
): { declared: number; total: number; share: number | null } {
  const firstFlagAt = new Map<string, number>();
  for (const flag of flags) {
    const ms = Date.parse(flag.raisedAt);
    const current = firstFlagAt.get(flag.cardId);
    if (current === undefined || ms < current) firstFlagAt.set(flag.cardId, ms);
  }

  const firstBlockedAt = new Map<string, number>();
  for (const event of events) {
    if (event.kind !== 'blocked_reason_set') continue;
    const ms = Date.parse(event.createdAt);
    const current = firstBlockedAt.get(event.cardId);
    if (current === undefined || ms < current) firstBlockedAt.set(event.cardId, ms);
  }

  const stalled = new Set<string>([...firstFlagAt.keys(), ...firstBlockedAt.keys()]);
  const known = new Set(cards.map((c) => c.id));
  let declared = 0;
  let total = 0;
  for (const cardId of stalled) {
    if (!known.has(cardId)) continue;
    total += 1;
    const blocked = firstBlockedAt.get(cardId);
    const flagged = firstFlagAt.get(cardId);
    if (blocked !== undefined && (flagged === undefined || blocked <= flagged)) declared += 1;
  }
  return { declared, total, share: total === 0 ? null : declared / total };
}

/** Share of 120-second commitments that the person chose to continue past (target >= 40%). */
export function catalystContinuationRate(
  sessions: CatalystSession[],
): { continued: number; total: number; rate: number | null } {
  const committed = sessions.filter((s) => s.committedAt !== null);
  const continued = committed.filter((s) => s.continued).length;
  return {
    continued,
    total: committed.length,
    rate: committed.length === 0 ? null : continued / committed.length,
  };
}

/**
 * Anti-signal (PRD §10): cards created straight into In Progress. A rise here means people are
 * routing around the clock, which is a signal about trust, not about detection.
 */
export function cardsCreatedInProgress(events: ActivityEvent[]): number {
  return events.filter((e) => e.kind === 'created' && e.toColumn === 'in_progress').length;
}

export function trendDirection(series: number[]): 'up' | 'down' | 'flat' {
  if (series.length < 2) return 'flat';
  const last = series[series.length - 1] ?? 0;
  const previous = series[series.length - 2] ?? 0;
  if (last > previous) return 'up';
  if (last < previous) return 'down';
  return 'flat';
}
