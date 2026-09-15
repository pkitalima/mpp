import { useState } from 'react';
import { useStore } from '../../state/store';
import { formatRelative } from '../../domain/time';

export function NotificationTray() {
  const { viewer, snapshot, now, inDeepWork, actions } = useStore();
  const [open, setOpen] = useState(false);
  if (!viewer) return null;

  const mine = snapshot.notifications
    .filter((n) => n.userId === viewer.id)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const held = mine.filter((n) => n.deliveredAt === null);
  const delivered = mine.filter((n) => n.deliveredAt !== null);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        aria-label={`Notifications (${delivered.length} delivered, ${held.length} held)`}
      >
        Inbox
        {delivered.length > 0 && (
          <span className="ml-1.5 rounded-full bg-slate-900 px-1.5 text-xs font-semibold text-white">
            {delivered.length}
          </span>
        )}
        {held.length > 0 && (
          <span className="ml-1 rounded-full bg-sky-100 px-1.5 text-xs font-semibold text-sky-700">
            {held.length} held
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          {inDeepWork && (
            <p className="mb-2 rounded-lg bg-sky-50 px-2 py-1.5 text-xs text-sky-800">
              You are in Deep Work. Non-urgent items are holding and will arrive together when the
              block ends.
            </p>
          )}
          {mine.length === 0 && <p className="p-3 text-sm text-slate-500">Nothing here.</p>}
          {mine.map((n) => (
            <div
              key={n.id}
              className={`group flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-slate-50 ${
                n.deliveredAt === null ? 'opacity-60' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-slate-800">{n.title}</span>
                  {n.urgent && (
                    <span className="rounded bg-rose-100 px-1 text-[10px] font-semibold uppercase text-rose-700">
                      urgent
                    </span>
                  )}
                  {n.deliveredAt === null && (
                    <span className="rounded bg-slate-100 px-1 text-[10px] uppercase text-slate-500">held</span>
                  )}
                </div>
                <p className="text-xs text-slate-600">{n.body}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">{formatRelative(n.createdAt, now)}</p>
              </div>
              <button
                onClick={() => void actions.dismissNotification(n.id)}
                className="invisible text-xs text-slate-400 hover:text-slate-700 group-hover:visible"
              >
                Clear
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
