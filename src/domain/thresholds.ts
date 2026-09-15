import type {
  ColumnThreshold,
  EvaluatedColumn,
  FlagVisibility,
  TeamSettings,
  ThresholdMap,
} from './types';

/**
 * System defaults (PRD §5.2). A team that never opens the settings screen still gets a
 * working radar on day one.
 *
 * countWeekends and pauseDuringPto default the way they do for a reason: a radar that turns
 * every Monday morning red teaches people to ignore it within two weeks.
 */
export const SYSTEM_DEFAULT_THRESHOLDS: ThresholdMap = {
  todo: { amberDays: 3, redDays: 5 },
  in_progress: { amberDays: 2, redDays: 4 },
  blocked: { amberDays: 1, redDays: 2 },
};

export const SYSTEM_DEFAULT_FLAG_VISIBILITY: FlagVisibility = 'team';
export const SYSTEM_DEFAULT_COUNT_WEEKENDS = false;
export const SYSTEM_DEFAULT_PAUSE_DURING_PTO = true;
export const SYSTEM_DEFAULT_TZ_OFFSET_MINUTES = 0;

export interface ResolvedSettings {
  thresholds: ThresholdMap;
  flagVisibility: FlagVisibility;
  countWeekends: boolean;
  pauseDuringPto: boolean;
  tzOffsetMinutes: number;
}

/**
 * Resolution order for every value: team setting -> system default, field by field.
 * A team that has overridden only `in_progress.redDays` keeps defaults for everything else.
 */
export function resolveSettings(settings?: Partial<TeamSettings> | null): ResolvedSettings {
  const thresholds = {} as ThresholdMap;
  for (const key of Object.keys(SYSTEM_DEFAULT_THRESHOLDS) as EvaluatedColumn[]) {
    const fallback = SYSTEM_DEFAULT_THRESHOLDS[key];
    const override = settings?.thresholds?.[key];
    thresholds[key] = {
      amberDays: numberOr(override?.amberDays, fallback.amberDays),
      redDays: numberOr(override?.redDays, fallback.redDays),
    };
  }
  return {
    thresholds,
    flagVisibility: settings?.flagVisibility ?? SYSTEM_DEFAULT_FLAG_VISIBILITY,
    countWeekends: settings?.countWeekends ?? SYSTEM_DEFAULT_COUNT_WEEKENDS,
    pauseDuringPto: settings?.pauseDuringPto ?? SYSTEM_DEFAULT_PAUSE_DURING_PTO,
    tzOffsetMinutes: settings?.tzOffsetMinutes ?? SYSTEM_DEFAULT_TZ_OFFSET_MINUTES,
  };
}

function numberOr(value: number | undefined | null, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** True when the team has overridden this column's threshold away from the system default. */
export function isOverridden(settings: TeamSettings | null, column: EvaluatedColumn): boolean {
  const override = settings?.thresholds?.[column];
  if (!override) return false;
  const base: ColumnThreshold = SYSTEM_DEFAULT_THRESHOLDS[column];
  return (
    (override.amberDays != null && override.amberDays !== base.amberDays) ||
    (override.redDays != null && override.redDays !== base.redDays)
  );
}
