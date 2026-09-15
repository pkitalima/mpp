import { CLOCK_RESETTING_KINDS, type ActivityEvent, type ActivityKind, type Card, type CatalystSession, type ColumnId, type StagnationFlag, type SubTask, type TeamSettings, type User } from '../../domain/types';
import { emptySnapshot, type Snapshot } from '../schema';

export const TEAM_ID = 'team_marketing';
export const DEMO_USER_ID = 'u_amina';

const DAY_MS = 86_400_000;

/** Walk back `n` countable weekdays from `now`, keeping the time of day. */
function businessDaysAgo(now: number, n: number): string {
  let cursor = now;
  let remaining = n;
  while (remaining > 0) {
    cursor -= DAY_MS;
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return new Date(cursor).toISOString();
}

function hoursAgo(now: number, h: number): string {
  return new Date(now - h * 3_600_000).toISOString();
}

const PEOPLE: [id: string, name: string, email: string, role: 'lead' | 'member'][] = [
  ['u_amina', 'Amina Okoye', 'amina@example.com', 'lead'],
  ['u_josh', 'Josh Reyes', 'josh@example.com', 'member'],
  ['u_sam', 'Sam Whitfield', 'sam@example.com', 'member'],
  ['u_priya', 'Priya Nair', 'priya@example.com', 'member'],
  ['u_marcus', 'Marcus Bell', 'marcus@example.com', 'member'],
  ['u_elena', 'Elena Vidal', 'elena@example.com', 'member'],
  ['u_tom', 'Tom Nakamura', 'tom@example.com', 'member'],
  ['u_nadia', 'Nadia Haddad', 'nadia@example.com', 'member'],
];

interface SeedCard {
  id: string;
  title: string;
  description?: string;
  column: ColumnId;
  assigneeId: string | null;
  blockedReason?: string;
  /** Countable days since the last thing that counted as movement. */
  staleDays: number;
  completedDaysAgo?: number;
  createdInColumn?: ColumnId;
}

const CARDS: SeedCard[] = [
  // --- The two red cards from the persona walkthrough ---
  {
    id: 'c_q3_report',
    title: 'Rewrite Q3 report',
    description:
      'Full rewrite of the Q3 performance narrative for the board pack. Last version came back with "too much detail, not enough story".',
    column: 'in_progress',
    assigneeId: 'u_josh',
    staleDays: 5,
  },
  {
    id: 'c_meridian_deck',
    title: 'Meridian renewal — client deck',
    description: 'Renewal pitch deck for the Meridian account. Deadline Thursday.',
    column: 'in_progress',
    assigneeId: 'u_sam',
    blockedReason: 'Waiting on final pricing from Finance — asked Tuesday, chased Thursday.',
    staleDays: 4,
  },
  // --- Amber ---
  {
    id: 'c_newsletter',
    title: 'September newsletter — final copy',
    column: 'in_progress',
    assigneeId: 'u_priya',
    staleDays: 2.2,
  },
  {
    id: 'c_brand_audit',
    title: 'Brand voice audit across landing pages',
    column: 'todo',
    assigneeId: 'u_marcus',
    staleDays: 3.4,
  },
  // --- Healthy work in flight ---
  {
    id: 'c_webinar',
    title: 'October webinar run of show',
    column: 'in_progress',
    assigneeId: 'u_elena',
    staleDays: 0.3,
  },
  {
    id: 'c_case_study',
    title: 'Customer case study — Halden Logistics',
    column: 'in_progress',
    assigneeId: 'u_nadia',
    staleDays: 1.1,
  },
  { id: 'c_paid_social', title: 'Paid social creative refresh', column: 'todo', assigneeId: 'u_tom', staleDays: 1.2 },
  { id: 'c_seo_brief', title: 'SEO brief: "marketing ops" cluster', column: 'todo', assigneeId: 'u_priya', staleDays: 0.6 },
  {
    id: 'c_partner_email',
    title: 'Partner co-marketing email sequence',
    column: 'blocked',
    assigneeId: 'u_marcus',
    blockedReason: 'Partner legal has not returned the co-branding approval.',
    staleDays: 0.8,
  },
  // --- Backlog ---
  { id: 'c_persona_refresh', title: 'Refresh buyer personas for FY27', column: 'backlog', assigneeId: null, staleDays: 9 },
  { id: 'c_event_budget', title: 'Q4 event budget proposal', column: 'backlog', assigneeId: 'u_amina', staleDays: 6 },
  { id: 'c_video_testimonials', title: 'Video testimonials — shortlist customers', column: 'backlog', assigneeId: null, staleDays: 12 },
  // --- Done, spread across four weeks so Pulse has a trend ---
  { id: 'c_done_1', title: 'August performance recap', column: 'done', assigneeId: 'u_josh', staleDays: 1, completedDaysAgo: 1 },
  { id: 'c_done_2', title: 'Pricing page copy test', column: 'done', assigneeId: 'u_elena', staleDays: 2, completedDaysAgo: 2 },
  { id: 'c_done_3', title: 'Conference booth messaging', column: 'done', assigneeId: 'u_nadia', staleDays: 4, completedDaysAgo: 4 },
  { id: 'c_done_4', title: 'Lifecycle email audit', column: 'done', assigneeId: 'u_sam', staleDays: 7, completedDaysAgo: 7 },
  { id: 'c_done_5', title: 'Analyst briefing one-pager', column: 'done', assigneeId: 'u_tom', staleDays: 9, completedDaysAgo: 9 },
  { id: 'c_done_6', title: 'Website hero A/B readout', column: 'done', assigneeId: 'u_priya', staleDays: 12, completedDaysAgo: 12 },
  { id: 'c_done_7', title: 'Q3 campaign retro notes', column: 'done', assigneeId: 'u_marcus', staleDays: 16, completedDaysAgo: 16 },
];

const SUB_TASKS: [cardId: string, title: string, minutes: number, done: boolean][] = [
  ['c_q3_report', 'Open last quarter’s report and read the opening paragraph', 2, false],
  ['c_q3_report', 'Write three section headings, nothing under them', 4, false],
  ['c_q3_report', 'Paste in the three numbers finance already sent', 3, false],
  ['c_q3_report', 'Write one bad opening sentence you fully intend to delete', 2, false],
  ['c_newsletter', 'Pick the lead story', 3, true],
  ['c_newsletter', 'Draft the subject line options', 5, false],
];

export function buildSeed(now: number = Date.now(), tzOffsetMinutes = 0): Snapshot {
  const snapshot = emptySnapshot();

  snapshot.users = PEOPLE.map(([id, displayName, email, role]): User => ({
    id,
    teamId: TEAM_ID,
    email,
    displayName,
    role,
    // Tom is on PTO this week — his clocks pause, which is visible on his cards.
    ...(id === 'u_tom'
      ? { awaySpans: [{ start: isoDate(now - 2 * DAY_MS), end: isoDate(now + 2 * DAY_MS) }] }
      : {}),
  }));

  const settings: TeamSettings = {
    teamId: TEAM_ID,
    thresholds: {},
    flagVisibility: null,
    countWeekends: null,
    pauseDuringPto: null,
    tzOffsetMinutes,
    updatedBy: null,
    updatedAt: null,
  };
  snapshot.settings = [settings];

  const events: ActivityEvent[] = [];
  const pushEvent = (
    cardId: string,
    kind: ActivityKind,
    createdAt: string,
    extra: Partial<ActivityEvent> = {},
  ) => {
    events.push({
      id: `ev_${cardId}_${kind}_${events.length}`,
      cardId,
      userId: extra.userId ?? null,
      kind,
      resetsClock: CLOCK_RESETTING_KINDS.has(kind),
      createdAt,
      ...extra,
    });
  };

  snapshot.cards = CARDS.map((seed, index): Card => {
    const lastMovement = businessDaysAgo(now, seed.staleDays);
    const created = businessDaysAgo(now, seed.staleDays + 3 + (index % 5));
    const createdInColumn = seed.createdInColumn ?? (seed.column === 'backlog' ? 'backlog' : 'todo');

    pushEvent(seed.id, 'created', created, { toColumn: createdInColumn, userId: seed.assigneeId });
    if (seed.column !== createdInColumn) {
      pushEvent(seed.id, 'column_changed', lastMovement, {
        toColumn: seed.column,
        userId: seed.assigneeId,
        detail: seed.column,
      });
    } else {
      pushEvent(seed.id, 'comment_added', lastMovement, {
        userId: seed.assigneeId,
        detail: 'Picked this back up.',
      });
    }
    if (seed.blockedReason) {
      pushEvent(seed.id, 'blocked_reason_set', businessDaysAgo(now, Math.max(0, seed.staleDays - 0.1)), {
        userId: seed.assigneeId,
        detail: seed.blockedReason,
      });
    }
    // Someone opening a card must not reset its clock — seed a few so that is visible.
    if (index % 3 === 0) pushEvent(seed.id, 'viewed', hoursAgo(now, 2), { userId: DEMO_USER_ID });

    return {
      id: seed.id,
      teamId: TEAM_ID,
      title: seed.title,
      description: seed.description ?? '',
      column: seed.column,
      assigneeId: seed.assigneeId,
      blockedReason: seed.blockedReason ?? null,
      dueDate: null,
      createdAt: created,
      completedAt: seed.completedDaysAgo ? businessDaysAgo(now, seed.completedDaysAgo) : null,
      position: index,
    };
  });

  snapshot.subTasks = SUB_TASKS.map(([cardId, title, estMinutes, done], index): SubTask => ({
    id: `st_${cardId}_${index}`,
    cardId,
    title,
    estMinutes,
    completedAt: done ? businessDaysAgo(now, 1) : null,
    position: index,
  }));

  snapshot.events = events;

  // Historical flags: enough of a trail that the Pulse trend is readable on first open.
  const history: [cardId: string, level: 'amber' | 'red', raised: number, cleared: number | null][] = [
    ['c_done_4', 'amber', 9, 7],
    ['c_done_5', 'red', 13, 9],
    ['c_done_6', 'amber', 14, 12],
    ['c_done_7', 'red', 21, 16],
    ['c_done_3', 'amber', 6, 4],
    ['c_case_study', 'amber', 3, 1.1],
  ];
  snapshot.flags = history.map(([cardId, level, raised, cleared], index): StagnationFlag => ({
    id: `fl_hist_${index}`,
    cardId,
    level,
    raisedAt: businessDaysAgo(now, raised),
    clearedAt: cleared === null ? null : businessDaysAgo(now, cleared),
    thresholdSnapshot:
      level === 'red'
        ? { column: 'in_progress', amberDays: 2, redDays: 4 }
        : { column: 'todo', amberDays: 3, redDays: 5 },
  }));

  snapshot.catalystSessions = [
    session('cs_1', 'c_newsletter', 'st_c_newsletter_4', 'u_priya', hoursAgo(now, 26), true),
    session('cs_2', 'c_case_study', 'st_none', 'u_nadia', hoursAgo(now, 50), true),
    session('cs_3', 'c_paid_social', 'st_none', 'u_tom', hoursAgo(now, 74), false),
    session('cs_4', 'c_webinar', 'st_none', 'u_elena', hoursAgo(now, 96), true),
    session('cs_5', 'c_seo_brief', 'st_none', 'u_priya', hoursAgo(now, 120), false),
  ];

  return snapshot;
}

function session(
  id: string,
  cardId: string,
  subTaskId: string,
  userId: string,
  startedAt: string,
  continued: boolean,
): CatalystSession {
  return {
    id,
    cardId,
    subTaskId,
    userId,
    startedAt,
    committedAt: new Date(Date.parse(startedAt) + 120_000).toISOString(),
    continued,
  };
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
