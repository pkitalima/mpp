import { useState } from 'react';
import { useStore } from '../../state/store';
import {
  blockEndsAt,
  clampFocusMinutes,
  currentBlockFor,
  FOCUS_PRESETS,
  MAX_FOCUS_MINUTES,
  MIN_FOCUS_MINUTES,
} from '../../domain/focus';
import { formatClock } from '../../domain/time';

export function FocusLauncher() {
  const { viewer, actions } = useStore();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const customMinutes = clampFocusMinutes(Number(custom));
  if (!viewer) return null;

  function start(scope: 'personal' | 'team', minutes: number) {
    void actions.startFocusBlock(scope, minutes);
    setOpen(false);
    setCustom('');
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Start Focus Block
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs text-slate-500">
            Non-urgent notifications hold until the block ends, then arrive as one digest.
          </p>
          {(['personal', 'team'] as const).map((scope) => (
            <div key={scope} className="mb-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {scope === 'personal' ? 'Just me' : 'Whole team'}
              </div>
              <div className="flex gap-1.5">
                {FOCUS_PRESETS.map((minutes) => (
                  <button
                    key={minutes}
                    onClick={() => start(scope, minutes)}
                    className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm hover:border-slate-400 hover:bg-slate-50"
                  >
                    {minutes}m
                  </button>
                ))}
                {/* Presets cover the common cases; the custom field is for the block that has to
                    end when something else starts. */}
                <form
                  className="flex flex-1 gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (customMinutes !== null) start(scope, customMinutes);
                  }}
                >
                  <input
                    type="number"
                    inputMode="numeric"
                    min={MIN_FOCUS_MINUTES}
                    max={MAX_FOCUS_MINUTES}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="custom"
                    aria-label={`Custom block length in minutes, ${scope === 'team' ? 'whole team' : 'just me'}`}
                    className="w-16 rounded-lg border border-slate-300 px-1.5 py-1.5 text-sm outline-none focus:border-slate-500"
                  />
                  <button
                    type="submit"
                    disabled={customMinutes === null}
                    aria-label={`Start a custom block, ${scope === 'team' ? 'whole team' : 'just me'}`}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm hover:border-slate-400 hover:bg-slate-50 disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent"
                  >
                    Go
                  </button>
                </form>
              </div>
            </div>
          ))}
          {custom !== '' && customMinutes === null && (
            <p className="mt-1 text-xs text-rose-700">
              Pick between {MIN_FOCUS_MINUTES} and {MAX_FOCUS_MINUTES} minutes.
            </p>
          )}
          {viewer.role !== 'lead' && (
            <p className="mt-1 text-xs text-slate-400">
              Anyone can start a team block — it is a signal, not a command.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function FocusBar() {
  const { viewer, snapshot, now, actions } = useStore();
  if (!viewer) return null;
  const block = currentBlockFor(viewer.id, snapshot.focusBlocks, now);
  if (!block) return null;

  const remaining = Math.max(0, (blockEndsAt(block) - now) / 1000);
  const others = block.participantIds.filter((id) => id !== viewer.id).length;

  return (
    <div className="flex items-center justify-between gap-4 bg-slate-900 px-4 py-2 text-slate-100">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-2 w-2 rounded-full bg-sky-400" />
        <span className="text-sm font-medium">Deep Work</span>
        <span className="font-mono text-sm tabular-nums text-sky-300">{formatClock(remaining)}</span>
        <span className="hidden text-xs text-slate-400 sm:inline">
          {block.scope === 'team' ? `with ${others} teammate${others === 1 ? '' : 's'}` : 'personal block'} ·
          notifications holding
        </span>
      </div>
      {/* Ending early is always one click with no confirmation — the block is a promise to
          yourself, not a commitment the tool enforces. */}
      <button
        onClick={() => void actions.endFocusBlock(block.id)}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
      >
        End early
      </button>
    </div>
  );
}
