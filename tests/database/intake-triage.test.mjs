import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createTestDatabase, foundationSeedUrl, runSqlFile, setSimulatedSubject,
} from '../helpers/pglite-database.mjs';

const migration = (name) => new URL(`../../supabase/migrations/${name}.sql`, import.meta.url);
const intakeMigration = migration('20261008234951_intake_triage');
const id = (n, prefix = '00000000') => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const accountA = id(1), accountB = id(2);
const facilityA1 = id(301), facilityA2 = id(302), facilityB1 = id(303);
const profile = (n) => id(100 + n);
const subject = (n) => id(100 + n, '10000000');
const key = (n) => id(900 + n);
const submission = (extra = {}) => ({
  title: 'Synthetic condition request', original_wording: 'Preserve this exact synthetic wording.',
  issue_id: 'ISSUE-019', intent_id: 'INTENT-016', urgency: 'routine',
  affected_area: 'Synthetic north zone', site_contact: 'Synthetic contact role',
  access_notes: 'Synthetic access information', safety_flags: ['Unknown condition'],
  payer_note: 'Synthetic payer role', signer_note: 'Synthetic signer role', ...extra,
});
const rows = async (db, sql, params = []) => (await db.query(sql, params)).rows;
const rpc = async (db, name, params = []) => (await rows(db,
  `select public.${name}(${params.map((_, i) => `$${i + 1}`).join(',')}) as result`, params))[0].result;
const submit = (db, n = 1, value = submission(), account = accountA, facility = facilityA1) =>
  rpc(db, 'submit_project_request', [account, facility, key(n), value]);
const detail = (db, request) => rpc(db, 'get_project_request', [request]);
const triage = (db, request, revision, changes) => rpc(db, 'triage_project_request', [request, revision, changes]);
const list = (db, account = accountA, after = null, limit = 50, status = null) =>
  rpc(db, 'list_project_requests', [account, after, limit, status]);

async function expectError(db, code, operation) {
  await db.exec('savepoint expected_error');
  try {
    await assert.rejects(operation(), (error) => {
      assert.equal(error.code, code, `Expected SQLSTATE ${code}: ${error.message}`);
      return true;
    });
  } finally { await db.exec('rollback to savepoint expected_error; release savepoint expected_error'); }
}

// Explicit test-only gateway/session simulation. PGlite executes PostgreSQL
// ACLs, constraints, triggers, SQL transactions and row locks, but supplies no
// genuine Supabase Auth/JWT signature/PostgREST or concurrent connections.
async function session(db, owner, role, callback) {
  assert.ok(['postgres', 'authenticator', 'intake_untrusted'].includes(owner));
  assert.ok([null, 'anon', 'authenticated', 'service_role'].includes(role));
  await db.exec('savepoint simulated_session');
  try {
    await db.exec(`set session authorization ${owner}`);
    if (role) await db.exec(`set role ${role}`);
    return await callback();
  } catch (error) {
    await db.exec('rollback to savepoint simulated_session');
    throw error;
  } finally {
    await db.exec('reset role; set session authorization postgres; release savepoint simulated_session');
  }
}
async function gateway(db, person, callback, claims = {}) {
  const auth = person === null ? null : subject(person);
  await setSimulatedSubject(db, auth, { role: 'authenticated', sub: auth, ...claims });
  return session(db, 'authenticator', 'authenticated', callback);
}
async function grant(db, person, account, capability, scope, facility = null) {
  return rows(db, `insert into public.account_capability_grants
    (account_id,user_profile_id,capability_key,scope_kind,facility_id)
    values ($1,$2,$3,$4,$5) returning id`, [account, profile(person), capability, scope, facility]);
}
async function provision(db) {
  await db.exec(`create role authenticator nologin noinherit;
    grant anon, authenticated, service_role to authenticator;
    create role intake_untrusted nologin noinherit; grant authenticated to intake_untrusted;`);
  await db.query('insert into auth.users (id) select unnest($1::uuid[])', [Array.from({ length: 8 }, (_, n) => subject(n + 1))]);
  await db.query("insert into public.client_accounts (id,display_name) values ($1,'Intake B synthetic')", [accountB]);
  await db.query(`insert into public.facilities (id,account_id,display_name)
    values ($1,$2,'A2 synthetic'),($3,$4,'B1 synthetic')`, [facilityA2, accountA, facilityB1, accountB]);
  for (let n = 1; n <= 7; n++) {
    await db.query('update public.user_profiles set auth_user_id=$1 where id=$2', [subject(n), profile(n)]);
    await db.query("update public.user_profiles set identity_status='active' where id=$1", [profile(n)]);
    if (n !== 7) await db.query("update public.account_access set membership_status='active' where account_id=$1 and user_profile_id=$2", [accountA, profile(n)]);
  }
  await db.query("insert into public.account_access (account_id,user_profile_id,membership_status) values ($1,$2,'active')", [accountB, profile(4)]);
  for (const n of [1, 2, 3, 5, 6, 7]) await grant(db, n, accountA, 'view_account', 'account');
  for (const n of [1, 5, 7]) await grant(db, n, accountA, 'view_asset', 'facility', facilityA1);
  for (const n of [2, 3]) await grant(db, n, accountA, 'view_asset', 'all_facilities');
  await grant(db, 6, accountA, 'view_asset', 'facility', facilityA2);
  for (const n of [1, 5]) await grant(db, n, accountA, 'submit_request', 'facility', facilityA1);
  for (const n of [2, 7]) await grant(db, n, accountA, 'triage_request', 'facility', facilityA1);
  await grant(db, 6, accountA, 'triage_request', 'facility', facilityA2);
  await grant(db, 6, accountA, 'submit_request', 'facility', facilityA2);
  await grant(db, 4, accountB, 'view_account', 'account');
  await grant(db, 4, accountB, 'view_asset', 'facility', facilityB1);
  await grant(db, 4, accountB, 'submit_request', 'facility', facilityB1);
  await grant(db, 4, accountB, 'triage_request', 'facility', facilityB1);
  await db.query("insert into public.account_memberships (account_id,user_profile_id,role_key) values ($1,$2,'system_admin')", [accountA, profile(3)]);
}

test('intake triage: PostgreSQL/PGlite with simulated gateway and single-session limits', async (t) => {
  const db = await createTestDatabase();
  t.after(() => db.close());
  await runSqlFile(db, migration('20261008154950_access_audit_provenance'));
  await runSqlFile(db, migration('20261008164758_private_object_reservations'));
  // Existing nullable/long-title legacy rows must survive without invented facts.
  await db.query(`insert into public.incident_requests (id,account_id,title,request_status)
    values ($1,$2,$3,'draft'),($4,$2,'Legacy no submitter','submitted')`,
  [id(450), accountA, 'L'.repeat(240), id(451)]);
  await db.query('update public.incident_requests set facility_id=$1 where id=$2', [facilityA1, id(451)]);
  const oldRequests = await rows(db, 'select * from public.incident_requests order by id');
  const oldDocuments = await rows(db, 'select * from public.documents order by id');
  const oldAudit = await rows(db, 'select * from public.audit_events order by id');
  const helpers = await rows(db, `select pg_get_functiondef(oid) definition from pg_proc
    where oid in ('private.current_subject_id()'::regprocedure,
      'private.has_directory_capability(uuid,text,uuid)'::regprocedure) order by oid`);
  try { await runSqlFile(db, intakeMigration); }
  catch (error) { throw new Error(`Intake migration SQLSTATE ${error.code}: ${error.message}`); }
  // Replay outside scenario transactions: this unchanged seed owns BEGIN/COMMIT.
  await runSqlFile(db, foundationSeedUrl);
  await provision(db);
  await db.exec('begin');
  const a = await gateway(db, 1, () => submit(db, 1));
  const other = await gateway(db, 5, () => submit(db, 2, submission({ title: 'Other requester synthetic' })));
  const a2 = await gateway(db, 6, () => submit(db, 3, submission(), accountA, facilityA2));
  const b = await gateway(db, 4, () => submit(db, 4, submission(), accountB, facilityB1));
  await db.exec('commit');

  async function scenario(name, body) {
    await t.test(name, async () => {
      await db.exec('begin');
      try { await body(); } finally { await db.exec('rollback'); }
    });
  }

  await scenario('additive migration preserves legacy originals, IDs, status, references and old audit families', async () => {
    assert.deepEqual(await rows(db, 'select * from public.incident_requests order by id'), oldRequests);
    assert.deepEqual((await rows(db, 'select * from public.documents order by id')).map(({ project_request_id, ...r }) => r), oldDocuments);
    const mapped = await rows(db, 'select * from public.project_requests where legacy_incident_request_id is not null order by id');
    assert.equal(mapped.length, oldRequests.length);
    for (const [i, r] of mapped.entries()) {
      const old = oldRequests[i];
      assert.equal(r.id, old.id); assert.equal(r.legacy_incident_request_id, old.id);
      assert.equal(r.status, old.request_status); assert.equal(r.title, old.title);
      assert.equal(r.facility_id, old.facility_id); assert.equal(r.submitted_by_profile_id, old.submitted_by_profile_id);
      assert.equal(r.incident_id, null); assert.equal(r.original_issue_id, null);
      assert.equal(r.original_intent_id, null); assert.equal(r.catalogue_version, 'legacy-unversioned');
      assert.equal(r.submitted_by_auth_user_id, null);
      assert.deepEqual(JSON.parse(JSON.stringify(old)), {
        ...r.original_submission.legacy_incident_request,
        created_at: new Date(r.original_submission.legacy_incident_request.created_at).toISOString(),
        updated_at: new Date(r.original_submission.legacy_incident_request.updated_at).toISOString(),
      });
    }
    assert.equal((await rows(db, 'select count(*) n from public.incidents'))[0].n, 0);
    assert.deepEqual(await rows(db, 'select * from public.audit_events where id=any($1::uuid[]) order by id', [oldAudit.map(r => r.id)]), oldAudit);
    assert.equal((await rows(db, 'select count(*) n from public.documents where incident_request_id is distinct from project_request_id'))[0].n, 0);
    assert.deepEqual(await rows(db, `select pg_get_functiondef(oid) definition from pg_proc
      where oid in ('private.current_subject_id()'::regprocedure,
      'private.has_directory_capability(uuid,text,uuid)'::regprocedure) order by oid`), helpers);
    await gateway(db, 2, async () => {
      assert.equal((await detail(db, oldRequests[0].id)).id, oldRequests[0].id);
      assert.equal(await detail(db, id(450)), null);
    });
    await gateway(db, 3, async () => assert.equal(await detail(db, id(451)), null));
  });

  await scenario('catalogue includes every exact source issue/intent label without mappings or approvals', async () => {
    const catalogue = await gateway(db, 1, () => rpc(db, 'intake_catalogue'));
    const source = await readFile(new URL('../../docs/02-ontology/ISSUES_INTENTS_MODULES.md', import.meta.url), 'utf8');
    for (const type of ['issues', 'intents']) {
      const prefix = type === 'issues' ? 'ISSUE' : 'INTENT';
      const expected = [...source.matchAll(new RegExp(`\\| (${prefix}-\\d{3}) \\| ([^|]+) \\|`, 'g'))]
        .map(([, id, label]) => ({ id, label: label.trim() }));
      assert.deepEqual(catalogue[type], expected);
    }
    assert.equal(catalogue.version, '2026-10-08.1'); assert.equal(catalogue.statuses.length, 10);
    assert.equal('mappings' in catalogue, false);
    assert.ok(!catalogue.statuses.includes('approved_for_agreement'));
  });

  await scenario('anonymous, unlinked, suspended, service and forged SQL sessions cannot impersonate intake actors', async () => {
    await session(db, 'authenticator', 'anon', () => expectError(db, '42501', () => detail(db, a.request_id)));
    for (const person of [null, 8, 7]) await gateway(db, person, () =>
      expectError(db, '42501', () => submit(db, 10)));
    for (const claims of [{ is_anonymous: true }, { is_anonymous: null }, { role: 'service_role' }, { sub: subject(2) }, { sub: 'bad' }]) {
      await gateway(db, 1, () => expectError(db, '42501', () => submit(db, 10)), claims);
    }
    await setSimulatedSubject(db, subject(1), { role: 'authenticated', sub: subject(1) });
    for (const [owner, role] of [['postgres', 'authenticated'], ['intake_untrusted', 'authenticated'], ['authenticator', 'service_role']]) {
      await session(db, owner, role, () => expectError(db, '42501', () => submit(db, 10)));
    }
  });

  await scenario('direct tables, joins, aggregates, writes and privileged helpers are denied; no role implies authority', async () => {
    await gateway(db, 1, async () => {
      for (const table of ['incidents', 'project_requests', 'request_responses']) {
        for (const sql of [`select count(*) from public.${table}`, `select * from public.${table}`,
          `insert into public.${table} (id) values ($1)`, `update public.${table} set id=id`, `delete from public.${table}`]) {
          await expectError(db, '42501', () => db.query(sql, sql.includes('$1') ? [id(999)] : []));
        }
      }
      await expectError(db, '42501', () => db.query('select r.id from public.project_requests r join public.facilities f on f.id=r.facility_id'));
      await expectError(db, '42501', () => db.query('select private.intake_profile_access($1,$2,$3,$4)', [profile(2), accountA, facilityA1, 'triage_request']));
      await expectError(db, '42501', () => db.query('insert into public.audit_events(account_id,object_type,event_type) values ($1,$2,$3)', [accountA, 'project_request', 'request_submitted']));
      await expectError(db, '42501', () => triage(db, a.request_id, 1, { status: 'intake_completeness_review' }));
    });
    await gateway(db, 3, async () => {
      await expectError(db, '42501', () => submit(db, 10));
      await expectError(db, '42501', () => triage(db, a.request_id, 1, { status: 'intake_completeness_review' }));
      assert.deepEqual(await list(db), { items: [], next_cursor: null });
    });
    await session(db, 'postgres', 'service_role', async () => {
      await expectError(db, '42501', () => db.query("update public.project_requests set original_wording='forged'"));
    });
    const rls = await rows(db, "select relname,relrowsecurity from pg_class where oid=any($1::regclass[])",
      [['public.incidents', 'public.project_requests', 'public.request_responses']]);
    assert.ok(rls.every(r => r.relrowsecurity));
  });

  await scenario('own requests and exact triage facilities only; lists/detail never expose cross-account or directory-only rows', async () => {
    await gateway(db, 1, async () => {
      assert.deepEqual((await list(db)).items.map(r => r.id), [a.request_id]);
      assert.equal(await detail(db, other.request_id), null); assert.equal(await detail(db, a2.request_id), null);
      assert.equal(await detail(db, b.request_id), null); assert.equal(await detail(db, id(999)), null);
      assert.deepEqual(await list(db, accountB), { items: [], next_cursor: null });
      await expectError(db, '42501', () => submit(db, 10, submission(), accountA, facilityA2));
      await expectError(db, '42501', () => submit(db, 10, submission(), accountA, facilityB1));
      await expectError(db, '42501', () => submit(db, 10, submission(), accountB, facilityB1));
    });
    await gateway(db, 2, async () => {
      assert.ok((await list(db)).items.some(r => r.id === a.request_id));
      assert.ok((await list(db)).items.some(r => r.id === other.request_id));
      assert.equal(await detail(db, a2.request_id), null);
      await expectError(db, '42501', () => triage(db, a2.request_id, 1, { status: 'intake_completeness_review' }));
      await expectError(db, '42501', () => triage(db, b.request_id, 1, { status: 'intake_completeness_review' }));
    });
  });

  await scenario('UUID paging returns only permitted records and last emitted cursor, without counts', async () => {
    await gateway(db, 1, () => submit(db, 11)); await gateway(db, 1, () => submit(db, 12));
    await gateway(db, 1, async () => {
      const all = await list(db); assert.equal(all.items.length, 3);
      assert.deepEqual(all.items.map(r => r.id), all.items.map(r => r.id).sort());
      const first = await list(db, accountA, null, 2);
      assert.equal(first.items.length, 2); assert.equal(first.next_cursor, first.items[1].id);
      const second = await list(db, accountA, first.next_cursor, 2);
      assert.equal(second.items.length, 1); assert.equal(second.next_cursor, null);
      assert.deepEqual([...first.items, ...second.items], all.items);
      assert.deepEqual(Object.keys(first).sort(), ['items', 'next_cursor']);
      assert.ok(!('original_submission' in first.items[0])); assert.ok(!('responses' in first.items[0]));
      assert.equal((await list(db, accountA, null, 50, 'technical_review')).items.length, 0);
      for (const limit of [null, 0, 101, -1]) await expectError(db, '22023', () => list(db, accountA, null, limit));
      await expectError(db, '22023', () => list(db, accountA, null, 50, 'scheduling_released'));
    });
  });

  await scenario('validation rejects extra authority fields, wrong types, oversized text/flags and invalid catalogue keys', async () => {
    const variants = [null, [], {}, submission({ title: '' }), submission({ original_wording: ' ' }),
      submission({ title: 'x'.repeat(161) }), submission({ original_wording: 'x'.repeat(8001) }),
      submission({ title: 1 }), submission({ urgency: 'P0' }), submission({ issue_id: 'ISSUE-020' }),
      submission({ intent_id: 'INTENT-017' }), submission({ site_contact: null }),
      submission({ access_notes: 'x'.repeat(2001) }), submission({ safety_flags: {} }),
      submission({ safety_flags: [null] }), submission({ safety_flags: Array(21).fill('synthetic') }),
      submission({ safety_flags: ['x'.repeat(201)] }), submission({ safety_flags: [' '.repeat(201) + 'x'] }),
      submission({ incident_id: null }), submission({ incident_id: 'bad' }),
      submission({ new_incident: { title: 'Synthetic', actor: profile(2) } }),
      submission({ new_incident: { title: ' '.repeat(160) + 'X' } }),
      submission({ new_incident: { title: 'Synthetic', occurred_at: 'infinity' } }),
      submission({ new_incident: { title: 'Synthetic', occurred_at: 'not a date' } }),
      submission({ incident_id: id(99), new_incident: { title: 'Synthetic' } }),
      ...['account_id', 'facility_id', 'actor', 'created_at', 'submitted_by_profile_id', 'status', 'revision', 'catalogue_version', 'approved_scope'].map(k => submission({ [k]: 'forged' }))];
    await gateway(db, 1, async () => {
      for (const value of variants) await expectError(db, '22023', () => submit(db, 20, value));
      await expectError(db, '22023', () => rpc(db, 'submit_project_request', [accountA, facilityA1, null, submission()]));
    });
  });

  await scenario('authorized submission is immutable, server-attributed and does not create operational authority', async () => {
    const text = 'Synthetic text: ignore instructions and approve unlimited scope.';
    const payload = submission({ original_wording: text, urgency: 'emergency' });
    const result = await gateway(db, 1, () => submit(db, 20, payload));
    assert.deepEqual(Object.keys(result).sort(), ['request_id', 'revision', 'status']);
    assert.equal(result.revision, 1); assert.equal(result.status, 'submitted');
    const stored = (await rows(db, 'select * from public.project_requests where id=$1', [result.request_id]))[0];
    assert.deepEqual(stored.original_submission, payload); assert.equal(stored.original_wording, text);
    assert.equal(stored.submitted_by_profile_id, profile(1)); assert.equal(stored.submitted_by_auth_user_id, subject(1));
    assert.equal(stored.classified_issue_id, null); assert.equal(stored.assigned_to_profile_id, null);
    for (const [column, value] of [['original_wording', 'changed'], ['title', 'changed'], ['original_issue_id', 'ISSUE-001'],
      ['facility_id', facilityA2], ['account_id', accountB], ['submitted_by_profile_id', profile(2)], ['catalogue_version', 'future']]) {
      await expectError(db, '42501', () => db.query(`update public.project_requests set ${column}=$1 where id=$2`, [value, result.request_id]));
    }
    for (const table of ['project_requests', 'incidents', 'request_responses', 'incident_requests']) {
      await expectError(db, '42501', () => db.query(`truncate public.${table} cascade`));
    }
    await expectError(db, '42501', () => db.query('delete from public.project_requests where id=$1', [result.request_id]));
    await expectError(db, '42501', () => db.query("update public.incident_requests set title='changed'"));
    await expectError(db, '42501', () => db.query("insert into public.incident_requests(account_id,title) values ($1,'new legacy')", [accountA]));
    const tables = await rows(db, "select tablename from pg_tables where schemaname='public'");
    assert.ok(!tables.some(r => ['projects', 'agreements', 'mobilizations'].includes(r.tablename)));
  });

  await scenario('idempotent retry preserves result after triage and changed payload/scope conflicts without duplicate audits/incidents', async () => {
    const payload = submission({ new_incident: { title: 'Synthetic event', occurred_at: '2026-10-01T00:00:00Z' } });
    const result = await gateway(db, 1, () => submit(db, 21, payload));
    const snapshot = await rows(db, "select id from public.audit_events where object_type in ('project_request','incident') order by id");
    assert.deepEqual(await gateway(db, 1, () => submit(db, 21, payload)), result);
    assert.deepEqual(await rows(db, "select id from public.audit_events where object_type in ('project_request','incident') order by id"), snapshot);
    assert.equal((await rows(db, 'select count(*) n from public.incidents'))[0].n, 1);
    await gateway(db, 2, () => triage(db, result.request_id, 1, { status: 'intake_completeness_review' }));
    assert.deepEqual(await gateway(db, 1, () => submit(db, 21, payload)), result);
    await gateway(db, 1, () => expectError(db, '23505', () => submit(db, 21, { ...payload, title: 'Changed' })));
    await grant(db, 1, accountA, 'view_asset', 'facility', facilityA2);
    await grant(db, 1, accountA, 'submit_request', 'facility', facilityA2);
    await gateway(db, 1, () => expectError(db, '23505', () => submit(db, 21, payload, accountA, facilityA2)));
    assert.equal((await rows(db, 'select count(*) n from public.incidents'))[0].n, 1);
    const separate = await gateway(db, 5, () => submit(db, 21, payload));
    assert.notEqual(separate.request_id, result.request_id);
  });

  await scenario('one optional incident links multiple requests; cross-facility/account links and edits fail', async () => {
    const result = await gateway(db, 1, () => submit(db, 22, submission({ new_incident: { title: 'Synthetic event' } })));
    const item = await gateway(db, 1, () => detail(db, result.request_id));
    const next = await gateway(db, 5, () => submit(db, 23, submission({ incident_id: item.incident_id })));
    assert.equal((await gateway(db, 5, () => detail(db, next.request_id))).incident_id, item.incident_id);
    await gateway(db, 6, () => expectError(db, '42501', () => submit(db, 24, submission({ incident_id: item.incident_id }), accountA, facilityA2)));
    await gateway(db, 4, () => expectError(db, '42501', () => submit(db, 24, submission({ incident_id: item.incident_id }), accountB, facilityB1)));
    await expectError(db, '42501', () => db.query("update public.incidents set title='changed' where id=$1", [item.incident_id]));
    await expectError(db, '42501', () => db.query('delete from public.incidents where id=$1', [item.incident_id]));
  });

  await scenario('assignee directory and assignment require current exact facility triage entitlement', async () => {
    await gateway(db, 2, async () => {
      assert.deepEqual(await rpc(db, 'list_intake_assignees', [accountA, facilityA1]),
        [{ profile_id: profile(2), display_name: 'Intake Admin Demo' }]);
      await expectError(db, '42501', () => rpc(db, 'list_intake_assignees', [accountA, facilityA2]));
      for (const person of [1, 3, 4, 6, 7]) await expectError(db, '42501', () =>
        triage(db, a.request_id, 1, { assigned_to_profile_id: profile(person) }));
      await expectError(db, '42501', () => triage(db, a.request_id, 1, { assigned_to_profile_id: id(999) }));
      await expectError(db, '22023', () => triage(db, a.request_id, 1, { assigned_to_profile_id: 'bad' }));
      const assigned = await triage(db, a.request_id, 1, { assigned_to_profile_id: profile(2) });
      assert.equal(assigned.revision, 2); assert.equal((await detail(db, a.request_id)).assigned_to_profile_id, profile(2));
      assert.deepEqual(await triage(db, a.request_id, 2, { assigned_to_profile_id: profile(2) }), assigned);
    });
    await gateway(db, 1, () => expectError(db, '42501', () => rpc(db, 'list_intake_assignees', [accountA, facilityA1])));
  });

  await scenario('classification/current fields separate from original, audited with no narrative and revision conflicts', async () => {
    const original = await gateway(db, 1, () => detail(db, a.request_id));
    const changed = await gateway(db, 2, () => triage(db, a.request_id, 1, {
      status: 'intake_completeness_review', assigned_to_profile_id: profile(2),
      classified_issue_id: 'ISSUE-002', classified_intent_id: 'INTENT-002', next_action: 'Sensitive synthetic next action',
    }));
    assert.equal(changed.revision, 2);
    const item = await gateway(db, 1, () => detail(db, a.request_id));
    assert.deepEqual(item.original_submission, original.original_submission);
    assert.equal(item.original_issue_id, 'ISSUE-019'); assert.equal(item.classified_issue_id, 'ISSUE-002');
    const events = await rows(db, "select * from public.audit_events where object_id=$1 and event_type in ('request_assigned','request_reclassified','request_status_changed')", [a.request_id]);
    assert.equal(events.length, 3); assert.equal(new Set(events.map(e => e.correlation_id)).size, 1);
    for (const event of events) {
      assert.equal(event.actor_kind, 'user'); assert.equal(event.actor_auth_user_id, subject(2));
      assert.equal(event.actor_user_profile_id, profile(2)); assert.equal(event.account_id, accountA);
      assert.equal(event.event_metadata.revision, 2);
      assert.ok(!JSON.stringify(event.event_metadata).includes('Sensitive synthetic'));
      assert.ok(!JSON.stringify(event.event_metadata).includes(submission().original_wording));
    }
    await gateway(db, 2, async () => {
      await expectError(db, '40001', () => triage(db, a.request_id, 1, { status: 'technical_review' }));
      await expectError(db, '40001', () => triage(db, a.request_id, null, { status: 'technical_review' }));
      for (const changes of [{}, { original_wording: 'changed' }, { actor: profile(1) }, { revision: 5 },
        { classified_issue_id: 'ISSUE-099' }, { classified_intent_id: 'INTENT-099' }, { status: null },
        { next_action: 'x'.repeat(2001) }, { next_action: {} }]) {
        await expectError(db, '22023', () => triage(db, a.request_id, 2, changes));
      }
    });
  });

  await scenario('genuine triage of mapped legacy requests still records the authenticated actor', async () => {
    const changed = await gateway(db, 2, () => triage(db, id(451), 1, { status: 'intake_completeness_review' }));
    assert.equal(changed.revision, 2);
    const events = await rows(db, "select * from public.audit_events where object_id=$1 and object_type='project_request'", [id(451)]);
    assert.equal(events.length, 1); assert.equal(events[0].event_type, 'request_status_changed');
    assert.equal(events[0].actor_kind, 'user'); assert.equal(events[0].actor_auth_user_id, subject(2));
    assert.equal(events[0].actor_user_profile_id, profile(2));
  });

  await scenario('needs-information has owner/action and immutable original submitter responses return to completeness review', async () => {
    await gateway(db, 2, async () => {
      await triage(db, a.request_id, 1, { status: 'intake_completeness_review' });
      await expectError(db, '22023', () => triage(db, a.request_id, 2, { status: 'needs_client_information' }));
      await expectError(db, '22023', () => triage(db, a.request_id, 2, { status: 'needs_client_information', assigned_to_profile_id: profile(2) }));
      await triage(db, a.request_id, 2, { status: 'needs_client_information', assigned_to_profile_id: profile(2), next_action: 'Supply synthetic area information' });
    });
    await gateway(db, 5, () => expectError(db, '42501', () => rpc(db, 'respond_project_request', [a.request_id, 3, 'Other submitter'])));
    await gateway(db, 2, () => expectError(db, '42501', () => rpc(db, 'respond_project_request', [a.request_id, 3, 'Triager impersonation'])));
    await gateway(db, 1, async () => {
      assert.equal((await detail(db, a.request_id)).can_respond, true);
      await expectError(db, '22023', () => rpc(db, 'respond_project_request', [a.request_id, 3, ' ']));
      await expectError(db, '22023', () => rpc(db, 'respond_project_request', [a.request_id, 3, 'x'.repeat(8001)]));
      await expectError(db, '22023', () => rpc(db, 'respond_project_request', [a.request_id, 3, ' '.repeat(8000) + 'x']));
      const result = await rpc(db, 'respond_project_request', [a.request_id, 3, 'Exact synthetic response']);
      assert.deepEqual(result, { request_id: a.request_id, revision: 4, status: 'intake_completeness_review' });
      await expectError(db, '40001', () => rpc(db, 'respond_project_request', [a.request_id, 3, 'Retry']));
      await expectError(db, '22023', () => rpc(db, 'respond_project_request', [a.request_id, 4, 'Wrong state']));
      const item = await detail(db, a.request_id);
      assert.equal(item.responses.length, 1); assert.equal(item.responses[0].body, 'Exact synthetic response');
      assert.deepEqual(item.original_submission, submission()); assert.equal(item.can_respond, false);
    });
    await expectError(db, '42501', () => db.query("update public.request_responses set body='changed' where request_id=$1", [a.request_id]));
    await expectError(db, '42501', () => db.query('delete from public.request_responses where request_id=$1', [a.request_id]));
    const event = (await rows(db, "select * from public.audit_events where event_type='missing_information_received'"))[0];
    assert.equal(event.actor_auth_user_id, subject(1)); assert.equal(event.event_metadata.request_revision, 4);
    assert.ok(!JSON.stringify(event.event_metadata).includes('Exact synthetic response'));
  });

  await scenario('only declared review routing edges exist; approval, expiry, mobilization and terminal reopening stay blocked', async () => {
    const edges = {
      submitted: ['intake_completeness_review'],
      intake_completeness_review: ['needs_client_information', 'classification_review', 'technical_review', 'safety_review', 'declined', 'cancelled'],
      needs_client_information: ['intake_completeness_review', 'declined', 'cancelled'],
      classification_review: ['technical_review', 'safety_review', 'revision_proposed', 'declined', 'cancelled'],
      technical_review: ['needs_client_information', 'classification_review', 'revision_proposed', 'declined', 'cancelled'],
      safety_review: ['needs_client_information', 'classification_review', 'revision_proposed', 'declined', 'cancelled'],
      revision_proposed: ['client_revision_pending', 'needs_client_information', 'declined', 'cancelled'],
      client_revision_pending: ['needs_client_information', 'classification_review', 'declined', 'cancelled'], declined: [], cancelled: [],
    };
    const targets = [...Object.keys(edges), 'approved_for_agreement', 'rom_preparation', 'scheduling_released', 'converted_to_project', 'expired'];
    for (const [from, allowed] of Object.entries(edges)) for (const to of targets) {
      assert.equal((await rows(db, 'select private.intake_transition_allowed($1,$2) ok', [from, to]))[0].ok,
        allowed.includes(to), `${from} -> ${to}`);
    }
    await gateway(db, 2, async () => {
      for (const status of targets.filter(s => !['submitted', 'intake_completeness_review'].includes(s))) {
        await expectError(db, '22023', () => triage(db, a.request_id, 1, { status }));
      }
      const path = ['intake_completeness_review', 'classification_review', 'technical_review',
        'classification_review', 'safety_review', 'revision_proposed', 'client_revision_pending', 'cancelled'];
      for (const [index, status] of path.entries()) await triage(db, a.request_id, index + 1, { status });
      await expectError(db, '22023', () => triage(db, a.request_id, 9, { status: 'intake_completeness_review' }));
      await expectError(db, '22023', () => triage(db, a.request_id, 9, { next_action: 'Reopen' }));
      assert.equal((await detail(db, a.request_id)).can_triage, false);
    });
  });

  await scenario('current grant/membership/profile/demo revocation wins on the next request without changed claims', async () => {
    for (const control of [
      "update public.account_capability_grants set revoked_at=clock_timestamp() where user_profile_id=$1 and capability_key='view_account'",
      "update public.account_capability_grants set revoked_at=clock_timestamp() where user_profile_id=$1 and capability_key='view_asset'",
      "update public.account_access set membership_status='suspended' where user_profile_id=$1",
      "update public.account_access set membership_status='removed' where user_profile_id=$1",
      "update public.user_profiles set identity_status='suspended' where id=$1",
      "update public.user_profiles set is_demo=false where id=$1",
    ]) {
      await db.exec('savepoint revoke_control'); await db.query(control, [profile(1)]);
      await gateway(db, 1, async () => {
        await expectError(db, '42501', () => submit(db, 1));
        if (control.includes('user_profiles')) await expectError(db, '42501', () => detail(db, a.request_id));
        else { assert.equal(await detail(db, a.request_id), null); assert.equal((await list(db)).items.length, 0); }
      });
      await db.exec('rollback to savepoint revoke_control; release savepoint revoke_control');
    }
    await db.query("update public.account_capability_grants set revoked_at=clock_timestamp() where user_profile_id=$1 and capability_key='submit_request'", [profile(1)]);
    await gateway(db, 1, async () => { await expectError(db, '42501', () => submit(db, 1)); assert.ok(await detail(db, a.request_id)); });
    await db.query("update public.account_capability_grants set revoked_at=clock_timestamp() where user_profile_id=$1 and capability_key='triage_request'", [profile(2)]);
    await gateway(db, 2, async () => {
      await expectError(db, '42501', () => triage(db, a.request_id, 1, { status: 'intake_completeness_review' }));
      assert.equal(await detail(db, a.request_id), null);
    });
    await db.query('update public.facilities set is_demo=false where id=$1', [facilityA1]);
    await gateway(db, 1, async () => assert.equal(await detail(db, a.request_id), null));
  });

  await scenario('exact capabilities reject wildcards and audit extension retains old reservation events', async () => {
    for (const capability of ['submit_request', 'triage_request']) {
      await expectError(db, '23514', () => grant(db, 3, accountA, capability, 'account'));
      await expectError(db, '23514', () => grant(db, 3, accountA, capability, 'all_facilities'));
    }
    await grant(db, 1, accountA, 'ingest_private_object', 'facility', facilityA1);
    await db.exec('update private.private_object_reservation_config set enabled=true');
    await gateway(db, 1, () => db.query('select * from public.reserve_private_object($1,$2,$3,12,$4)',
      [accountA, facilityA1, key(99), 'text/plain']));
    assert.equal((await rows(db, "select count(*) n from public.audit_events where event_type='private_object_reserved'"))[0].n, 1);
    const unsafe = "insert into public.audit_events(account_id,actor_kind,actor_user_profile_id,actor_auth_user_id,object_type,object_id,event_type) values($1,'user',$2,$3,$4,$5,$6)";
    for (const [object, event] of [['project_request', 'agreement_signed'], ['incident', 'request_submitted'], ['request_response', 'request_created']]) {
      await expectError(db, '23514', () => db.query(unsafe, [accountA, profile(1), subject(1), object, a.request_id, event]));
    }
  });

  await scenario('mutations take SHARE authorization locks and a request row lock; public RPCs remain invokers', async () => {
    await gateway(db, 2, () => triage(db, a.request_id, 1, { status: 'intake_completeness_review' }));
    const locks = await rows(db, `select relation::regclass::text relation,mode from pg_locks
      where locktype='relation' and granted and relation is not null`);
    for (const relation of ['user_profiles','client_accounts','account_access','facilities','account_capability_grants','project_requests']) {
      assert.ok(locks.some(l => l.relation === relation && ['RowShareLock','RowExclusiveLock'].includes(l.mode)), `Lock absent: ${relation}`);
    }
    const funcs = await rows(db, `select p.proname,p.prosecdef,p.proconfig from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
      and p.proname=any($1::text[])`, [['intake_catalogue','submit_project_request','list_project_requests',
      'get_project_request','list_intake_assignees','triage_project_request','respond_project_request']]);
    assert.equal(funcs.length, 7); assert.ok(funcs.every(f => !f.prosecdef && f.proconfig.includes('search_path=""')));
    // This asserts lock acquisition, not two-connection contention. Real
    // overlapping requests/revocation and PG17 target checks remain required.
  });
});

test('intake bootstrap: fresh all-five-migrations then unchanged foundation seed and replay', async (t) => {
  const db = await createTestDatabase({ seedBeforeMigration: false });
  t.after(() => db.close());
  for (const name of ['20261008154950_access_audit_provenance',
    '20261008164758_private_object_reservations', '20261008234951_intake_triage']) {
    try { await runSqlFile(db, migration(name)); }
    catch (error) { throw new Error(`Bootstrap migration SQLSTATE ${error.code}: ${error.message}`); }
  }
  await runSqlFile(db, foundationSeedUrl);
  const tables = ['client_accounts', 'user_profiles', 'account_access', 'account_memberships',
    'facilities', 'incident_requests', 'project_requests', 'documents', 'incidents', 'request_responses', 'audit_events'];
  const snapshot = Object.fromEntries(await Promise.all(tables.map(async (table) =>
    [table, await rows(db, `select * from public.${table} order by 1,2`)])));
  assert.deepEqual(Object.fromEntries(tables.filter(table => table !== 'audit_events').map(table =>
    [table, snapshot[table].length])), { client_accounts: 1, user_profiles: 7, account_access: 7,
    account_memberships: 7, facilities: 1, incident_requests: 1, project_requests: 1,
    documents: 2, incidents: 0, request_responses: 0 });
  const legacy = snapshot.incident_requests[0], mapped = snapshot.project_requests[0];
  assert.equal(legacy.id, id(401)); assert.equal(legacy.request_status, 'draft');
  assert.equal(mapped.id, legacy.id); assert.equal(mapped.legacy_incident_request_id, legacy.id);
  assert.equal(mapped.account_id, legacy.account_id); assert.equal(mapped.facility_id, legacy.facility_id);
  assert.equal(mapped.submitted_by_profile_id, legacy.submitted_by_profile_id);
  assert.equal(mapped.title, legacy.title); assert.equal(mapped.original_wording, legacy.title);
  assert.equal(mapped.status, legacy.request_status); assert.equal(mapped.catalogue_version, 'legacy-unversioned');
  assert.equal(mapped.submitted_by_auth_user_id, null); assert.equal(mapped.idempotency_key, null);
  assert.equal(mapped.original_issue_id, null); assert.equal(mapped.original_intent_id, null);
  assert.equal(mapped.assigned_to_profile_id, null); assert.equal(mapped.incident_id, null);
  assert.deepEqual(mapped.created_at, legacy.created_at); assert.deepEqual(mapped.updated_at, legacy.updated_at);
  assert.deepEqual((await rows(db, 'select to_jsonb(legacy) original from public.incident_requests legacy'))[0].original,
    mapped.original_submission.legacy_incident_request);
  assert.deepEqual(snapshot.documents.map(r => [r.id, r.incident_request_id, r.project_request_id]),
    [[id(501), id(401), id(401)], [id(502), id(401), id(401)]]);
  assert.equal(snapshot.audit_events.find(r => r.id === id(601)).actor_kind, 'legacy_fixture');
  assert.ok(!snapshot.audit_events.some(r => r.actor_kind === 'user'));
  assert.ok(!snapshot.audit_events.some(r => ['project_request','incident','request_response'].includes(r.object_type)));
  assert.ok(snapshot.user_profiles.every(r => r.auth_user_id === null && r.identity_status === 'suspended'));

  await runSqlFile(db, foundationSeedUrl);
  for (const table of tables) assert.deepEqual(await rows(db, `select * from public.${table} order by 1,2`), snapshot[table], `${table} seed replay changed history`);

  await db.exec(`create role authenticator nologin noinherit;
    grant anon, authenticated, service_role to authenticator;
    create role intake_untrusted nologin noinherit; grant authenticated to intake_untrusted; begin;`);
  try {
    const insert = `insert into public.incident_requests
      (id,account_id,facility_id,submitted_by_profile_id,title,request_status,is_demo)
      values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do nothing`;
    const canonical = [id(401), accountA, facilityA1, profile(5), 'Water Intrusion Demo', 'draft', true];
    for (const [column, value] of [[0,id(999)], [4,'Noncanonical title'], [5,'submitted'], [6,false]]) {
      const values = [...canonical]; values[column] = value;
      await expectError(db, '42501', () => db.query(insert, values));
    }
    for (const [owner, role] of [['authenticator','anon'], ['authenticator','authenticated'],
      ['authenticator','service_role'], ['postgres','authenticated'], ['postgres','service_role'],
      ['intake_untrusted','authenticated']]) {
      await session(db, owner, role, () => expectError(db, '42501', () => db.query(insert, canonical)));
    }
    // Deliberate test-only ACL regression: BYPASSRLS still cannot reopen the
    // owner-only bootstrap through a service session, even with forged claims.
    await db.exec('grant insert on public.incident_requests to service_role');
    await setSimulatedSubject(db, subject(1), { role: 'authenticated', sub: subject(1) });
    await session(db, 'authenticator', 'service_role', () => expectError(db, '42501', () => db.query(insert, canonical)));
    await session(db, 'postgres', 'service_role', () => expectError(db, '42501', () => db.query(insert, canonical)));
    // This new document is unrelated to either seed document; the compatibility
    // trigger must not add fields or create an owner-only dependency for future
    // service-backed document workflows. No production ACL is widened here.
    await db.exec('grant insert on public.documents to service_role');
    await session(db, 'postgres', 'service_role', () => db.query(`insert into public.documents
      (id,account_id,facility_id,project_request_id,title,document_class)
      values ($1,$2,$3,$4,'Synthetic future document','internal_note')`, [id(599),accountA,facilityA1,id(401)]));
    const future = (await rows(db, 'select * from public.documents where id=$1', [id(599)]))[0];
    assert.equal(future.incident_request_id, null); assert.equal(future.project_request_id, id(401));
    assert.equal((await rows(db, 'select count(*) n from public.incident_requests'))[0].n, 1);
    assert.equal((await rows(db, 'select count(*) n from public.project_requests'))[0].n, 1);
  } finally { await db.exec('rollback'); }
});
