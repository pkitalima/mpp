import { openDB, type IDBPDatabase } from 'idb';
import { COLLECTIONS, COLLECTION_NAMES, emptySnapshot, type CollectionName, type Row, type Snapshot } from '../schema';
import type { Repository } from '../repository';

const DB_NAME = 'mpp';
const DB_VERSION = 1;
const CHANNEL = 'mpp:changes';

/**
 * IndexedDB-backed repository. This is what makes the PWA work offline and what lets the app
 * run with no backend configured; a BroadcastChannel gives the same cross-tab live updates the
 * Supabase adapter gets from Postgres replication.
 */
export class LocalRepository implements Repository {
  readonly kind = 'local' as const;
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;

  private db(): Promise<IDBPDatabase> {
    this.dbPromise ??= openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const name of COLLECTION_NAMES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: COLLECTIONS[name] });
          }
        }
      },
    });
    return this.dbPromise;
  }

  async load(): Promise<Snapshot> {
    const db = await this.db();
    const snapshot = emptySnapshot();
    for (const name of COLLECTION_NAMES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (snapshot as any)[name] = await db.getAll(name);
    }
    return snapshot;
  }

  async put<K extends CollectionName>(collection: K, rows: Row<K>[]): Promise<void> {
    if (rows.length === 0) return;
    const db = await this.db();
    const tx = db.transaction(collection, 'readwrite');
    await Promise.all(rows.map((row) => tx.store.put(row)));
    await tx.done;
    this.announce();
  }

  async remove(collection: CollectionName, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await this.db();
    const tx = db.transaction(collection, 'readwrite');
    await Promise.all(ids.map((id) => tx.store.delete(id)));
    await tx.done;
    this.announce();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.channel && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = () => {
        for (const l of this.listeners) l();
      };
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  async reset(): Promise<void> {
    const db = await this.db();
    for (const name of COLLECTION_NAMES) {
      const tx = db.transaction(name, 'readwrite');
      await tx.store.clear();
      await tx.done;
    }
    this.announce();
  }

  private announce(): void {
    this.channel?.postMessage('changed');
  }
}
