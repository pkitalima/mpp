import { useState } from 'react';
import { useStore } from '../../state/store';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-sky-400">
            MPP
          </span>
          <span className="text-sm text-slate-500">Momentum Project Platform</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SignIn() {
  const { actions } = useStore();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-slate-900">Check your email</h1>
        <p className="mt-2 text-sm text-slate-600">
          A sign-in link is on its way to <strong>{email}</strong>. Opening it on this device signs
          you in.
        </p>
        <button
          onClick={() => setSent(false)}
          className="mt-4 text-sm text-slate-500 underline hover:text-slate-800"
        >
          Use a different address
        </button>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">
        The first person to sign in becomes the team lead and can set thresholds and flag
        visibility. Everyone after that joins as a member.
      </p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!email.trim()) return;
          setBusy(true);
          setProblem(null);
          try {
            await actions.sendMagicLink(email.trim());
            setSent(true);
          } catch (cause) {
            setProblem(cause instanceof Error ? cause.message : String(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <button
          disabled={busy}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send link'}
        </button>
      </form>
      {problem && <p className="mt-3 text-sm text-rose-700">{problem}</p>}
    </Shell>
  );
}

/**
 * The failure this replaces: an empty result from a backend the app could not read looked exactly
 * like a board with nothing on it, and the app sat on "Loading…" forever. Whatever went wrong,
 * say what it was.
 */
export function ErrorScreen() {
  const { error, actions, backend } = useStore();
  return (
    <Shell>
      <h1 className="text-lg font-semibold text-slate-900">Could not load the board</h1>
      <p className="mt-2 rounded-lg bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700">
        {error ?? 'Unknown error'}
      </p>
      {backend === 'supabase' && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Has <code>supabase/migrations/0001_init.sql</code> been applied to this project?</li>
          <li>Do <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> point at it?</li>
          <li>
            A permission error usually means the grants at the end of the migration did not run.
          </li>
        </ul>
      )}
      <div className="mt-4 flex gap-2">
        <button
          onClick={actions.retry}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Try again
        </button>
        {backend === 'supabase' && (
          <button
            onClick={() => void actions.signOut()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        )}
      </div>
    </Shell>
  );
}
