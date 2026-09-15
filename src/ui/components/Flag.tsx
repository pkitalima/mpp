import { formatDays } from '../../domain/time';
import type { Evaluation, FlagLevel } from '../../domain/types';

const STYLES: Record<FlagLevel, { dot: string; chip: string; label: string }> = {
  green: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Moving' },
  amber: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-900 border-amber-300', label: 'Slowing' },
  red: { dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-900 border-rose-300', label: 'Stalled' },
};

export const BORDER_BY_LEVEL: Record<FlagLevel, string> = {
  green: 'border-slate-200',
  amber: 'border-amber-300',
  red: 'border-rose-400',
};

/**
 * Colour is never the only carrier of the signal — every flag states its level and how long the
 * card has been still, so the board reads the same to someone who cannot distinguish the hues.
 */
export function FlagChip({ evaluation, compact = false }: { evaluation: Evaluation; compact?: boolean }) {
  const style = STYLES[evaluation.level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${style.chip}`}
      title={`No movement for ${formatDays(evaluation.activeDays)} — ${evaluation.column.replace('_', ' ')} turns ${
        evaluation.level === 'red' ? 'red' : 'amber'
      } at ${evaluation.level === 'red' ? evaluation.threshold.redDays : evaluation.threshold.amberDays} days`}
    >
      <span className={`relative inline-block h-2 w-2 rounded-full ${style.dot}`} />
      {compact ? formatDays(evaluation.activeDays) : `${style.label} · ${formatDays(evaluation.activeDays)}`}
    </span>
  );
}

export function FlagDot({ level, pulse = false }: { level: FlagLevel; pulse?: boolean }) {
  return (
    <span
      className={`relative inline-block h-2.5 w-2.5 rounded-full ${STYLES[level].dot} ${
        pulse && level === 'red' ? 'ring-pulse text-rose-400' : ''
      }`}
      aria-label={STYLES[level].label}
    />
  );
}
