import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

export const foundationMigrationUrl = new URL(
  "../../supabase/migrations/20260713000100_foundation_slice_schema.sql",
  import.meta.url,
);
export const directoryMigrationUrl = new URL(
  "../../supabase/migrations/20261008120645_identity_access_directory.sql",
  import.meta.url,
);
export const foundationSeedUrl = new URL(
  "../../supabase/seed/foundation_demo_seed.sql",
  import.meta.url,
);

export async function runSqlFile(database, url) {
  return database.exec(await readFile(url, "utf8"));
}

// PGlite runs PostgreSQL constraints, privileges and RLS. This fixture is NOT
// Supabase Auth or the Data API: the harness supplies simulated request claims.
// Only auth.users(id), auth.uid() and auth.jwt() are mocked; no undocumented
// Auth user columns, credentials, network services or real identities are used.
export async function createTestDatabase({
  seedBeforeMigration = true,
  applyDirectory = true,
} = {}) {
  const database = new PGlite();
  try {
    await database.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid
        language sql stable set search_path = ''
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.jwt() returns jsonb
        language sql stable set search_path = ''
        as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      revoke all on schema auth from public;
      grant usage on schema auth to anon, authenticated;
      revoke all on auth.users from public, anon, authenticated;
      grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
      grant usage on schema public to anon, authenticated;
      -- Model pre-existing Supabase-style broad default table grants, including
      -- the two tables created by the directory migration.
      alter default privileges in schema public
        grant all on tables to anon, authenticated;
    `);
    await runSqlFile(database, foundationMigrationUrl);
    // Column ACLs are independent of table ACLs. These deliberately overbroad
    // historical grants must also be removed by the migration.
    await database.exec(`
      grant select (auth_user_id), update (auth_user_id, display_name)
        on public.user_profiles to public, anon, authenticated;
      grant select (created_at), update (display_name)
        on public.client_accounts to public, anon, authenticated;
      grant select (updated_at), update (display_name)
        on public.facilities to public, anon, authenticated;
      grant select (event_metadata), insert (event_metadata), update (event_metadata)
        on public.audit_events to public, anon, authenticated;
    `);
    if (seedBeforeMigration) await runSqlFile(database, foundationSeedUrl);
    if (applyDirectory) await runSqlFile(database, directoryMigrationUrl);
    return database;
  } catch (error) {
    await database.close();
    throw error;
  }
}

export async function setSimulatedSubject(database, authUserId, claims = {}) {
  await database.query(
    `select set_config('request.jwt.claim.sub', $1, false),
            set_config('request.jwt.claims', $2, false)`,
    [authUserId ?? "", JSON.stringify({ is_anonymous: false, ...claims })],
  );
}

export async function asClientRole(database, role, callback) {
  if (!["anon", "authenticated"].includes(role)) {
    throw new Error(`Unsupported simulated client role: ${role}`);
  }
  await database.exec(`set role ${role}`);
  try {
    return await callback();
  } finally {
    await database.exec("reset role");
  }
}

// A separate helper keeps trusted provisioning distinct from browser clients.
export async function asProvisioningRole(database, callback) {
  await database.exec("set role service_role");
  try {
    return await callback();
  } finally {
    await database.exec("reset role");
  }
}
