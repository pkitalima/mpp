import { countableDaysBetween } from './time';
import type { ResolvedSettings } from './thresholds';
import {
  isEvaluated,
  type ActivityEvent,
  type Card,
  type EvaluatedColumn,
  type Evaluation,
  type FlagLevel,
  type StagnationFlag,
  type User,
} from './types';

/** The most recent event that counts as movement. Falls back to card creation. */
export function lastResetAt(card: Card, events: ActivityEvent[]): string {
  let latest = card.createdAt;
  for (const event of events) {
    if (event.cardId !== card.id || !event.resetsClock) continue;
    if (Date.parse(event.createdAt) > Date.parse(latest)) latest = event.createdAt;
  }
  return latest;
}

function levelFor(days: number, amber: number, red: number): FlagLevel {
  if (days >= red) return 'red';
  if (days >= amber) return 'amber';
  return 'green';
}

/**
 * The column whose thresholds apply. A card self-tagged Blocked is evaluated against the
 * Blocked thresholds wherever it sits, so tagging a stall never buys looser deadlines than
 * declaring one — the tighter clock is the point of declaring it (PRD §5.1).
 */
export function effectiveColumn(card: Card): EvaluatedColumn | null {
  if (!isEvaluated(card.column)) return null;
  return card.blockedReason ? 'blocked' : (card.column as EvaluatedColumn);
}

/**
 * Evaluate one card. Returns null for columns the radar does not watch (Backlog, Done).
 */
export function evaluateCard(
  card: Card,
  events: ActivityEvent[],
  settings: ResolvedSettings,
  assignee: User | null,
  now: string,
): Evaluation | null {
  const column = effectiveColumn(card);
  if (!column) return null;
  const threshold = settings.thresholds[column];
  const reset = lastResetAt(card, events);
  const activeDays = countableDaysBetween(reset, now, {
    countWeekends: settings.countWeekends,
    tzOffsetMinutes: settings.tzOffsetMinutes,
    awaySpans: settings.pauseDuringPto ? (assignee?.awaySpans ?? []) : [],
  });
  return {
    cardId: card.id,
    column,
    level: levelFor(activeDays, threshold.amberDays, threshold.redDays),
    activeDays,
    lastResetAt: reset,
    threshold,
  };
}

export function evaluateBoard(
  cards: Card[],
  events: ActivityEvent[],
  settings: ResolvedSettings,
  users: User[],
  now: string,
): Map<string, Evaluation> {
  const usersById = new Map(users.map((u) => [u.id, u]));
  const eventsByCard = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    const list = eventsByCard.get(event.cardId);
    if (list) list.push(event);
    else eventsByCard.set(event.cardId, [event]);
  }

  const result = new Map<string, Evaluation>();
  for (const card of cards) {
    const assignee = card.assigneeId ? (usersById.get(card.assigneeId) ?? null) : null;
    const evaluation = evaluateCard(card, eventsByCard.get(card.id) ?? [], settings, assignee, now);
    if (evaluation) result.set(card.id, evaluation);
  }
  return result;
}

export type NewFlag = Omit<StagnationFlag, 'id'>;

export interface FlagReconciliation {
  toOpen: NewFlag[];
  toClose: string[];
}

/**
 * Turn current evaluations into flag-record changes.
 *
 * Each flag records the thresholds in force when it was raised, so retuning thresholds changes
 * what is flagged *now* without rewriting the historical trend the lead tuned against (PRD §5.2).
 */
export function reconcileFlags(
  evaluations: Map<string, Evaluation>,
  openFlags: StagnationFlag[],
  now: string,
): FlagReconciliation {
  const openByCard = new Map<string, StagnationFlag>();
  for (const flag of openFlags) {
    if (flag.clearedAt === null) openByCard.set(flag.cardId, flag);
  }

  const toOpen: NewFlag[] = [];
  const toClose: string[] = [];

  for (const [cardId, evaluation] of evaluations) {
    const open = openByCard.get(cardId);
    if (evaluation.level === 'green') {
      if (open) toClose.push(open.id);
      continue;
    }
    if (open && open.level === evaluation.level) continue;
    if (open) toClose.push(open.id);
    toOpen.push({
      cardId,
      level: evaluation.level,
      raisedAt: now,
      clearedAt: null,
      thresholdSnapshot: { ...evaluation.threshold, column: evaluation.column },
    });
  }

  // A card that left an evaluated column (moved to Done or Backlog) has no evaluation at all.
  for (const [cardId, flag] of openByCard) {
    if (!evaluations.has(cardId)) toClose.push(flag.id);
  }

  return { toOpen, toClose };
}
