const DAY_MS = 86_400_000;

export interface DayCountOptions {
  countWeekends: boolean;
  /** Minutes offset from UTC used to decide where one day ends and the next begins. */
  tzOffsetMinutes: number;
  /** Inclusive YYYY-MM-DD ranges to skip entirely (PTO). Empty when pauseDuringPto is off. */
  awaySpans?: { start: string; end: string }[];
}

/** Epoch-day index of an instant, in the team's day-boundary timezone. */
export function dayIndex(ms: number, tzOffsetMinutes: number): number {
  return Math.floor((ms + tzOffsetMinutes * 60_000) / DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday. Epoch day 0 (1970-01-01) was a Thursday. */
export function dayOfWeek(index: number): number {
  return (((index + 4) % 7) + 7) % 7;
}

export function isWeekend(index: number): boolean {
  const d = dayOfWeek(index);
  return d === 0 || d === 6;
}

function dateOnlyToDayIndex(iso: string): number {
  return Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

/**
 * Days elapsed between two instants, counting only days the radar is allowed to count.
 *
 * Returns a fraction, so a card that entered a column at 4pm Tuesday is not treated as a full
 * day old at 9am Wednesday. Weekend and PTO days contribute zero rather than being clipped off
 * the end, which is what makes "4 days" mean four days of *available working time*.
 */
export function countableDaysBetween(
  startIso: string,
  endIso: string,
  opts: DayCountOptions,
): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  const awayDays = (opts.awaySpans ?? []).map((span) => ({
    from: dateOnlyToDayIndex(span.start),
    to: dateOnlyToDayIndex(span.end),
  }));

  const firstDay = dayIndex(start, opts.tzOffsetMinutes);
  const lastDay = dayIndex(end, opts.tzOffsetMinutes);
  // Sanity bound: a card older than ten years is a data problem, not a stagnation signal.
  const cappedLastDay = Math.min(lastDay, firstDay + 3650);

  let total = 0;
  for (let day = firstDay; day <= cappedLastDay; day += 1) {
    if (!opts.countWeekends && isWeekend(day)) continue;
    if (awayDays.some((span) => day >= span.from && day <= span.to)) continue;

    const dayStart = day * DAY_MS - opts.tzOffsetMinutes * 60_000;
    const dayEnd = dayStart + DAY_MS;
    const overlap = Math.min(end, dayEnd) - Math.max(start, dayStart);
    if (overlap > 0) total += overlap / DAY_MS;
  }
  return total;
}

export function formatDays(days: number): string {
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours}h`;
  }
  const rounded = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  return `${rounded}d`;
}

export function formatRelative(iso: string, now: number = Date.now()): string {
  const diff = now - Date.parse(iso);
  if (!Number.isFinite(diff)) return '—';
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
