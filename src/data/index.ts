import { LocalRepository } from './local/localRepository';
import { SupabaseRepository } from './supabase/supabaseRepository';
import type { Repository } from './repository';

/**
 * Supabase when it is configured, IndexedDB otherwise. The app is fully usable with no backend,
 * which is what keeps `npm run dev` a zero-setup command for anyone picking this up.
 */
export function createRepository(): Repository {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (url && key) return new SupabaseRepository(url, key);
  return new LocalRepository();
}

/** True when this build is pointed at a Supabase project rather than local storage. */
export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}

export type { Repository };
