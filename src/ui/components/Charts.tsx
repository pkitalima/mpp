import { useState, type ReactNode } from 'react';

/**
 * Chart palette. Each chart here is a single series, so the title names it and no legend is
 * needed; the second sequential context takes the next hue rather than a second blue.
 * Validated against the white card surface (CVD ΔE 24.7, normal-vision 33.6, both ≥ 3:1).
 */
export const SERIES_BLUE = '#2a78d6';
export const SERIES_ORANGE = '#eb6834';
const INK_MUTED = '#898781';
const GRIDLINE = '#e1e0d9';

export interface Point {
  label: string;
  value: number;
}

export function ColumnChart({
  data,
  color,
  caption,
  formatValue = (v: number) => String(v),
  onSelect,
  selectedIndex = null,
  selectLabel = 'Show',
}: {
  data: Point[];
  color: string;
  caption?: string;
  formatValue?: (value: number) => string;
  /** Makes each bar a control that opens the rows behind it. */
  onSelect?: (index: number) => void;
  selectedIndex?: number | null;
  selectLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const interactive = Boolean(onSelect);

  return (
    <figure className="m-0">
      <div className="relative flex h-32 items-end gap-2" style={{ borderBottom: `1px solid ${GRIDLINE}` }}>
        {data.map((point, index) => {
          const height = (point.value / max) * 100;
          const selected = selectedIndex === index;
          // The whole column is the hit target, not just the bar — a one-card week is a sliver.
          const Tag = interactive ? 'button' : 'div';
          return (
            <Tag
              key={point.label}
              type={interactive ? 'button' : undefined}
              onClick={interactive ? () => onSelect?.(index) : undefined}
              aria-pressed={interactive ? selected : undefined}
              aria-label={
                interactive ? `${selectLabel}: ${point.label}, ${formatValue(point.value)}` : undefined
              }
              className={`relative flex h-full flex-1 flex-col items-center justify-end rounded-t-lg border-0 bg-transparent p-0 ${
                interactive ? 'cursor-pointer focus-visible:outline-2 focus-visible:outline-slate-900' : ''
              }`}
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
            >
              {/* Direct label on every bar: four bars is few enough that the numbers are the
                  point, and it keeps the value off the colour alone. */}
              <span
                className="mb-1 text-xs font-medium tabular-nums"
                style={{ color: selected ? '#0b0b0b' : INK_MUTED }}
              >
                {formatValue(point.value)}
              </span>
              <div
                className="w-full transition-all"
                style={{
                  // A zero week still gets a hairline, so "none" reads as a value rather than
                  // as a missing bar.
                  height: `${Math.max(point.value > 0 ? 6 : 1.5, height)}%`,
                  maxHeight: 'calc(100% - 1.25rem)',
                  background: point.value > 0 ? color : GRIDLINE,
                  borderRadius: '4px 4px 0 0',
                  // Selection is carried by opacity and an underline below, not by hue: the bar
                  // must not change what colour it encodes when you click it.
                  opacity: selectedIndex !== null && !selected ? 0.4 : hover === null || hover === index ? 1 : 0.55,
                  boxShadow: selected ? `inset 0 0 0 2px #0f172a` : undefined,
                }}
              />
              {hover === index && (
                <div className="pointer-events-none absolute -top-8 z-10 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-xs text-white shadow">
                  {point.label}: {formatValue(point.value)}
                  {interactive && point.value > 0 && <span className="text-slate-300"> · click to list</span>}
                </div>
              )}
            </Tag>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2">
        {data.map((point, index) => (
          <span
            key={point.label}
            className={`flex-1 text-center text-[11px] ${
              selectedIndex === index ? 'font-semibold underline underline-offset-2' : ''
            }`}
            style={{ color: selectedIndex === index ? '#0b0b0b' : INK_MUTED }}
          >
            {point.label}
          </span>
        ))}
      </div>
      {caption && <figcaption className="mt-1 text-xs text-slate-400">{caption}</figcaption>}
    </figure>
  );
}

export function StatTile({
  label,
  value,
  context,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  context?: ReactNode;
  tone?: 'neutral' | 'good' | 'warning' | 'critical';
}) {
  const toneClass = {
    neutral: 'text-slate-900',
    good: 'text-emerald-700',
    warning: 'text-amber-700',
    critical: 'text-rose-700',
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {context && <p className="mt-1 text-xs leading-snug text-slate-500">{context}</p>}
    </div>
  );
}

/** A ratio against a limit reads better as a meter than as a one-bar chart. */
export function Meter({ label, value, max, suffix }: { label: string; value: number | null; max: number; suffix: string }) {
  const pct = value === null ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-slate-900">
          {value === null ? '—' : `${value.toFixed(1)}${suffix}`}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full" style={{ background: GRIDLINE }}>
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: SERIES_BLUE }} />
      </div>
    </div>
  );
}
