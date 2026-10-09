import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { cleanupFixtures, configuration, preflightSchema, recordCreatedAuth } from './fixture-cleanup.mjs';

// Actual Chromium + repository app + hosted Auth/Data API; no HTTP fixtures,
// manually set sessions, persistent browser profile, trace, HAR, screenshot,
// video or storage-state export. Secrets and synthetic credentials stay in the
// test process/ephemeral browser context, never in test artifacts or child env.
const UI_ORIGIN = 'http://127.0.0.1:4178';
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const safeFetch = (input, init) => fetch(input, {
  ...init, redirect: 'error', signal: AbortSignal.timeout(15_000), cache: 'no-store',
});
function client(config, key, token) {
  return createClient(config.url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(token ? { accessToken: async () => token } : {}), global: { fetch: safeFetch },
  });
}
async function ok(operation) {
  let result;
  try { result = await operation; } catch { throw new Error('Provider request failed; details omitted.'); }
  assert.ok(result && !result.error, 'Provider operation failed; details omitted.');
  return result.data;
}
function childEnvironment() {
  // Never inherit the privileged key, DEBUG/PWDEBUG, NODE_OPTIONS, npm hooks,
  // arbitrary VITE_* values or credential-bearing proxy URLs into either child.
  return Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'SystemRoot',
    'WINDIR', 'LD_LIBRARY_PATH', 'PLAYWRIGHT_BROWSERS_PATH']
    .filter(name => process.env[name] !== undefined).map(name => [name, process.env[name]]));
}
async function startApp(config) {
  const server = spawn(process.execPath, [fileURLToPath(new URL('../../node_modules/vite/bin/vite.js', import.meta.url)),
    '--config', 'web/vite.config.ts', '--host', '127.0.0.1', '--port', '4178', '--strictPort'], {
    cwd: ROOT, stdio: 'ignore', env: { ...childEnvironment(),
      VITE_SUPABASE_URL: config.url, VITE_SUPABASE_PUBLISHABLE_KEY: config.publishableKey },
  });
  let failed = false;
  server.on('error', () => { failed = true; });
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      assert.ok(!failed && server.exitCode === null, 'Private test app server did not start.');
      try {
        const response = await fetch(UI_ORIGIN, { redirect: 'error', signal: AbortSignal.timeout(500) });
        if (response.ok && (await response.text()).includes('/src/main.tsx')) return server;
      } catch { /* bounded startup polling, no service/test retries */ }
      await delay(200);
    }
    throw new Error('Private test app server startup timed out.');
  } catch (error) { await stopApp(server); throw error; }
}
async function stopApp(server) {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise(resolve => server.once('exit', resolve));
  server.kill('SIGTERM');
  await Promise.race([exited, delay(5_000)]);
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL');
    await Promise.race([exited, delay(5_000)]);
  }
  assert.ok(server.exitCode !== null || server.signalCode !== null, 'Owned app server shutdown was not verified.');
}

test('genuine development browser: Auth, scoped directory, intake, retained-JWT revocation and sign-out', { timeout: 240_000 }, async t => {
  const config = configuration();
  assert.ok(config.url === 'https://txofqxictwecgcnvezlb.supabase.co'
    && /^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey),
  'This genuine browser journey requires the approved hosted development target and a browser publishable key. No fixtures created.');
  assert.ok(!process.env.DEBUG && !process.env.PWDEBUG,
    'Browser debug logging must be disabled to prevent credential-bearing call logs. No fixtures created.');
  // Do not reuse a pre-existing local app or another process's browser session.
  let occupied = false;
  try { await fetch(UI_ORIGIN, { signal: AbortSignal.timeout(500), redirect: 'error' }); occupied = true; } catch { /* expected unused port */ }
  assert.ok(!occupied, 'The isolated browser-test port is occupied; no existing server will be reused.');
  const admin = client(config, config.serviceRoleKey);
  await preflightSchema(admin);
  await ok(admin.from('project_requests').select('id,account_id,facility_id,submitted_by_profile_id,submitted_by_auth_user_id,original_wording,revision,status,is_demo').limit(0));
  const accountA = randomUUID(), accountB = randomUUID(), facilityA = randomUUID(), facilityA2 = randomUUID(), facilityB = randomUUID();
  const profileA = randomUUID(), grants = Array.from({ length: 4 }, () => randomUUID());
  const f = { runId: randomUUID(), createdAuth: [], profileIdByAuthId: new Map(), auditProbe: randomUUID(), auditProbeAttempted: false,
    idsByTable: { client_accounts: [accountA, accountB], facilities: [facilityA, facilityA2, facilityB], user_profiles: [profileA],
      account_memberships: [], account_capability_grants: grants }, accessPairs: [[accountA, profileA]],
    grantTargets: grants.map(id => [id, accountA, profileA]) };
  const accountName = `Browser synthetic ${f.runId} A`, otherAccountName = `Browser synthetic ${f.runId} B`;
  const facilityName = 'Browser synthetic A1', hiddenFacilityName = 'Browser synthetic A2';
  let browser, context, server, requestId;
  let stage = 'initialization';
  t.diagnostic(`Genuine browser synthetic run ${f.runId}; target ${config.url}; application/audit history will be retained.`);
  t.after(async () => {
    // Always attempt preservation-safe fixture cleanup even when a browser or
    // owned server cannot close. Only safe UUIDs and fixed stages are reported.
    t.diagnostic(`Browser-created request retained, never deleted: ${requestId ?? 'no verified response ID'}.`);
    const closed = await Promise.allSettled([browser?.close(), stopApp(server)]);
    await cleanupFixtures(admin, f, message => t.diagnostic(message));
    assert.ok(closed.every(result => result.status === 'fulfilled'), 'Browser/app shutdown incomplete; fixture cleanup was attempted.');
  });
  try {
    stage = 'owned Auth identity creation';
    const email = `api-${f.runId}-a@identity-directory.invalid`;
    const password = `${randomBytes(36).toString('base64url')}aA1!`;
    const created = await ok(admin.auth.admin.createUser({ email, password, email_confirm: true }));
    recordCreatedAuth(f, created.user, 'a'); f.profileIdByAuthId.set(created.user.id, profileA);
    stage = 'synthetic directory and capability provisioning';
    await ok(admin.from('client_accounts').insert([
      { id: accountA, display_name: accountName, is_demo: true }, { id: accountB, display_name: otherAccountName, is_demo: true },
    ]));
    await ok(admin.from('facilities').insert([
      { id: facilityA, account_id: accountA, display_name: facilityName, is_demo: true },
      { id: facilityA2, account_id: accountA, display_name: hiddenFacilityName, is_demo: true },
      { id: facilityB, account_id: accountB, display_name: 'Browser synthetic B1', is_demo: true },
    ]));
    await ok(admin.from('user_profiles').insert({ id: profileA, auth_user_id: created.user.id,
      display_name: 'Synthetic browser operator', identity_status: 'suspended', is_demo: true }));
    await ok(admin.from('account_access').insert({ account_id: accountA, user_profile_id: profileA, membership_status: 'active', is_demo: true }));
    await ok(admin.from('account_capability_grants').insert(['view_account', 'view_asset', 'submit_request', 'triage_request']
      .map((capability_key, n) => ({ id: grants[n], account_id: accountA, user_profile_id: profileA,
        capability_key, scope_kind: n === 0 ? 'account' : 'facility', facility_id: n === 0 ? null : facilityA, is_demo: true }))));
    await ok(admin.from('user_profiles').update({ identity_status: 'active' }).eq('id', profileA).eq('is_demo', true));

    stage = 'isolated app and Chromium startup';
    server = await startApp(config);
    browser = await chromium.launch({ headless: true, env: childEnvironment(),
      executablePath: process.env.AUXILIUMOS_BROWSER_EXECUTABLE || undefined,
      args: ['--disable-dev-shm-usage'] });
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    context.setDefaultTimeout(15_000);
    let blockedRequest = false;
    await context.route('**/*', async route => {
      // This is only an egress allowlist. Permitted requests pass unmodified to
      // the actual app/provider: nothing is fulfilled or mocked by the harness.
      const request = route.request();
      if (![UI_ORIGIN, config.url].includes(new URL(request.url()).origin)
        || Object.values(request.headers()).some(value => value.includes(config.serviceRoleKey))) {
        blockedRequest = true; await route.abort('blockedbyclient');
      } else await route.continue();
    });
    const page = await context.newPage();
    stage = 'real browser password sign-in';
    await page.goto(UI_ORIGIN);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Password', { exact: true }).press('Tab');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeFocused();
    const [response] = await Promise.all([page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.origin === config.url && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password'
        && response.request().method() === 'POST';
    }), page.keyboard.press('Enter')]);
    assert.ok(response.ok(), 'Browser password sign-in was rejected.');
    const signed = await response.json();
    assert.ok(signed.user?.id === created.user.id && typeof signed.access_token === 'string', 'Browser Auth identity mismatch.');
    const token = signed.access_token; // Held only in memory; never a storage-state/credential artifact.
    const login = client(config, config.publishableKey);
    assert.ok((await ok(login.auth.getUser(token))).user.id === created.user.id, 'Auth must verify the browser-issued identity.');
    const ordinary = client(config, config.publishableKey, token);

    stage = 'scoped account and facility rendering';
    await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: accountName, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: otherAccountName, exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: `View facilities for ${accountName}`, exact: true }).click();
    await expect(page.getByRole('heading', { name: facilityName, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: hiddenFacilityName, exact: true })).toHaveCount(0);

    stage = 'real UI intake submission and server provenance';
    await page.goto(`${UI_ORIGIN}/intake?account=${accountA}`);
    await expect(page.getByRole('heading', { name: 'Intake', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'New request', exact: true }).click();
    await page.getByLabel('Facility', { exact: true }).selectOption(facilityA);
    const title = `Browser synthetic request ${f.runId}`, wording = ' Exact synthetic browser wording; no PHI or real client data. ';
    await page.getByLabel('Request title', { exact: true }).fill(title);
    await page.getByLabel('Original request wording', { exact: true }).fill(wording);
    await page.getByLabel('Issue', { exact: true }).selectOption('ISSUE-019');
    await page.getByLabel('Intent', { exact: true }).selectOption('INTENT-016');
    const [submitted] = await Promise.all([page.waitForResponse(response => response.url() === `${config.url}/rest/v1/rpc/submit_project_request`
      && response.request().method() === 'POST'), page.getByRole('button', { name: 'Submit request', exact: true }).click()]);
    assert.ok(submitted.ok(), 'Browser request submission was rejected.');
    const submission = await submitted.json();
    assert.ok(/^[0-9a-f-]{36}$/i.test(submission.request_id), 'Expected a real request UUID.');
    requestId = submission.request_id;
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const rows = await ok(admin.from('project_requests').select('id,account_id,facility_id,submitted_by_profile_id,submitted_by_auth_user_id,original_wording,revision,status,is_demo').eq('id', requestId));
    assert.ok(rows.length === 1 && rows[0].account_id === accountA && rows[0].facility_id === facilityA && rows[0].is_demo === true
      && rows[0].submitted_by_profile_id === profileA && rows[0].submitted_by_auth_user_id === created.user.id
      && rows[0].original_wording === wording && rows[0].revision === 1 && rows[0].status === 'submitted', 'Browser submission readback/provenance mismatch.');

    stage = 'real UI triage and immutable original readback';
    await page.getByLabel('Assignee', { exact: true }).selectOption(profileA);
    await page.getByLabel('Request status', { exact: true }).selectOption('intake_completeness_review');
    const nextAction = 'Synthetic completeness review; no work authorization.';
    await page.getByLabel('Next action', { exact: true }).fill(nextAction);
    await page.getByRole('button', { name: 'Save triage', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Triage changes saved' })).toBeVisible();
    const changed = await ok(admin.from('project_requests').select('revision,status,assigned_to_profile_id,next_action,original_wording').eq('id', requestId));
    assert.ok(changed.length === 1 && changed[0].revision === 2 && changed[0].status === 'intake_completeness_review'
      && changed[0].assigned_to_profile_id === profileA && changed[0].next_action === nextAction && changed[0].original_wording === wording,
    'Browser triage must persist the exact revision without replacing the original wording.');

    stage = 'profile revocation with the original browser-issued JWT';
    await ok(admin.from('user_profiles').update({ identity_status: 'suspended' }).eq('id', profileA).eq('is_demo', true));
    assert.ok((await ok(login.auth.getUser(token))).user.id === created.user.id, 'Original browser JWT must still be valid at Auth.');
    for (const table of ['user_profiles', 'client_accounts', 'facilities']) {
      const denied = await ok(ordinary.from(table).select('id'));
      assert.ok(Array.isArray(denied) && denied.length === 0, 'Revoked original JWT must return no directory rows.');
    }
    // Full reload discards UI memory and proves the real persisted Auth session
    // rechecks current backend authority; no fake session is injected.
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Access unavailable', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
    stage = 'real browser sign-out and session removal';
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    // Return only a boolean, never storage contents or tokens, to the runner.
    assert.ok(await page.evaluate(() => ![...Object.values(localStorage), ...Object.values(sessionStorage)]
      .some(value => value.includes('access_token') || value.includes('refresh_token'))), 'Sign-out must remove browser session material.');
    assert.ok(!blockedRequest, 'Unexpected browser egress or privileged header was blocked; journey is not accepted.');
    t.diagnostic(`Chromium ${browser.version()}: real password sign-in, scoped directory, request submission/triage, retained-JWT revocation and sign-out checked. No browser credential artifacts saved. Private-file UI, deployment parity and production acceptance remain separate gates.`);
  } catch {
    // Playwright call logs may contain fill() arguments; never let those raw
    // exceptions or provider bodies become the Node reporter/artifact output.
    throw new Error(`Genuine browser acceptance failed during ${stage}; credentials, provider responses and browser call logs omitted. No passing browser acceptance is claimed.`);
  }
});
