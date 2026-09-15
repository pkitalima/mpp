import { describe, expect, it } from 'vitest';
import {
  averageDaysInColumn,
  cardsCompletedIn,
  flagsRaisedIn,
  cardsCreatedInProgress,
  catalystContinuationRate,
  completionsPerWeek,
  medianRedDurationDays,
  selfDeclaredShare,
  trendDirection,
  weekBuckets,
} from './metrics';
import { resolveSettings } from './thresholds';
import type { ActivityEvent, Card, CatalystSession, StagnationFlag } from './types';

const settings = resolveSettings(null);
const NOW = Date.parse('2026-09-15T09:00:00Z');
const NOW_ISO = '2026-09-15T09:00:00Z';

function card(over: Partial<Card>): Card {
  return {
    id: 'c',
    teamId: 't1',
    title: 'x',
    description: '',
    column: 'in_progress',
    assigneeId: null,
    blockedReason: null,
    dueDate: null,
    createdAt: '2026-09-01T09:00:00Z',
    completedAt: null,
    position: 0,
    ...over,
  };
}

describe('weekBuckets', () => {
  it('returns trailing weeks oldest first, ending now', () => {
    const buckets = weekBuckets(NOW, 4);
    expect(buckets).toHaveLength(4);
    expect(buckets[3]?.end).toBe(NOW);
    expect(buckets[3]?.label).toBe('This week');
    expect(buckets[0]!.start).toBeLessThan(buckets[3]!.start);
  });
});

describe('completionsPerWeek', () => {
  it('buckets completions and ignores unfinished cards', () => {
    const buckets = weekBuckets(NOW, 2);
    const cards = [
      card({ id: 'a', completedAt: '2026-09-14T09:00:00Z' }),
      card({ id: 'b', completedAt: '2026-09-12T09:00:00Z' }),
      card({ id: 'c', completedAt: '2026-09-05T09:00:00Z' }),
      card({ id: 'd', completedAt: null }),
    ];
    expect(completionsPerWeek(cards, buckets)).toEqual([1, 2]);
  });
});

describe('drilling into a bar', () => {
  const buckets = weekBuckets(NOW, 2);
  const thisWeek = buckets[1]!;
  const lastWeek = buckets[0]!;

  it('returns the cards behind a completions bar, newest first', () => {
    const cards = [
      card({ id: 'a', completedAt: '2026-09-11T09:00:00Z' }),
      card({ id: 'b', completedAt: '2026-09-14T09:00:00Z' }),
      card({ id: 'old', completedAt: '2026-09-05T09:00:00Z' }),
      card({ id: 'open', completedAt: null }),
    ];
    expect(cardsCompletedIn(cards, thisWeek).map((c) => c.id)).toEqual(['b', 'a']);
    expect(cardsCompletedIn(cards, lastWeek).map((c) => c.id)).toEqual(['old']);
  });

  it('returns the flags behind a flags bar', () => {
    const flag = (id: string, raisedAt: string): StagnationFlag => ({
      id,
      cardId: 'c',
      level: 'red',
      raisedAt,
      clearedAt: null,
      thresholdSnapshot: { column: 'in_progress', amberDays: 2, redDays: 4 },
    });
    const flags = [flag('f1', '2026-09-14T09:00:00Z'), flag('f2', '2026-09-04T09:00:00Z')];
    expect(flagsRaisedIn(flags, thisWeek).map((f) => f.id)).toEqual(['f1']);
    expect(flagsRaisedIn(flags, lastWeek).map((f) => f.id)).toEqual(['f2']);
  });

  it('puts an instant on a bucket boundary in exactly one week', () => {
    const onBoundary = new Date(thisWeek.start).toISOString();
    const cards = [card({ id: 'edge', completedAt: onBoundary })];
    expect(cardsCompletedIn(cards, thisWeek)).toHaveLength(1);
    expect(cardsCompletedIn(cards, lastWeek)).toHaveLength(0);
  });
});

describe('medianRedDurationDays', () => {
  const flag = (over: Partial<StagnationFlag>): StagnationFlag => ({
    id: 'f',
    cardId: 'c',
    level: 'red',
    raisedAt: '2026-09-07T09:00:00Z',
    clearedAt: '2026-09-08T09:00:00Z',
    thresholdSnapshot: { column: 'in_progress', amberDays: 2, redDays: 4 },
    ...over,
  });

  it('is null with no red flags', () => {
    expect(medianRedDurationDays([flag({ level: 'amber' })], settings, NOW_ISO)).toBeNull();
  });

  it('measures an open flag up to now', () => {
    const value = medianRedDurationDays([flag({ raisedAt: '2026-09-14T09:00:00Z', clearedAt: null })], settings, NOW_ISO);
    expect(value).toBeCloseTo(1, 5);
  });

  it('averages the middle two for an even count', () => {
    const value = medianRedDurationDays(
      [
        flag({ id: 'f1', raisedAt: '2026-09-07T09:00:00Z', clearedAt: '2026-09-08T09:00:00Z' }),
        flag({ id: 'f2', raisedAt: '2026-09-07T09:00:00Z', clearedAt: '2026-09-10T09:00:00Z' }),
      ],
      settings,
      NOW_ISO,
    );
    expect(value).toBeCloseTo(2, 5);
  });
});

describe('selfDeclaredShare', () => {
  const blockedEvent = (cardId: string, at: string): ActivityEvent => ({
    id: `e_${cardId}`,
    cardId,
    userId: 'u',
    kind: 'blocked_reason_set',
    resetsClock: true,
    createdAt: at,
  });
  const raised = (cardId: string, at: string): StagnationFlag => ({
    id: `f_${cardId}`,
    cardId,
    level: 'red',
    raisedAt: at,
    clearedAt: null,
    thresholdSnapshot: { column: 'in_progress', amberDays: 2, redDays: 4 },
  });

  it('counts a stall as self-declared when Blocked came first', () => {
    const cards = [card({ id: 'a' }), card({ id: 'b' })];
    const result = selfDeclaredShare(
      cards,
      [blockedEvent('a', '2026-09-08T09:00:00Z'), blockedEvent('b', '2026-09-12T09:00:00Z')],
      [raised('a', '2026-09-10T09:00:00Z'), raised('b', '2026-09-10T09:00:00Z')],
    );
    expect(result).toEqual({ declared: 1, total: 2, share: 0.5 });
  });

  it('is null when nothing has stalled at all', () => {
    expect(selfDeclaredShare([card({ id: 'a' })], [], []).share).toBeNull();
  });

  it('ignores stalls on cards outside the given set', () => {
    const result = selfDeclaredShare([card({ id: 'a' })], [], [raised('ghost', '2026-09-10T09:00:00Z')]);
    expect(result.total).toBe(0);
  });
});

describe('catalystContinuationRate', () => {
  const session = (over: Partial<CatalystSession>): CatalystSession => ({
    id: 's',
    cardId: 'c',
    subTaskId: 'st',
    userId: 'u',
    startedAt: '2026-09-15T09:00:00Z',
    committedAt: '2026-09-15T09:02:00Z',
    continued: false,
    ...over,
  });

  it('counts only sessions that reached the commitment point', () => {
    const result = catalystContinuationRate([
      session({ id: 'a', continued: true }),
      session({ id: 'b', continued: false }),
      session({ id: 'c', committedAt: null }),
    ]);
    expect(result).toEqual({ continued: 1, total: 2, rate: 0.5 });
  });

  it('is null before anyone has tried it', () => {
    expect(catalystContinuationRate([]).rate).toBeNull();
  });
});

describe('averageDaysInColumn', () => {
  it('measures from the last column change, not from card creation', () => {
    const cards = [card({ id: 'a', column: 'in_progress' })];
    const events: ActivityEvent[] = [
      {
        id: 'e1',
        cardId: 'a',
        userId: 'u',
        kind: 'column_changed',
        resetsClock: true,
        createdAt: '2026-09-14T09:00:00Z',
        toColumn: 'in_progress',
      },
    ];
    const result = averageDaysInColumn(cards, events, settings, NOW_ISO);
    expect(result.in_progress).toBeCloseTo(1, 5);
    expect(result.todo).toBeNull();
  });
});

describe('anti-signals', () => {
  it('counts cards created straight into In Progress', () => {
    const events: ActivityEvent[] = [
      { id: '1', cardId: 'a', userId: 'u', kind: 'created', resetsClock: true, createdAt: NOW_ISO, toColumn: 'in_progress' },
      { id: '2', cardId: 'b', userId: 'u', kind: 'created', resetsClock: true, createdAt: NOW_ISO, toColumn: 'todo' },
    ];
    expect(cardsCreatedInProgress(events)).toBe(1);
  });

  it('reads a trend from the last two buckets', () => {
    expect(trendDirection([1, 2, 5])).toBe('up');
    expect(trendDirection([5, 2])).toBe('down');
    expect(trendDirection([2, 2])).toBe('flat');
    expect(trendDirection([2])).toBe('flat');
  });
});
