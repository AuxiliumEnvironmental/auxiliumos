import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { cleanupFixtures, configuration, preflightSchema, recordCreatedAuth } from './fixture-cleanup.mjs';

// PREPARED, NOT EXECUTED API EVIDENCE. Run only after target/migration review and
// secure AUXILIUMOS_TEST_{URL,PUBLISHABLE_KEY,SERVICE_ROLE_KEY} configuration.
// The existing configuration guard permits only auxiliumos-dev or documented
// loopback Supabase. This harness does not apply migrations or discover keys.
// All Auth identities and model rows are generated synthetic fixtures. Existing
// reviewed cleanup disables exact access, preserves all application/audit rows,
// and deletes only positively owned Auth identities after safety readback.
// The same original Auth-issued token is reused across each revocation test.

function client(config, key, token) {
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(token ? { accessToken: async () => token } : {}),
    global: { fetch: (input, init) => fetch(input, {
      ...init, redirect: 'error', signal: AbortSignal.timeout(15_000),
    }) },
  });
}
async function response(label, operation) {
  try { return await operation; }
  catch { throw new Error(`${label}: request failed; provider details omitted.`); }
}
function success(result, label) {
  assert.ok(!result.error, `${label}: API failed; provider details omitted.`);
  return result.data;
}
async function ok(label, operation) { return success(await response(label, operation), label); }
async function denied(label, operation, code = '42501') {
  const result = await response(label, operation);
  assert.ok(result.error?.code === code, `${label}: expected SQLSTATE ${code}, not a transport/session/schema error.`);
}
const submission = (extra = {}) => ({
  title: 'Intake API synthetic request', original_wording: 'Exact synthetic original, no real people or PHI.',
  issue_id: 'ISSUE-019', intent_id: 'INTENT-016', urgency: 'routine',
  affected_area: 'Synthetic area', site_contact: 'Synthetic contact role', access_notes: '',
  safety_flags: ['Synthetic unknown condition'], payer_note: '', signer_note: '', ...extra,
});

function fixtureManifest() {
  const f = { runId: randomUUID(), createdAuth: [], profileIdByAuthId: new Map(), auditProbe: randomUUID(),
    auditProbeAttempted: false, idsByTable: { client_accounts: [], facilities: [], user_profiles: [],
      account_memberships: [], account_capability_grants: [] }, accessPairs: [], grantTargets: [] };
  for (const name of ['accountA', 'accountB']) { f[name] = randomUUID(); f.idsByTable.client_accounts.push(f[name]); }
  for (const name of ['facilityA1', 'facilityA2', 'facilityB1']) { f[name] = randomUUID(); f.idsByTable.facilities.push(f[name]); }
  for (const name of ['profileA', 'profileB', 'profileOutside']) { f[name] = randomUUID(); f.idsByTable.user_profiles.push(f[name]); }
  f.accessPairs = [[f.accountA, f.profileA], [f.accountA, f.profileB],
    [f.accountA, f.profileOutside], [f.accountB, f.profileOutside]];
  f.grants = [];
  function grant(name, account, profile, capability, scope, facility = null) {
    const id = randomUUID(); f[name] = id; f.idsByTable.account_capability_grants.push(id);
    f.grantTargets.push([id, account, profile]);
    f.grants.push({ id, account_id: account, user_profile_id: profile, capability_key: capability,
      scope_kind: scope, facility_id: facility, is_demo: true });
  }
  grant('aAccount', f.accountA, f.profileA, 'view_account', 'account');
  grant('aFacility', f.accountA, f.profileA, 'view_asset', 'facility', f.facilityA1);
  grant('aSubmit', f.accountA, f.profileA, 'submit_request', 'facility', f.facilityA1);
  grant('bAccount', f.accountA, f.profileB, 'view_account', 'account');
  grant('bFacilities', f.accountA, f.profileB, 'view_asset', 'all_facilities');
  grant('bTriage', f.accountA, f.profileB, 'triage_request', 'facility', f.facilityA1);
  grant('bSubmit', f.accountA, f.profileB, 'submit_request', 'facility', f.facilityA1);
  grant('outsideA', f.accountA, f.profileOutside, 'view_account', 'account');
  grant('outsideAAssets', f.accountA, f.profileOutside, 'view_asset', 'all_facilities');
  grant('outsideB', f.accountB, f.profileOutside, 'view_account', 'account');
  grant('outsideBAsset', f.accountB, f.profileOutside, 'view_asset', 'facility', f.facilityB1);
  grant('outsideSubmit', f.accountB, f.profileOutside, 'submit_request', 'facility', f.facilityB1);
  grant('outsideTriage', f.accountB, f.profileOutside, 'triage_request', 'facility', f.facilityB1);
  f.members = [f.profileA, f.profileOutside].map(profile => {
    const id = randomUUID(); f.idsByTable.account_memberships.push(id);
    return { id, account_id: f.accountA, user_profile_id: profile, role_key: 'system_admin', is_demo: true };
  });
  return f;
}

test('INTAKE-001A genuine synthetic Supabase Auth/API coverage (requires approved secure runtime)', async (t) => {
  // Throws before any request if configuration is unavailable; never skip or
  // substitute hand-set SQL claims for genuine Auth/API evidence.
  const config = configuration();
  const admin = client(config, config.serviceRoleKey);
  const anonymous = client(config, config.publishableKey);
  await preflightSchema(admin);
  for (const [table, columns] of Object.entries({
    incidents: 'id,account_id,facility_id,created_by_profile_id,created_by_auth_user_id,is_demo',
    project_requests: 'id,account_id,facility_id,legacy_incident_request_id,original_submission,revision,status,submitted_by_profile_id,submitted_by_auth_user_id,idempotency_key,is_demo',
    request_responses: 'id,request_id,account_id,facility_id,body,request_revision,submitted_by_profile_id,is_demo',
  })) {
    const result = await ok(`Read-only intake preflight ${table}`, admin.from(table).select(columns).limit(0));
    assert.ok(Array.isArray(result) && result.length === 0, 'Unexpected preflight result.');
  }
  await denied('Read-only anonymous RPC preflight', anonymous.rpc('intake_catalogue'));
  const f = fixtureManifest();
  t.after(async () => cleanupFixtures(admin, f, (message) => t.diagnostic(message)));
  t.diagnostic(`Intake synthetic run ${f.runId}; target ${config.url}; application/audit history will be retained.`);

  async function createSubject(label, profileId) {
    const email = `api-${f.runId}-${label}@identity-directory.invalid`;
    const password = `${randomBytes(36).toString('base64url')}aA1!`;
    const created = await ok('Create owned synthetic Auth user', admin.auth.admin.createUser({ email, password, email_confirm: true }));
    recordCreatedAuth(f, created.user, label);
    if (profileId) f.profileIdByAuthId.set(created.user.id, profileId);
    const login = client(config, config.publishableKey);
    const signedIn = await ok('Password sign-in synthetic Auth user', login.auth.signInWithPassword({ email, password }));
    assert.ok(signedIn.user?.id === created.user.id && typeof signedIn.session?.access_token === 'string', 'Authentic sign-in identity mismatch.');
    const token = signedIn.session.access_token;
    const verified = await ok('Verify original Auth-issued token', login.auth.getUser(token));
    assert.equal(verified.user.id, created.user.id);
    return { authId: created.user.id, login, token, data: client(config, config.publishableKey, token) };
  }
  const a = await createSubject('a', f.profileA);
  const b = await createSubject('b', f.profileB);
  const outside = await createSubject('role-only', f.profileOutside);
  const unlinked = await createSubject('unlinked');
  await ok('Create synthetic intake accounts', admin.from('client_accounts').insert([
    { id: f.accountA, display_name: `Intake ${f.runId} A`, is_demo: true },
    { id: f.accountB, display_name: `Intake ${f.runId} B`, is_demo: true },
  ]));
  await ok('Create synthetic intake facilities', admin.from('facilities').insert([
    { id: f.facilityA1, account_id: f.accountA, display_name: 'Synthetic A1', is_demo: true },
    { id: f.facilityA2, account_id: f.accountA, display_name: 'Synthetic A2', is_demo: true },
    { id: f.facilityB1, account_id: f.accountB, display_name: 'Synthetic B1', is_demo: true },
  ]));
  await ok('Create linked suspended profiles', admin.from('user_profiles').insert([
    [f.profileA, a.authId, 'Synthetic requester'], [f.profileB, b.authId, 'Synthetic triager'],
    [f.profileOutside, outside.authId, 'Synthetic other-account requester'],
  ].map(([id, auth_user_id, display_name]) => ({ id, auth_user_id, display_name, identity_status: 'suspended', is_demo: true }))));
  await ok('Create active synthetic memberships', admin.from('account_access').insert(f.accessPairs.map(([account_id, user_profile_id]) =>
    ({ account_id, user_profile_id, membership_status: 'active', is_demo: true }))));
  await ok('Create role-only authority negative fixture', admin.from('account_memberships').insert(f.members));
  await ok('Create exact intake capabilities', admin.from('account_capability_grants').insert(f.grants));
  await denied('Suspended profile cannot use catalogue', a.data.rpc('intake_catalogue'));
  await ok('Activate exact synthetic profiles', admin.from('user_profiles').update({ identity_status: 'active' }).in('id', f.idsByTable.user_profiles));

  const params = (key, value = submission(), account = f.accountA, facility = f.facilityA1) =>
    ({ p_account_id: account, p_facility_id: facility, p_idempotency_key: key, p_submission: value });
  const get = (subject, request) => subject.data.rpc('get_project_request', { p_request_id: request });
  const triage = (request, revision, changes) => b.data.rpc('triage_project_request',
    { p_request_id: request, p_expected_revision: revision, p_changes: changes });
  const submittedKey = randomUUID();
  const submittedPayload = submission({ new_incident: { title: 'Synthetic shared event' } });
  let submitted;
  async function scenario(name, body) {
    let failed = false;
    await t.test(name, async () => { try { await body(); } catch (error) { failed = true; throw error; } });
    assert.ok(!failed, 'Intake API checks stopped after first failed scenario; safe fixture cleanup will run.');
  }

  await scenario('actual anonymous/unlinked/service and cross-scope calls are denied', async () => {
    for (const caller of [anonymous, unlinked.data, admin]) {
      await denied('Unauthorized submission', caller.rpc('submit_project_request', params(randomUUID())));
    }
    await denied('Unassigned facility submission', a.data.rpc('submit_project_request', params(randomUUID(), submission(), f.accountA, f.facilityA2)));
    await denied('Cross-account submission', a.data.rpc('submit_project_request', params(randomUUID(), submission(), f.accountB, f.facilityB1)));
    await denied('Cross-account facility splice', a.data.rpc('submit_project_request', params(randomUUID(), submission(), f.accountA, f.facilityB1)));
    await denied('Legacy system_admin alone lacks intake', outside.data.rpc('submit_project_request', params(randomUUID())));
    const catalogue = await ok('Catalogue', a.data.rpc('intake_catalogue'));
    assert.equal(catalogue.issues.length, 19); assert.equal(catalogue.intents.length, 16);
    assert.equal(catalogue.version, '2026-10-08.1');
  });
  await scenario('overlapping actual HTTP retries create one request/incident and immutable original result', async () => {
    const pair = await Promise.all([a.data.rpc('submit_project_request', params(submittedKey, submittedPayload)),
      a.data.rpc('submit_project_request', params(submittedKey, submittedPayload))]);
    submitted = success(pair[0], 'First concurrent submit');
    assert.deepEqual(success(pair[1], 'Second concurrent submit'), submitted);
    assert.equal(submitted.status, 'submitted'); assert.equal(submitted.revision, 1);
    const stored = await ok('Read exact request', admin.from('project_requests').select('*').eq('id', submitted.request_id).single());
    assert.deepEqual(stored.original_submission, submittedPayload);
    assert.equal(stored.submitted_by_auth_user_id, a.authId); assert.equal(stored.submitted_by_profile_id, f.profileA);
    const incidents = await ok('Read run incidents', admin.from('incidents').select('id').eq('account_id', f.accountA));
    assert.equal(incidents.length, 1);
    await denied('Changed idempotency payload', a.data.rpc('submit_project_request', params(submittedKey, submission())), '23505');
    await denied('Forged actor field', a.data.rpc('submit_project_request', params(randomUUID(), submission({ actor: f.profileB }))), '22023');
  });
  await scenario('authorized reads are scoped and direct mutation cannot replace original history', async () => {
    assert.equal((await ok('Own detail', get(a, submitted.request_id))).can_triage, false);
    assert.equal((await ok('Triager detail', get(b, submitted.request_id))).can_triage, true);
    assert.equal(await ok('Outside detail', get(outside, submitted.request_id)), null);
    const list = await ok('Requester list', a.data.rpc('list_project_requests', { p_account_id: f.accountA, p_limit: 1 }));
    assert.deepEqual(list.items.map(r => r.id), [submitted.request_id]); assert.equal(list.next_cursor, null);
    const cross = await ok('Cross-account filtered list', a.data.rpc('list_project_requests', { p_account_id: f.accountB }));
    assert.deepEqual(cross, { items: [], next_cursor: null });
    for (const table of ['incidents', 'project_requests', 'request_responses']) {
      await denied('Direct table count denied', a.data.from(table).select('id', { count: 'exact' }));
      await denied('Direct table insert denied', a.data.from(table).insert({ id: randomUUID() }));
    }
    await denied('Direct original wording update denied', a.data.from('project_requests').update({ original_wording: 'Forged' }).eq('id', submitted.request_id));
    await denied('Direct delete denied', a.data.from('project_requests').delete().eq('id', submitted.request_id));
    await denied('Service mutation RPC denied', admin.rpc('triage_project_request', { p_request_id: submitted.request_id, p_expected_revision: 1, p_changes: { status: 'intake_completeness_review' } }));
    const assignees = await ok('Scoped assignee list', b.data.rpc('list_intake_assignees', { p_account_id: f.accountA, p_facility_id: f.facilityA1 }));
    assert.deepEqual(assignees.map(r => r.profile_id), [f.profileB]);
    await denied('Directory all_facilities cannot triage A2', b.data.rpc('list_intake_assignees', { p_account_id: f.accountA, p_facility_id: f.facilityA2 }));
    await denied('Cross-account assignment denied', triage(submitted.request_id, 1, { assigned_to_profile_id: f.profileOutside }));
  });
  await scenario('competing expected revisions have exactly one winner; routing grants no human approval', async () => {
    await denied('Direct mobilization blocked', triage(submitted.request_id, 1, { status: 'scheduling_released' }), '22023');
    const pair = await Promise.all([
      triage(submitted.request_id, 1, { status: 'intake_completeness_review', assigned_to_profile_id: f.profileB, next_action: 'Synthetic action A' }),
      triage(submitted.request_id, 1, { status: 'intake_completeness_review', assigned_to_profile_id: f.profileB, next_action: 'Synthetic action B' }),
    ]);
    assert.equal(pair.filter(r => !r.error).length, 1); assert.equal(pair.filter(r => r.error?.code === '40001').length, 1);
    const winner = pair.find(r => !r.error).data; assert.equal(winner.revision, 2);
    assert.deepEqual(await ok('Original retry after revision', a.data.rpc('submit_project_request', params(submittedKey, submittedPayload))), submitted);
    await denied('Original wording immutable through triage', triage(submitted.request_id, 2, { original_wording: 'Changed' }), '22023');
    await ok('Classify and request information', triage(submitted.request_id, 2, {
      status: 'needs_client_information', classified_issue_id: 'ISSUE-002', classified_intent_id: 'INTENT-002', next_action: 'Supply synthetic area information',
    }));
    await denied('Triager cannot impersonate response', b.data.rpc('respond_project_request', { p_request_id: submitted.request_id, p_expected_revision: 3, p_response: 'Impersonation' }));
    const reply = await ok('Original submitter response', a.data.rpc('respond_project_request', {
      p_request_id: submitted.request_id, p_expected_revision: 3, p_response: 'Synthetic response retained verbatim',
    }));
    assert.equal(reply.status, 'intake_completeness_review'); assert.equal(reply.revision, 4);
    await denied('Response retry is stale', a.data.rpc('respond_project_request', { p_request_id: submitted.request_id, p_expected_revision: 3, p_response: 'Retry' }), '40001');
    const item = await ok('Original and responses', get(a, submitted.request_id));
    assert.deepEqual(item.original_submission, submittedPayload); assert.equal(item.original_issue_id, 'ISSUE-019');
    assert.equal(item.classified_issue_id, 'ISSUE-002'); assert.equal(item.responses.length, 1);
    assert.equal(item.responses[0].body, 'Synthetic response retained verbatim');
    await denied('Direct response rewrite denied', a.data.from('request_responses').update({ body: 'Changed' }).eq('request_id', submitted.request_id));
    await ok('Decline after review routing', triage(submitted.request_id, 4, { status: 'declined' }));
    await denied('Terminal reopen blocked', triage(submitted.request_id, 5, { status: 'intake_completeness_review' }), '22023');
  });
  await scenario('server audit is attributed, bounded and append-only; no narrative is copied', async () => {
    const events = await ok('Inspect exact request audit', admin.from('audit_events')
      .select('id,account_id,actor_kind,actor_user_profile_id,actor_auth_user_id,event_type,event_metadata,correlation_id')
      .eq('object_id', submitted.request_id));
    assert.ok(events.some(e => e.event_type === 'request_submitted'));
    assert.ok(events.some(e => e.event_type === 'request_reclassified'));
    assert.ok(events.every(e => e.account_id === f.accountA && e.actor_kind === 'user'
      && [a.authId, b.authId].includes(e.actor_auth_user_id)));
    assert.ok(!JSON.stringify(events).includes(submittedPayload.original_wording));
    assert.ok(!JSON.stringify(events).includes('Supply synthetic area information'));
    f.auditProbeAttempted = true;
    await denied('Forged audit rejected', a.data.from('audit_events').insert({ id: f.auditProbe,
      account_id: f.accountA, actor_kind: 'user', actor_user_profile_id: f.profileB,
      actor_auth_user_id: b.authId, object_type: 'project_request', object_id: submitted.request_id,
      event_type: 'request_submitted', occurred_at: '2000-01-01T00:00:00Z' }));
    await denied('Audit rewrite rejected', a.data.from('audit_events').update({ event_metadata: {} }).eq('object_id', submitted.request_id));
  });
  await scenario('revocation is immediate for original live token, including idempotent retries', async () => {
    async function updateExact(table, id, patch) {
      const changed = await ok('Exact fixture control update', admin.from(table).update(patch).eq('id', id).eq('is_demo', true).select('id'));
      assert.equal(changed.length, 1); assert.equal(changed[0].id, id);
    }
    async function originalTokenValid() {
      assert.equal((await ok('Original token still validated by Auth', a.login.auth.getUser(a.token))).user.id, a.authId);
    }
    await updateExact('account_capability_grants', f.aSubmit, { revoked_at: new Date().toISOString() });
    await originalTokenValid();
    await denied('Exact submit retry after revoked submit grant', a.data.rpc('submit_project_request', params(submittedKey, submittedPayload)));
    assert.ok(await ok('Own retained read with view grants', get(a, submitted.request_id)));
    await updateExact('account_capability_grants', f.aFacility, { revoked_at: new Date().toISOString() });
    await originalTokenValid(); assert.equal(await ok('Revoked facility read', get(a, submitted.request_id)), null);
    await updateExact('account_capability_grants', f.aFacility, { revoked_at: null });
    for (const membership_status of ['suspended', 'removed']) {
      const changed = await ok('Retire exact membership', admin.from('account_access').update({ membership_status })
        .eq('account_id', f.accountA).eq('user_profile_id', f.profileA).eq('is_demo', true).select('account_id,user_profile_id'));
      assert.equal(changed.length, 1); await originalTokenValid();
      assert.equal(await ok('Inactive membership read despite retained admin role', get(a, submitted.request_id)), null);
    }
    await updateExact('user_profiles', f.profileA, { identity_status: 'suspended' });
    await originalTokenValid(); await denied('Suspended profile read', get(a, submitted.request_id));
    await updateExact('account_capability_grants', f.bTriage, { revoked_at: new Date().toISOString() });
    assert.equal(await ok('Revoked triager visibility', get(b, submitted.request_id)), null);
    await denied('Revoked triage assignee directory', b.data.rpc('list_intake_assignees', { p_account_id: f.accountA, p_facility_id: f.facilityA1 }));
  });
});
