import { useState } from 'react';
import { useStore } from './state/store';
import { BoardView } from './ui/views/BoardView';
import { PulseView } from './ui/views/PulseView';
import { SettingsView } from './ui/views/SettingsView';
import { CardDrawer } from './ui/components/CardDrawer';
import { FocusBar, FocusLauncher } from './ui/components/FocusBar';
import { NotificationTray } from './ui/components/NotificationTray';
import { ErrorScreen, SignIn } from './ui/components/Gate';
import { canSeeFlag } from './domain/visibility';

type View = 'pulse' | 'board' | 'settings';

const TABS: { id: View; label: string }[] = [
  { id: 'pulse', label: 'Team Pulse' },
  { id: 'board', label: 'Board' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const { status, viewer, users, actions, evaluations, settings, cards, backend } = useStore();
  const [view, setView] = useState<View>('pulse');
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  if (status === 'signed_out') return <SignIn />;
  if (status === 'error') return <ErrorScreen />;
  if (status !== 'ready' || !viewer) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">Loading board…</div>
    );
  }

  // The badge is a count, but at "Owner only" even a count is attribution a teammate should not
  // have — so it counts what this viewer is allowed to see, not what exists.
  const redCount = [...evaluations.values()].filter((evaluation) => {
    if (evaluation.level !== 'red') return false;
    const card = cards.find((c) => c.id === evaluation.cardId);
    return card ? canSeeFlag(viewer, card, settings.flagVisibility) : false;
  }).length;

  return (
    <div className="flex h-full flex-col">
      <FocusBar />

      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-sky-400">
            MPP
          </span>
          <span className="hidden text-sm text-slate-400 sm:inline">Marketing team</span>
        </div>

        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                view === tab.id ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.label}
              {tab.id === 'pulse' && redCount > 0 && (
                <span className="ml-1.5 rounded-full bg-rose-100 px-1.5 text-xs font-semibold text-rose-700">
                  {redCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <FocusLauncher />
          <NotificationTray />
          {/* No auth in the local build: this switcher stands in for signing in as a teammate,
              which is also the fastest way to see what each visibility level actually hides. On a
              real backend you are who you signed in as. */}
          {backend === 'local' ? (
            <select
              value={viewer.id}
              onChange={(e) => actions.setViewer(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700"
              aria-label="Viewing as"
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.displayName}
                  {user.role === 'lead' ? ' (lead)' : ''}
                </option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => void actions.signOut()}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              title={viewer.email}
            >
              {viewer.displayName.split(' ')[0]} · Sign out
            </button>
          )}
        </div>
      </header>

      {backend === 'local' && (
        <p className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
          Demo data — an example eight-person team, seeded fresh in this browser. Nothing here is
          real work, and nothing leaves this device.
        </p>
      )}

      {settings.flagVisibility !== 'team' && (
        <p className="bg-slate-100 px-4 py-1.5 text-xs text-slate-600">
          Flag visibility is set to <strong>{settings.flagVisibility.replace('_', ' + ')}</strong> — some
          flags are hidden from you by design.
        </p>
      )}

      <main className="flex-1 overflow-hidden">
        {view === 'board' && <BoardView onOpenCard={setOpenCardId} />}
        {view === 'pulse' && (
          <div className="h-full overflow-y-auto">
            <PulseView onOpenCard={setOpenCardId} />
          </div>
        )}
        {view === 'settings' && (
          <div className="h-full overflow-y-auto">
            <SettingsView />
          </div>
        )}
      </main>

      {openCardId && <CardDrawer cardId={openCardId} onClose={() => setOpenCardId(null)} />}
    </div>
  );
}
