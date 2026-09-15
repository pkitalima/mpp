import { describe, expect, it } from 'vitest';
import { countableDaysBetween, dayOfWeek, formatDays, isWeekend } from './time';

const UTC = { countWeekends: false, tzOffsetMinutes: 0 };

describe('countableDaysBetween', () => {
  it('counts whole weekdays', () => {
    // Mon 09:00 -> Wed 09:00 = two full working days.
    expect(countableDaysBetween('2026-09-07T09:00:00Z', '2026-09-09T09:00:00Z', UTC)).toBeCloseTo(2, 5);
  });

  it('counts fractions of a day rather than rounding up', () => {
    expect(countableDaysBetween('2026-09-07T16:00:00Z', '2026-09-08T09:00:00Z', UTC)).toBeCloseTo(17 / 24, 5);
  });

  it('skips the weekend by default', () => {
    // Fri 09:00 -> Mon 09:00 is three calendar days but one working day.
    expect(countableDaysBetween('2026-09-11T09:00:00Z', '2026-09-14T09:00:00Z', UTC)).toBeCloseTo(1, 5);
  });

  it('counts the weekend when the team opts in', () => {
    expect(
      countableDaysBetween('2026-09-11T09:00:00Z', '2026-09-14T09:00:00Z', {
        ...UTC,
        countWeekends: true,
      }),
    ).toBeCloseTo(3, 5);
  });

  it('skips PTO days entirely', () => {
    const away = [{ start: '2026-09-08', end: '2026-09-09' }];
    // Mon 09:00 -> Thu 09:00 with Tue+Wed away leaves Mon and Thu partials only.
    expect(
      countableDaysBetween('2026-09-07T09:00:00Z', '2026-09-10T09:00:00Z', { ...UTC, awaySpans: away }),
    ).toBeCloseTo(15 / 24 + 9 / 24, 5);
  });

  it('is zero for reversed or equal instants', () => {
    expect(countableDaysBetween('2026-09-09T09:00:00Z', '2026-09-07T09:00:00Z', UTC)).toBe(0);
    expect(countableDaysBetween('2026-09-09T09:00:00Z', '2026-09-09T09:00:00Z', UTC)).toBe(0);
  });

  it('respects the team day-boundary offset', () => {
    // 23:00 Fri in UTC is 16:00 Fri at UTC-7 — still a working day there, already Saturday nowhere.
    const late = countableDaysBetween('2026-09-11T23:00:00Z', '2026-09-12T02:00:00Z', {
      countWeekends: false,
      tzOffsetMinutes: -420,
    });
    expect(late).toBeCloseTo(3 / 24, 5);
    // Same window evaluated in UTC loses the hours that fell after midnight.
    expect(countableDaysBetween('2026-09-11T23:00:00Z', '2026-09-12T02:00:00Z', UTC)).toBeCloseTo(1 / 24, 5);
  });
});

describe('calendar helpers', () => {
  it('maps epoch days to weekdays', () => {
    expect(dayOfWeek(0)).toBe(4); // 1970-01-01 was a Thursday
    expect(isWeekend(Math.floor(Date.parse('2026-09-12T00:00:00Z') / 86_400_000))).toBe(true);
    expect(isWeekend(Math.floor(Date.parse('2026-09-14T00:00:00Z') / 86_400_000))).toBe(false);
  });

  it('formats sub-day durations in hours', () => {
    expect(formatDays(0.25)).toBe('6h');
    expect(formatDays(2.34)).toBe('2.3d');
    expect(formatDays(12.4)).toBe('12d');
  });
});
