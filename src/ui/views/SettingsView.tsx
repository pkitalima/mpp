import { useEffect, useState } from 'react';
import { useStore } from '../../state/store';
import { isOverridden, SYSTEM_DEFAULT_THRESHOLDS } from '../../domain/thresholds';
import { VISIBILITY_LEVELS } from '../../domain/visibility';
import { formatRelative } from '../../domain/time';
import {
  columnLabel,
  EVALUATED_COLUMNS,
  type EvaluatedColumn,
  type FlagVisibility,
  type TeamSettings,
} from '../../domain/types';

/** Blocked earns a longer label here, because the setting covers the tag as well as the column. */
function thresholdLabel(column: EvaluatedColumn): string {
  return column === 'blocked' ? 'Blocked (column or tag)' : columnLabel(column);
}

export function SettingsView() {
  const { viewer, rawSettings, settings, actions, backend, now, snapshot } = useStore();
  const [loadingExample, setLoadingExample] = useState(false);
  const [draft, setDraft] = useState(() => settings.thresholds);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setDraft(settings.thresholds), [settings.thresholds]);

  if (!viewer) return null;
  const isLead = viewer.role === 'lead';
  const updatedBy = snapshot.users.find((u) => u.id === rawSettings?.updatedBy);

  function saveThresholds() {
    for (const column of EVALUATED_COLUMNS) {
      const value = draft[column];
      if (value.amberDays <= 0 || value.redDays <= 0) {
        return setError('Thresholds must be at least a fraction of a day.');
      }
      if (value.amberDays >= value.redDays) {
        return setError(`${thresholdLabel(column)}: amber has to come before red.`);
      }
    }
    setError(null);
    const thresholds: TeamSettings['thresholds'] = {};
    for (const column of EVALUATED_COLUMNS) thresholds[column] = { ...draft[column] };
    void actions.saveSettings({ thresholds });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-5">
      {!isLead && (
        <p className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
          Thresholds and visibility are the lead's to set. You can see exactly what they are — every
          change is announced to the whole team.
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">Stagnation thresholds</h2>
        <p className="mb-3 text-xs text-slate-500">
          Days without movement before a card turns amber, then red. Anything you leave at the default
          keeps following the system default if that ever changes.
        </p>

        <div className="space-y-3">
          {EVALUATED_COLUMNS.map((column) => (
            <div key={column} className="flex flex-wrap items-center gap-3">
              <span className="w-44 text-sm font-medium text-slate-700">{thresholdLabel(column)}</span>
              {(['amberDays', 'redDays'] as const).map((field) => (
                <label key={field} className="flex items-center gap-1.5 text-sm text-slate-600">
                  <span className={field === 'amberDays' ? 'text-amber-700' : 'text-rose-700'}>
                    {field === 'amberDays' ? 'amber' : 'red'}
                  </span>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    disabled={!isLead}
                    value={draft[column][field]}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        [column]: { ...d[column], [field]: Number(e.target.value) },
                      }))
                    }
                    className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  <span className="text-xs text-slate-400">d</span>
                </label>
              ))}
              {isOverridden(rawSettings, column) ? (
                <button
                  onClick={() => setDraft((d) => ({ ...d, [column]: { ...SYSTEM_DEFAULT_THRESHOLDS[column] } }))}
                  disabled={!isLead}
                  className="text-xs text-slate-500 underline disabled:no-underline disabled:opacity-50"
                >
                  reset to default ({SYSTEM_DEFAULT_THRESHOLDS[column].amberDays}/
                  {SYSTEM_DEFAULT_THRESHOLDS[column].redDays})
                </button>
              ) : (
                <span className="text-xs text-slate-400">system default</span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
          <Toggle
            checked={settings.countWeekends}
            disabled={!isLead}
            onChange={(v) => void actions.saveSettings({ countWeekends: v })}
            label="Count weekends"
            hint="Off by default. A radar that turns every Monday red gets ignored by week three."
          />
          <Toggle
            checked={settings.pauseDuringPto}
            disabled={!isLead}
            onChange={(v) => void actions.saveSettings({ pauseDuringPto: v })}
            label="Pause clocks while someone is away"
            hint="Nobody should come back from leave to a board full of red."
          />
        </div>

        {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}

        {isLead && (
          <button
            onClick={saveThresholds}
            className="mt-4 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Save thresholds
          </button>
        )}

        <p className="mt-3 text-xs text-slate-400">
          Changing a threshold re-evaluates live cards immediately. It never rewrites flags already
          raised, so the Pulse trend stays honest across a retune.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-800">Who sees a stagnation flag</h2>
        <p className="mb-3 text-xs text-slate-500">
          The default is deliberate: shared flags are what make this peer support rather than
          escalation. If that reads as a public reprimand on your team, turn it down — a tool people
          work around is worse than one they can tune.
        </p>
        <div className="space-y-2">
          {VISIBILITY_LEVELS.map((level) => (
            <label
              key={level.id}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${
                settings.flagVisibility === level.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200'
              } ${isLead ? '' : 'cursor-not-allowed opacity-70'}`}
            >
              <input
                type="radio"
                name="visibility"
                disabled={!isLead}
                checked={settings.flagVisibility === level.id}
                onChange={() => void actions.saveSettings({ flagVisibility: level.id as FlagVisibility })}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">
                  {level.label}
                  {level.id === 'team' && <span className="ml-2 text-xs text-slate-400">default</span>}
                </span>
                <span className="block text-xs text-slate-500">{level.description}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Changing this notifies everyone. A silent change to who can see what is exactly the kind of
          thing that erodes trust in the tool.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">This deployment</h2>
        <dl className="space-y-1 text-sm text-slate-600">
          <Row label="Storage">
            {backend === 'supabase' ? 'Supabase (Postgres)' : 'Local IndexedDB — no backend configured'}
          </Row>
          <Row label="Day boundary">UTC{formatOffset(settings.tzOffsetMinutes)}</Row>
          <Row label="Settings last changed">
            {rawSettings?.updatedAt
              ? `${updatedBy?.displayName ?? 'someone'}, ${formatRelative(rawSettings.updatedAt, now)}`
              : 'never — running on system defaults'}
          </Row>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          {backend === 'local' && (
            <button
              onClick={() => void actions.resetDemoData()}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              Reset demo data
            </button>
          )}
          {isLead && snapshot.cards.length === 0 && (
            <button
              disabled={loadingExample}
              onClick={async () => {
                setLoadingExample(true);
                try {
                  await actions.loadExampleBoard();
                } finally {
                  setLoadingExample(false);
                }
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loadingExample ? 'Loading…' : 'Load example board'}
            </button>
          )}
        </div>
        {isLead && snapshot.cards.length === 0 && (
          <p className="mt-1.5 text-xs text-slate-500">
            Puts a fortnight of example work on the board, spread across everyone who has signed in
            so far — including one card that is already stalled, so there is something for the radar
            to catch. Delete the cards when you are done evaluating.
          </p>
        )}
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-44 shrink-0 text-slate-500">{label}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex gap-2 ${disabled ? 'opacity-70' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300"
      />
      <span>
        <span className="block text-sm text-slate-700">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </label>
  );
}

function formatOffset(minutes: number): string {
  if (minutes === 0) return '';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
