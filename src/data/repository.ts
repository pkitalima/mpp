import type { CollectionName, Row, Snapshot } from './schema';

/**
 * Present only on backends that authenticate. The local build has no gateway and no sign-in:
 * it is a single-browser demo, and its person switcher stands in for signing in as a teammate.
 */
export interface AuthGateway {
  /** The signed-in person's id, or null when there is no session. */
  currentUserId(): Promise<string | null>;
  onChange(listener: () => void): () => void;
  sendMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
}

/**
 * The storage seam. Kept deliberately narrow — collection reads, writes and a change signal —
 * so the Supabase adapter is a mapping layer rather than a second copy of the domain logic,
 * and so the app runs with no backend configured at all.
 */
export interface Repository {
  readonly kind: 'local' | 'supabase';
  load(): Promise<Snapshot>;
  put<K extends CollectionName>(collection: K, rows: Row<K>[]): Promise<void>;
  remove(collection: CollectionName, ids: string[]): Promise<void>;
  /** Fires whenever data changes — in another tab, or from another client. */
  subscribe(listener: () => void): () => void;
  readonly auth?: AuthGateway;
  reset?(): Promise<void>;
}
