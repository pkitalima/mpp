import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { COLLECTIONS, emptySnapshot, type CollectionName, type Row, type Snapshot } from '../schema';
import type { AuthGateway, Repository } from '../repository';

/** Collection -> Postgres table. Matches supabase/migrations/0001_init.sql. */
const TABLES: Record<CollectionName, string> = {
  users: 'users',
  cards: 'cards',
  subTasks: 'sub_tasks',
  events: 'activity_events',
  settings: 'team_settings',
  flags: 'stagnation_flags',
  focusBlocks: 'focus_blocks',
  notifications: 'notifications',
  catalystSessions: 'catalyst_sessions',
};

const COLLECTION_ENTRIES = Object.entries(TABLES) as [CollectionName, string][];

function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function mapKeys<T extends Record<string, unknown>>(row: T, fn: (key: string) => string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[fn(key)] = value;
  return out;
}

/**
 * Postgres-backed repository. Row Level Security carries the §5.4 visibility rules at the
 * database level — "Owner only" enforced by a hidden div is not a privacy setting.
 */
export class SupabaseRepository implements Repository {
  readonly kind = 'supabase' as const;
  private client: SupabaseClient;
  private listeners = new Set<() => void>();
  private channelStarted = false;
  readonly auth: AuthGateway;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
    const client = this.client;
    this.auth = {
      async currentUserId() {
        const { data } = await client.auth.getSession();
        return data.session?.user.id ?? null;
      },
      onChange(listener) {
        const { data } = client.auth.onAuthStateChange(() => listener());
        return () => data.subscription.unsubscribe();
      },
      async sendMagicLink(email) {
        const { error } = await client.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw new Error(error.message);
      },
      async signOut() {
        await client.auth.signOut();
      },
    };
  }

  async load(): Promise<Snapshot> {
    const snapshot = emptySnapshot();
    await Promise.all(
      COLLECTION_ENTRIES.map(async ([collection, table]) => {
        const { data, error } = await this.client.from(table).select('*');
        if (error) throw new Error(`Failed to load ${table}: ${error.message}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (snapshot as any)[collection] = (data ?? []).map((row) => mapKeys(row as Record<string, unknown>, toCamel));
      }),
    );
    return snapshot;
  }

  async put<K extends CollectionName>(collection: K, rows: Row<K>[]): Promise<void> {
    if (rows.length === 0) return;
    const table = TABLES[collection];
    const payload = rows.map((row) => mapKeys(row as unknown as Record<string, unknown>, toSnake));
    const { error } = await this.client
      .from(table)
      .upsert(payload, { onConflict: toSnake(COLLECTIONS[collection]) });
    if (error) throw new Error(`Failed to write ${table}: ${error.message}`);
  }

  async remove(collection: CollectionName, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const table = TABLES[collection];
    const { error } = await this.client.from(table).delete().in(toSnake(COLLECTIONS[collection]), ids);
    if (error) throw new Error(`Failed to delete from ${table}: ${error.message}`);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    if (!this.channelStarted) {
      this.channelStarted = true;
      this.client
        .channel('mpp-changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          for (const l of this.listeners) l();
        })
        .subscribe();
    }
    return () => {
      this.listeners.delete(listener);
    };
  }
}
