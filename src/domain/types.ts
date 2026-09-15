/** Core domain types. See docs/PRD.md §7.3 for the persisted shape. */

export type ColumnId = 'backlog' | 'todo' | 'in_progress' | 'blocked' | 'done';

/** Columns the Stagnation Radar evaluates. Backlog and Done are never flagged (PRD §5.2). */
export const EVALUATED_COLUMNS = ['todo', 'in_progress', 'blocked'] as const;
export type EvaluatedColumn = (typeof EVALUATED_COLUMNS)[number];

export const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'done', label: 'Done' },
];

export function isEvaluated(column: ColumnId): column is EvaluatedColumn {
  return (EVALUATED_COLUMNS as readonly string[]).includes(column);
}

/** The name a person reads. Never derive this from the id — "todo" is not a word. */
export function columnLabel(column: ColumnId): string {
  return COLUMNS.find((c) => c.id === column)?.label ?? column;
}

export type FlagLevel = 'green' | 'amber' | 'red';
export type Role = 'lead' | 'member';

/** PRD §5.4 — three levels, not a boolean. */
export type FlagVisibility = 'team' | 'owner_lead' | 'owner';

export interface User {
  id: string;
  teamId: string;
  email: string;
  displayName: string;
  role: Role;
  /** Inclusive ISO date ranges the person is away; pauses their clocks when pauseDuringPto is on. */
  awaySpans?: { start: string; end: string }[];
}

export interface Card {
  id: string;
  teamId: string;
  title: string;
  description: string;
  column: ColumnId;
  assigneeId: string | null;
  blockedReason: string | null;
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
  position: number;
}

export interface SubTask {
  id: string;
  cardId: string;
  title: string;
  estMinutes: number;
  completedAt: string | null;
  position: number;
}

/**
 * Activity kinds. `resetsClock` is stored per event rather than inferred at read time
 * so the §5.2 activity/non-activity distinction lives in the data, not in scattered call sites.
 */
export type ActivityKind =
  | 'created'
  | 'column_changed'
  | 'comment_added'
  | 'blocked_reason_set'
  | 'subtask_completed'
  | 'still_on_it'
  | 'catalyst_started'
  | 'catalyst_step_committed'
  | 'viewed'
  | 'title_edited'
  | 'assigned';

/** Kinds that count as movement. Everything else is attention, not progress. */
export const CLOCK_RESETTING_KINDS: ReadonlySet<ActivityKind> = new Set<ActivityKind>([
  'created',
  'column_changed',
  'comment_added',
  'blocked_reason_set',
  'subtask_completed',
  'still_on_it',
  'catalyst_started',
  'catalyst_step_committed',
]);

export interface ActivityEvent {
  id: string;
  cardId: string;
  userId: string | null;
  kind: ActivityKind;
  resetsClock: boolean;
  detail?: string;
  createdAt: string;
  /** Column the card was in after this event; only set for column_changed and created. */
  toColumn?: ColumnId;
}

export interface ColumnThreshold {
  amberDays: number;
  redDays: number;
}

export type ThresholdMap = Record<EvaluatedColumn, ColumnThreshold>;

export interface TeamSettings {
  teamId: string;
  /** Partial by design: any unset value falls back to the system default (PRD §5.2). */
  thresholds: Partial<Record<EvaluatedColumn, Partial<ColumnThreshold>>>;
  flagVisibility: FlagVisibility | null;
  countWeekends: boolean | null;
  pauseDuringPto: boolean | null;
  /** Minutes offset from UTC used for day boundaries when counting elapsed days. */
  tzOffsetMinutes: number | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface StagnationFlag {
  id: string;
  cardId: string;
  level: Exclude<FlagLevel, 'green'>;
  raisedAt: string;
  clearedAt: string | null;
  /** Thresholds in force when raised — keeps historical trends readable after retuning (PRD §5.2). */
  thresholdSnapshot: ColumnThreshold & { column: EvaluatedColumn };
}

export type FocusScope = 'personal' | 'team';

export interface FocusBlock {
  id: string;
  teamId: string;
  startedBy: string;
  scope: FocusScope;
  startsAt: string;
  endsAt: string;
  endedEarlyAt: string | null;
  participantIds: string[];
}

export interface QueuedNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  urgent: boolean;
  createdAt: string;
  deliveredAt: string | null;
}

export interface Evaluation {
  cardId: string;
  column: EvaluatedColumn;
  level: FlagLevel;
  /** Counted days since the last clock-resetting event, honouring weekend/PTO rules. */
  activeDays: number;
  lastResetAt: string;
  threshold: ColumnThreshold;
}

export interface CatalystSession {
  id: string;
  cardId: string;
  subTaskId: string;
  userId: string;
  startedAt: string;
  /** Set when the commitment window elapsed and the person was offered the choice. */
  committedAt: string | null;
  /** True when they chose to keep going past the 120-second commitment. */
  continued: boolean;
}
