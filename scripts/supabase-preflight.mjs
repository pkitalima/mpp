/**
 * Checks a Supabase project is ready for MPP, and says precisely what is missing when it is not.
 *
 *   npm run supabase:check                       # reads .env.local
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... npm run supabase:check
 *
 * Uses only the anon key, which is public by design — it is compiled into the browser bundle,
 * and Row Level Security is what protects the data. Never put the service_role key here.
 */
import { readFile } from 'node:fs/promises';

const TABLES = [
  'teams',
  'users',
  'team_settings',
  'cards',
  'sub_tasks',
  'activity_events',
  'stagnation_flags',
  'focus_blocks',
  'notifications',
  'catalyst_sessions',
];

async function loadEnv() {
  const env = { ...process.env };
  for (const file of ['.env.local', '.env']) {
    try {
      const text = await readFile(file, 'utf8');
      for (const line of text.split('\n')) {
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (match && !env[match[1]]) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    } catch {
      // No env file is fine; the variables may come from the environment.
    }
  }
  return env;
}

const results = [];
const record = (ok, label, detail) => {
  results.push({ ok, label, detail });
  const mark = ok === true ? '  ok  ' : ok === null ? ' note ' : ' FAIL ';
  console.log(`[${mark}] ${label}${detail ? `\n         ${detail}` : ''}`);
};

const env = await loadEnv();
const url = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  record(false, 'Credentials present', 'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}
record(true, 'Credentials present', url);

if (key.length > 20 && key.split('.').length !== 3 && !key.startsWith('sb_')) {
  record(null, 'Anon key shape', 'This does not look like an anon key. The service_role key must never be used here.');
}

const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function probe(path, init = {}) {
  const response = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  return { status: response.status, body: await response.text() };
}

// 1. Is the project reachable at all?
try {
  const { status } = await probe('/rest/v1/');
  if (status >= 500) record(false, 'Project reachable', `REST endpoint returned ${status}`);
  else record(true, 'Project reachable', `REST endpoint answered ${status}`);
} catch (cause) {
  // fetch's own message is always "fetch failed"; the reason people can act on is underneath.
  const reason = cause instanceof Error ? (cause.cause?.message ?? cause.message) : String(cause);
  record(false, 'Project reachable', `${reason} — check VITE_SUPABASE_URL is the project URL, e.g. https://abcdefgh.supabase.co`);
  process.exit(1);
}

// 2. Has the migration been applied?
const missing = [];
const forbidden = [];
for (const table of TABLES) {
  const { status, body } = await probe(`/rest/v1/${table}?select=*&limit=1`);
  if (status === 404 || body.includes('does not exist')) missing.push(table);
  else if (status === 401 || status === 403) forbidden.push(table);
}

if (missing.length > 0) {
  record(false, 'Schema applied', `Missing tables: ${missing.join(', ')}. Run supabase/migrations/0001_init.sql.`);
} else if (forbidden.length > 0) {
  record(false, 'Schema applied', `Tables exist but are not readable: ${forbidden.join(', ')}. The grants at the end of the migration may not have run.`);
} else {
  record(true, 'Schema applied', `All ${TABLES.length} tables present and readable`);
}

// 3. RLS should hide everything from an unauthenticated request. Seeing rows here is a problem.
if (missing.length === 0) {
  const { body } = await probe('/rest/v1/cards?select=id&limit=1');
  let rows = [];
  try {
    rows = JSON.parse(body);
  } catch {
    rows = [];
  }
  if (Array.isArray(rows) && rows.length > 0) {
    record(false, 'RLS closed to strangers', 'An unauthenticated request can read cards. Check that RLS is enabled on every table.');
  } else {
    record(true, 'RLS closed to strangers', 'An unauthenticated request reads nothing, as it should');
  }
}

// 4. Is email sign-in usable? The settings endpoint is public.
try {
  const { body } = await probe('/auth/v1/settings');
  const settings = JSON.parse(body);
  if (settings?.external?.email === false) {
    record(false, 'Email sign-in enabled', 'Enable the Email provider under Authentication → Providers.');
  } else {
    record(true, 'Email sign-in enabled', 'Magic links can be sent');
  }
} catch {
  record(null, 'Email sign-in enabled', 'Could not read auth settings; check Authentication → Providers by hand.');
}

const failed = results.filter((r) => r.ok === false).length;
console.log(
  failed === 0
    ? '\nReady. Run `npm run dev` and sign in — the first person to sign in becomes the team lead.'
    : `\n${failed} check${failed === 1 ? '' : 's'} failed. Fix the above, then run this again.`,
);
process.exit(failed === 0 ? 0 : 1);
