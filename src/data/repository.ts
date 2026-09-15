import type { CollectionName, Row, Snapshot } from './schema';

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
  reset?(): Promise<void>;
}
