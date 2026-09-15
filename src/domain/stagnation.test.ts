import { describe, expect, it } from 'vitest';
import { evaluateBoard, evaluateCard, lastResetAt, reconcileFlags } from './stagnation';
import { resolveSettings } from './thresholds';
import {
  CLOCK_RESETTING_KINDS,
  type ActivityEvent,
  type ActivityKind,
  type Card,
  type Evaluation,
  type StagnationFlag,
  type User,
} from './types';

const settings = resolveSettings(null); // in_progress: amber 2, red 4; weekends excluded

function card(over: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    teamId: 't1',
    title: 'Rewrite Q3 report',
    description: '',
    column: 'in_progress',
    assigneeId: 'u_josh',
    blockedReason: null,
    dueDate: null,
    createdAt: '2026-09-07T09:00:00Z', // Monday
    completedAt: null,
    position: 0,
    ...over,
  };
}

function event(kind: ActivityKind, createdAt: string, over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: `e_${kind}_${createdAt}`,
    cardId: 'c1',
    userId: 'u_josh',
    kind,
    resetsClock: CLOCK_RESETTING_KINDS.has(kind),
    createdAt,
    ...over,
  };
}

const josh: User = { id: 'u_josh', teamId: 't1', email: 'j@x.co', displayName: 'Josh', role: 'member' };

describe('lastResetAt', () => {
  it('falls back to card creation when nothing has happened', () => {
    expect(lastResetAt(card(), [])).toBe('2026-09-07T09:00:00Z');
  });

  it('ignores events that are attention rather than progress', () => {
    const events = [event('viewed', '2026-09-09T09:00:00Z'), event('title_edited', '2026-09-10T09:00:00Z')];
    expect(lastResetAt(card(), events)).toBe('2026-09-07T09:00:00Z');
  });

  it('takes the latest clock-resetting event', () => {
    const events = [event('comment_added', '2026-09-08T09:00:00Z'), event('viewed', '2026-09-10T09:00:00Z')];
    expect(lastResetAt(card(), events)).toBe('2026-09-08T09:00:00Z');
  });

  it('ignores events belonging to other cards', () => {
    expect(lastResetAt(card(), [event('comment_added', '2026-09-09T09:00:00Z', { cardId: 'other' })])).toBe(
      '2026-09-07T09:00:00Z',
    );
  });
});

describe('evaluateCard', () => {
  const at = (now: string) => evaluateCard(card(), [], settings, josh, now);

  it('is green below the amber threshold', () => {
    expect(at('2026-09-08T09:00:00Z')?.level).toBe('green'); // 1 day
  });

  it('turns amber at the threshold, not after it', () => {
    expect(at('2026-09-09T09:00:00Z')?.level).toBe('amber'); // exactly 2 days
  });

  it('turns red at the red threshold', () => {
    // Mon -> Fri is 4 working days.
    const evaluation = at('2026-09-11T09:00:00Z');
    expect(evaluation?.level).toBe('red');
    expect(evaluation?.activeDays).toBeCloseTo(4, 5);
  });

  it('does not let the weekend age a card', () => {
    // Wed 09:00 -> Mon 09:00 is five calendar days but only three working days.
    const evaluation = evaluateCard(
      card({ createdAt: '2026-09-09T09:00:00Z' }),
      [],
      settings,
      josh,
      '2026-09-14T09:00:00Z',
    );
    expect(evaluation?.activeDays).toBeCloseTo(3, 5);
    expect(evaluation?.level).toBe('amber');
  });

  it('pauses while the assignee is away', () => {
    const away: User = { ...josh, awaySpans: [{ start: '2026-09-08', end: '2026-09-10' }] };
    const evaluation = evaluateCard(card(), [], settings, away, '2026-09-11T09:00:00Z');
    expect(evaluation?.activeDays).toBeCloseTo(15 / 24 + 9 / 24, 5);
    expect(evaluation?.level).toBe('green');
  });

  it('ignores PTO when the team turned that off', () => {
    const away: User = { ...josh, awaySpans: [{ start: '2026-09-08', end: '2026-09-10' }] };
    const noPause = resolveSettings({ pauseDuringPto: false } as never);
    expect(evaluateCard(card(), [], noPause, away, '2026-09-11T09:00:00Z')?.activeDays).toBeCloseTo(4, 5);
  });

  it('is cleared by starting the Catalyst, because the card moved', () => {
    const events = [event('catalyst_started', '2026-09-10T15:00:00Z')];
    expect(evaluateCard(card(), events, settings, josh, '2026-09-11T09:00:00Z')?.level).toBe('green');
  });

  it('applies Blocked thresholds to a card self-tagged Blocked in another column', () => {
    // Josh's card is still in In Progress, but he has said it is blocked — so the tighter
    // Blocked clock applies, and two days is red rather than amber.
    const tagged = card({ blockedReason: 'Waiting on legal sign-off' });
    const evaluation = evaluateCard(tagged, [], settings, josh, '2026-09-09T09:00:00Z');
    expect(evaluation?.column).toBe('blocked');
    expect(evaluation?.level).toBe('red');
    expect(evaluateCard(card(), [], settings, josh, '2026-09-09T09:00:00Z')?.level).toBe('amber');
  });

  it('still ignores a blocked tag on a card in Done', () => {
    const done = card({ column: 'done', blockedReason: 'stale tag' });
    expect(evaluateCard(done, [], settings, josh, '2026-10-01T09:00:00Z')).toBeNull();
  });

  it('never evaluates Backlog or Done', () => {
    expect(evaluateCard(card({ column: 'backlog' }), [], settings, josh, '2026-10-01T09:00:00Z')).toBeNull();
    expect(evaluateCard(card({ column: 'done' }), [], settings, josh, '2026-10-01T09:00:00Z')).toBeNull();
  });

  it('applies the per-column threshold, not a global one', () => {
    // Two days in Blocked is red; the same two days in In Progress is only amber.
    const blocked = evaluateCard(card({ column: 'blocked' }), [], settings, josh, '2026-09-09T09:00:00Z');
    expect(blocked?.level).toBe('red');
    expect(blocked?.threshold).toEqual({ amberDays: 1, redDays: 2 });
  });
});

describe('evaluateBoard', () => {
  it('evaluates each card against its own assignee and events', () => {
    const cards = [card(), card({ id: 'c2', column: 'todo', assigneeId: null })];
    const events = [event('comment_added', '2026-09-10T09:00:00Z')];
    const result = evaluateBoard(cards, events, settings, [josh], '2026-09-11T09:00:00Z');
    expect(result.get('c1')?.level).toBe('green');
    expect(result.get('c2')?.level).toBe('amber'); // 4 days: past To Do's amber (3), short of red (5)
    expect(result.get('c2')?.activeDays).toBeCloseTo(4, 5);
  });
});

describe('reconcileFlags', () => {
  const evaluation = (over: Partial<Evaluation>): Evaluation => ({
    cardId: 'c1',
    column: 'in_progress',
    level: 'amber',
    activeDays: 2,
    lastResetAt: '2026-09-07T09:00:00Z',
    threshold: { amberDays: 2, redDays: 4 },
    ...over,
  });

  const openFlag = (over: Partial<StagnationFlag> = {}): StagnationFlag => ({
    id: 'f1',
    cardId: 'c1',
    level: 'amber',
    raisedAt: '2026-09-09T09:00:00Z',
    clearedAt: null,
    thresholdSnapshot: { column: 'in_progress', amberDays: 2, redDays: 4 },
    ...over,
  });

  const now = '2026-09-11T09:00:00Z';

  it('opens a flag when a card first crosses a threshold', () => {
    const { toOpen, toClose } = reconcileFlags(new Map([['c1', evaluation({})]]), [], now);
    expect(toClose).toEqual([]);
    expect(toOpen).toHaveLength(1);
    expect(toOpen[0]?.level).toBe('amber');
  });

  it('snapshots the thresholds in force so retuning does not rewrite history', () => {
    const { toOpen } = reconcileFlags(
      new Map([['c1', evaluation({ threshold: { amberDays: 2, redDays: 5 } })]]),
      [],
      now,
    );
    expect(toOpen[0]?.thresholdSnapshot).toEqual({ column: 'in_progress', amberDays: 2, redDays: 5 });
  });

  it('leaves an unchanged flag alone', () => {
    const result = reconcileFlags(new Map([['c1', evaluation({})]]), [openFlag()], now);
    expect(result).toEqual({ toOpen: [], toClose: [] });
  });

  it('escalates amber to red by closing one and opening the other', () => {
    const { toOpen, toClose } = reconcileFlags(
      new Map([['c1', evaluation({ level: 'red', activeDays: 4 })]]),
      [openFlag()],
      now,
    );
    expect(toClose).toEqual(['f1']);
    expect(toOpen[0]?.level).toBe('red');
  });

  it('clears the flag when the card moves again', () => {
    const { toOpen, toClose } = reconcileFlags(
      new Map([['c1', evaluation({ level: 'green', activeDays: 0 })]]),
      [openFlag()],
      now,
    );
    expect(toClose).toEqual(['f1']);
    expect(toOpen).toEqual([]);
  });

  it('clears the flag when the card leaves a watched column entirely', () => {
    const { toClose } = reconcileFlags(new Map(), [openFlag()], now);
    expect(toClose).toEqual(['f1']);
  });

  it('never touches an already-cleared flag', () => {
    const cleared = openFlag({ id: 'f_old', clearedAt: '2026-09-10T09:00:00Z' });
    const { toClose } = reconcileFlags(new Map(), [cleared], now);
    expect(toClose).toEqual([]);
  });
});
