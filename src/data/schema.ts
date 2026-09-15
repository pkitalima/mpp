import type {
  ActivityEvent,
  Card,
  CatalystSession,
  FocusBlock,
  QueuedNotification,
  StagnationFlag,
  SubTask,
  TeamSettings,
  User,
} from '../domain/types';

/** Collection name -> primary key field. Mirrors the tables in supabase/migrations. */
export const COLLECTIONS = {
  users: 'id',
  cards: 'id',
  subTasks: 'id',
  events: 'id',
  settings: 'teamId',
  flags: 'id',
  focusBlocks: 'id',
  notifications: 'id',
  catalystSessions: 'id',
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

export interface Snapshot {
  users: User[];
  cards: Card[];
  subTasks: SubTask[];
  events: ActivityEvent[];
  settings: TeamSettings[];
  flags: StagnationFlag[];
  focusBlocks: FocusBlock[];
  notifications: QueuedNotification[];
  catalystSessions: CatalystSession[];
}

export type Row<K extends CollectionName> = Snapshot[K][number];

export function emptySnapshot(): Snapshot {
  return {
    users: [],
    cards: [],
    subTasks: [],
    events: [],
    settings: [],
    flags: [],
    focusBlocks: [],
    notifications: [],
    catalystSessions: [],
  };
}

export const COLLECTION_NAMES = Object.keys(COLLECTIONS) as CollectionName[];

export function newId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${random}`;
}
