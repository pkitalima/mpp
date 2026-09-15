import { describe, expect, it } from 'vitest';
import { isOverridden, resolveSettings, SYSTEM_DEFAULT_THRESHOLDS } from './thresholds';
import type { TeamSettings } from './types';

const base: TeamSettings = {
  teamId: 't1',
  thresholds: {},
  flagVisibility: null,
  countWeekends: null,
  pauseDuringPto: null,
  tzOffsetMinutes: null,
  updatedBy: null,
  updatedAt: null,
};

describe('resolveSettings', () => {
  it('falls back to system defaults when nothing is configured', () => {
    const resolved = resolveSettings(null);
    expect(resolved.thresholds).toEqual(SYSTEM_DEFAULT_THRESHOLDS);
    expect(resolved.flagVisibility).toBe('team');
    expect(resolved.countWeekends).toBe(false);
    expect(resolved.pauseDuringPto).toBe(true);
  });

  it('falls back field by field, not object by object', () => {
    const resolved = resolveSettings({ ...base, thresholds: { in_progress: { redDays: 5 } } });
    expect(resolved.thresholds.in_progress).toEqual({ amberDays: 2, redDays: 5 });
    expect(resolved.thresholds.todo).toEqual(SYSTEM_DEFAULT_THRESHOLDS.todo);
  });

  it('ignores nonsense overrides rather than producing a broken radar', () => {
    const resolved = resolveSettings({
      ...base,
      thresholds: { blocked: { amberDays: 0, redDays: Number.NaN } },
    });
    expect(resolved.thresholds.blocked).toEqual(SYSTEM_DEFAULT_THRESHOLDS.blocked);
  });

  it('keeps an explicit false for countWeekends distinct from unset', () => {
    expect(resolveSettings({ ...base, countWeekends: true }).countWeekends).toBe(true);
    expect(resolveSettings({ ...base, pauseDuringPto: false }).pauseDuringPto).toBe(false);
  });
});

describe('isOverridden', () => {
  it('reports only real divergence from the default', () => {
    expect(isOverridden(base, 'todo')).toBe(false);
    expect(isOverridden({ ...base, thresholds: { todo: { redDays: 5 } } }, 'todo')).toBe(false);
    expect(isOverridden({ ...base, thresholds: { todo: { redDays: 7 } } }, 'todo')).toBe(true);
  });
});
