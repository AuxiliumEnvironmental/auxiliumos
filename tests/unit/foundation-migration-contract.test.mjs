import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260713000100_foundation_slice_schema.sql",
    import.meta.url,
  ),
  "utf8",
);

const seed = readFileSync(
  new URL("../../supabase/seed/foundation_demo_seed.sql", import.meta.url),
  "utf8",
);

const expectedTables = [
  "account_memberships",
  "audit_events",
  "client_accounts",
  "documents",
  "facilities",
  "incident_requests",
  "user_profiles",
];

test("migration creates exactly the approved foundation tables", () => {
  const createdTables = Array.from(
    migration.matchAll(/create\s+table\s+public\.([a-z_]+)/gi),
    (match) => match[1],
  ).sort();

  assert.deepEqual(createdTables, expectedTables);
});

test("migration enables RLS on every approved table", () => {
  for (const table of expectedTables) {
    const pattern = new RegExp(
      `alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`,
      "i",
    );

    assert.match(migration, pattern, `RLS is not enabled on ${table}`);
  }
});

test("migration creates no RLS policies, auth objects, or storage objects", () => {
  assert.doesNotMatch(migration, /create\s+policy/i);
  assert.doesNotMatch(migration, /\bauth\./i);
  assert.doesNotMatch(migration, /\bstorage\./i);
  assert.doesNotMatch(migration, /security\s+definer/i);
});

test("migration preserves internal-only defaults without hard-coding release forever", () => {
  assert.match(
    migration,
    /is_internal_only\s+boolean\s+not\s+null\s+default\s+true/i,
  );

  assert.match(
    migration,
    /release_state\s+text\s+not\s+null\s+default\s+'uploaded_unclassified'/i,
  );

  assert.doesNotMatch(
    migration,
    /check\s*\(\s*is_internal_only\s*=\s*true\s*\)/i,
  );
});

test("migration keeps auth linkage nullable and storage deferred", () => {
  assert.match(migration, /auth_user_id\s+uuid\s+unique/i);
  assert.doesNotMatch(migration, /references\s+auth\./i);
  assert.doesNotMatch(migration, /bucket|object_key|signed_url/i);
});

test("seed data is deterministic, demo-only, and contains no credentials", () => {
  assert.match(seed, /Demo Property Group/);
  assert.match(seed, /North Wing Facility/);
  assert.match(seed, /Water Intrusion Demo/);
  assert.match(seed, /Document Placeholder 001/);
  assert.match(seed, /Removed User Demo/);
  assert.match(seed, /00000000-0000-4000-8000-000000000001/);

  assert.doesNotMatch(
    seed,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  );

  assert.doesNotMatch(
    seed,
    /\b(service[_ -]?role|api[_ -]?key|password|patient|medical record)\b/i,
  );
});

test("seed creates no auth users and no storage objects", () => {
  assert.doesNotMatch(seed, /insert\s+into\s+auth\./i);
  assert.doesNotMatch(seed, /\bstorage\./i);
});