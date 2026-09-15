import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../state/store';
import { COMMITMENT_SECONDS, isValidStep, MAX_STEP_MINUTES, STEP_SUGGESTION_PROMPTS } from '../../domain/catalyst';
import { formatClock } from '../../domain/time';
import type { Card } from '../../domain/types';

type Phase = 'planning' | 'running' | 'choice' | 'continuing';

export function CatalystModal({ card, onClose }: { card: Card; onClose: () => void }) {
  const { snapshot, actions } = useStore();
  const steps = useMemo(
    () => snapshot.subTasks.filter((s) => s.cardId === card.id).sort((a, b) => a.position - b.position),
    [snapshot.subTasks, card.id],
  );

  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(3);
  const [phase, setPhase] = useState<Phase>('planning');
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const sessionId = useRef<string | null>(null);

  useEffect(() => {
    if (phase !== 'running' && phase !== 'continuing') return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === 'running' && elapsed >= COMMITMENT_SECONDS) setPhase('choice');
  }, [phase, elapsed]);

  const activeStep = steps.find((s) => s.id === activeStepId) ?? null;
  const remaining = Math.max(0, COMMITMENT_SECONDS - elapsed);
  const progress = Math.min(1, elapsed / COMMITMENT_SECONDS);

  async function justStart(stepId: string) {
    setActiveStepId(stepId);
    setElapsed(0);
    setPhase('running');
    sessionId.current = await actions.startCatalyst(card.id, stepId);
  }

  async function settle(continued: boolean) {
    if (sessionId.current) await actions.finishCatalyst(sessionId.current, continued);
    if (continued) {
      setPhase('continuing');
    } else {
      setPhase('planning');
      setActiveStepId(null);
      sessionId.current = null;
    }
  }

  async function stopContinuing(markDone: boolean) {
    if (markDone && activeStepId) await actions.toggleSubTask(activeStepId);
    setPhase('planning');
    setActiveStepId(null);
    sessionId.current = null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Micro-Task Catalyst</h2>
            <p className="text-sm text-slate-500">{card.title}</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">
            Close
          </button>
        </div>

        {phase === 'planning' && (
          <>
            <p className="mt-3 text-sm text-slate-600">
              Break it into steps you could finish in under {MAX_STEP_MINUTES} minutes. They are meant to
              be startable, not impressive.
            </p>

            <ul className="mt-3 space-y-1.5">
              {steps.map((step) => (
                <li
                  key={step.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={step.completedAt !== null}
                    onChange={() => void actions.toggleSubTask(step.id)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span
                    className={`flex-1 text-sm ${
                      step.completedAt ? 'text-slate-400 line-through' : 'text-slate-800'
                    }`}
                  >
                    {step.title}
                  </span>
                  <span className="text-xs text-slate-400">{step.estMinutes}m</span>
                  {!step.completedAt && (
                    <button
                      onClick={() => void justStart(step.id)}
                      className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                    >
                      Just Start
                    </button>
                  )}
                </li>
              ))}
              {steps.length === 0 && (
                <li className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">
                  No steps yet. Try something like “{STEP_SUGGESTION_PROMPTS[0]}”.
                </li>
              )}
            </ul>

            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!isValidStep(title, minutes)) return;
                void actions.addSubTask(card.id, title.trim(), minutes);
                setTitle('');
              }}
            >
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="One small step…"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500"
              />
              <select
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {[1, 2, 3, 4, 5].map((m) => (
                  <option key={m} value={m}>
                    {m}m
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={!isValidStep(title, minutes)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-40"
              >
                Add
              </button>
            </form>
          </>
        )}

        {(phase === 'running' || phase === 'choice' || phase === 'continuing') && activeStep && (
          <div className="mt-4 flex flex-col items-center py-4">
            <p className="mb-4 text-center text-sm text-slate-600">{activeStep.title}</p>

            <div className="relative h-36 w-36">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="44" fill="none" stroke="#e2e8f0" strokeWidth="8" />
                <circle
                  cx="50"
                  cy="50"
                  r="44"
                  fill="none"
                  stroke={phase === 'running' ? '#0f172a' : '#0ea5e9'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 44}
                  strokeDashoffset={2 * Math.PI * 44 * (1 - (phase === 'running' ? progress : 1))}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-mono text-2xl tabular-nums text-slate-900">
                  {phase === 'running' ? formatClock(remaining) : formatClock(elapsed)}
                </span>
                <span className="text-[11px] uppercase tracking-wide text-slate-400">
                  {phase === 'running' ? 'committed' : 'going'}
                </span>
              </div>
            </div>

            {phase === 'running' && (
              <p className="mt-4 text-center text-sm text-slate-500">
                Two minutes. That is the whole promise — you can stop when the timer does.
              </p>
            )}

            {phase === 'choice' && (
              <div className="mt-5 w-full">
                {/* Both options are presented as wins. Stopping here honoured the commitment. */}
                <p className="mb-3 text-center text-sm font-medium text-slate-800">
                  That is 120 seconds. Promise kept.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => void settle(false)}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Stop here
                  </button>
                  <button
                    onClick={() => void settle(true)}
                    className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Keep going
                  </button>
                </div>
                <p className="mt-2 text-center text-xs text-slate-400">
                  Either way the card counts as moving.
                </p>
              </div>
            )}

            {phase === 'continuing' && (
              <div className="mt-5 flex w-full gap-2">
                <button
                  onClick={() => void stopContinuing(false)}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Done for now
                </button>
                <button
                  onClick={() => void stopContinuing(true)}
                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  Step finished
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
