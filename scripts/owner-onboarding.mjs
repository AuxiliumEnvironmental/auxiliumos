import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { preflightSchema } from '../tests/api/fixture-cleanup.mjs';

// One explicitly authorized development owner, not a general privilege bootstrap.
// The address is supplied by the operator and checked without storing it in source.
const OWNER_EMAIL_SHA256 = '25b94cb2f529c847c80f4581f9101ff74676472d0df211419fed1a522652c5d9';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const OWNER_TARGET = 'https://txofqxictwecgcnvezlb.supabase.co';
export const OWNER_ORIGIN = 'https://auxiliumos.io';
export const OWNER_IDS = Object.freeze({
  account: '80f693ae-4109-442c-b719-000000000001',
  profile: '80f693ae-4109-442c-b719-000000000101',
  membership: '80f693ae-4109-442c-b719-000000000201',
  facility: '80f693ae-4109-442c-b719-000000000301',
});
const ACTIONS = new Set(['preflight-only', 'invite-and-provision', 'send-recovery']);
export const OWNER_GRANTS = Object.freeze(['view_account', 'view_asset', 'submit_request', 'triage_request', 'ingest_private_object']
  .map((capability_key, index) => Object.freeze({
    id: `80f693ae-4109-442c-b719-00000000070${index + 1}`,
    account_id: OWNER_IDS.account, user_profile_id: OWNER_IDS.profile,
    capability_key, scope_kind: index === 0 ? 'account' : 'facility',
    facility_id: index === 0 ? null : OWNER_IDS.facility, revoked_at: null, is_demo: true,
  })));
const ACCOUNT = Object.freeze({ id: OWNER_IDS.account, display_name: 'AuxiliumOS Development', is_demo: true });
const FACILITY = Object.freeze({ id: OWNER_IDS.facility, account_id: OWNER_IDS.account,
  display_name: 'Owner Workflow Sandbox', is_demo: true });
const MEMBERSHIP = Object.freeze({ id: OWNER_IDS.membership, account_id: OWNER_IDS.account,
  user_profile_id: OWNER_IDS.profile, role_key: 'system_admin', is_demo: true });
const ACCESS = Object.freeze({ account_id: OWNER_IDS.account, user_profile_id: OWNER_IDS.profile,
  membership_status: 'active', is_demo: true });
const PROFILE_NAME = 'Development owner';
export class OwnerOnboardingError extends Error {}
function requireCondition(condition, message) { if (!condition) throw new OwnerOnboardingError(message); }
function exact(actual, expected) { return actual && Object.entries(expected).every(([key, value]) => actual[key] === value); }
async function safe(label, request) {
  try {
    const result = await request;
    requireCondition(result && !result.error, `${label} failed; provider details omitted. No automatic retry or rollback.`);
    return result.data;
  } catch (error) {
    if (error instanceof OwnerOnboardingError) throw error;
    throw new OwnerOnboardingError(`${label} failed; provider details omitted. No automatic retry or rollback.`);
  }
}
async function rows(label, query) {
  const data = await safe(label, query);
  requireCondition(Array.isArray(data) && data.length < 1000, `${label} returned an incomplete or invalid inventory.`);
  return data;
}
function single(items, expected, label) {
  requireCondition(items.length <= 1 && (items.length === 0 || exact(items[0], expected)),
    `${label} differs from its reserved development identity. Nothing was adopted or overwritten.`);
  return items[0] ?? null;
}
export function ownerOptions({ action = 'preflight-only', email, reviewedAuthId = '' } = {}) {
  requireCondition(ACTIONS.has(action), 'A supported explicit owner onboarding action is required.');
  requireCondition(typeof email === 'string' && email.length < 255, 'The authorized owner email is required as a nonsecret operator input.');
  const normalizedEmail = email.trim().toLowerCase();
  requireCondition(createHash('sha256').update(normalizedEmail).digest('hex') === OWNER_EMAIL_SHA256,
    'The recipient does not match the one authorized development owner.');
  requireCondition(typeof reviewedAuthId === 'string' && (reviewedAuthId === '' || UUID.test(reviewedAuthId)),
    'The reviewed existing Auth identity must be an exact UUID, or absent.');
  return { action, email: normalizedEmail, reviewedAuthId };
}

export function ownerConfiguration(environment = process.env) {
  requireCondition(environment.AUXILIUMOS_TEST_URL === OWNER_TARGET, 'Owner onboarding is restricted to the existing AuxiliumOS development backend.');
  const serviceRoleKey = environment.AUXILIUMOS_TEST_SERVICE_ROLE_KEY;
  const publishableKey = environment.AUXILIUMOS_TEST_PUBLISHABLE_KEY;
  requireCondition(typeof serviceRoleKey === 'string' && serviceRoleKey.trim().length > 0
    && typeof publishableKey === 'string' && publishableKey.startsWith('sb_publishable_')
    && serviceRoleKey !== publishableKey && !serviceRoleKey.startsWith('sb_publishable_'),
  'Configure AUXILIUMOS_TEST_SERVICE_ROLE_KEY through the protected GitHub secret form and the development browser key separately. No credential value is printed.');
  return { serviceRoleKey, publishableKey, ...ownerOptions({
    action: environment.OWNER_ONBOARDING_ACTION || 'preflight-only',
    email: environment.OWNER_ONBOARDING_EMAIL,
    reviewedAuthId: environment.REVIEWED_OWNER_AUTH_ID || '',
  }) };
}

// This explicit-action probe sends no email and gives its disposable identity
// no application profile or access. Provider link credentials never leave memory.
export async function verifyOwnerRedirects(admin) {
  const email = `owner-redirect-${randomUUID()}@identity-directory.invalid`;
  const created = await safe('Synthetic redirect probe creation', admin.auth.admin.createUser({ email, email_confirm: true }));
  requireCondition(UUID.test(created?.user?.id ?? '') && created.user.email === email,
    'Redirect probe identity was not confirmed; independently inspect Auth inventory before retrying.');
  const id = created.user.id;
  try {
    for (const kind of ['invite', 'recovery']) {
      const redirectTo = `${OWNER_ORIGIN}/?auth=${kind}`;
      const generated = await safe('Synthetic redirect resolution', admin.auth.admin.generateLink({
        type: 'recovery', email, options: { redirectTo },
      }));
      requireCondition(generated?.user?.id === id && generated.user.email === email
        && generated.properties?.redirect_to === redirectTo,
      'Provider Auth did not resolve the exact owner callback URLs. Reconcile Auth URL configuration before inviting the owner.');
    }
  } finally {
    const existing = await safe('Synthetic redirect cleanup identity readback', admin.auth.admin.getUserById(id));
    requireCondition(existing?.user?.id === id && existing.user.email === email,
      'Synthetic redirect cleanup identity changed. No Auth deletion was attempted.');
    const profiles = await rows('Synthetic redirect cleanup linkage', admin.from('user_profiles').select('id').eq('auth_user_id', id));
    requireCondition(profiles.length === 0, 'Synthetic redirect probe unexpectedly has application linkage. Nothing was deleted.');
    await safe('Synthetic redirect cleanup', admin.auth.admin.deleteUser(id));
  }
  return true;
}

function validAuth(user, email) {
  requireCondition(UUID.test(user?.id ?? '') && user.email?.toLowerCase() === email
    && user.is_anonymous === false && !user.deleted_at && !user.email_change
    && (!user.banned_until || Date.parse(user.banned_until) <= Date.now()),
  'Owner Auth identity is absent, ambiguous, changing, banned or inconsistent. No automatic repair is permitted.');
  return user;
}
async function findOwner(admin, email) {
  let match = null;
  for (let page = 1; page <= 40; page++) {
    const data = await safe('Auth identity inventory', admin.auth.admin.listUsers({ page, perPage: 250 }));
    requireCondition(Array.isArray(data?.users), 'Auth identity inventory is invalid.');
    for (const user of data.users) {
      if (typeof user.email === 'string' && user.email.toLowerCase() === email) {
        requireCondition(match === null, 'Multiple matching Auth entries require independent reconciliation.');
        match = validAuth(user, email);
      }
    }
    if (data.users.length < 250) {
      if (!match) return null;
      const current = await safe('Owner Auth identity readback', admin.auth.admin.getUserById(match.id));
      requireCondition(current?.user?.id === match.id, 'Auth identity changed during inventory.');
      return validAuth(current.user, email);
    }
  }
  throw new OwnerOnboardingError('Auth inventory exceeded the bounded review limit. No provisioning was attempted.');
}

async function inspect(admin, user, options) {
  const account = single(await rows('Reserved account', admin.from('client_accounts').select('*').eq('id', OWNER_IDS.account)), ACCOUNT, 'Account');
  const facility = single(await rows('Reserved facility', admin.from('facilities').select('*').eq('id', OWNER_IDS.facility)), FACILITY, 'Facility');
  const profiles = await rows('Reserved profile', admin.from('user_profiles').select('*').eq('id', OWNER_IDS.profile));
  const profile = single(profiles, { id: OWNER_IDS.profile, display_name: PROFILE_NAME, is_demo: true }, 'Profile');
  if (profile) requireCondition(user && profile.auth_user_id === user.id && profile.auth_linked_once === true
    && ['suspended', 'active'].includes(profile.identity_status), 'Existing profile linkage or lifecycle cannot be repaired by onboarding.');
  if (user) {
    const linked = await rows('Existing Auth linkage', admin.from('user_profiles').select('id').eq('auth_user_id', user.id));
    requireCondition(linked.length === (profile ? 1 : 0) && linked.every(item => item.id === OWNER_IDS.profile),
      'The owner Auth identity is associated with another application profile.');
    requireCondition(profile || options.reviewedAuthId === user.id,
      'An existing unlinked Auth identity requires its independently reviewed UUID before application provisioning.');
    requireCondition(!options.reviewedAuthId || options.reviewedAuthId === user.id,
      'The reviewed Auth identity does not match the current owner identity.');
  } else requireCondition(!options.reviewedAuthId, 'A reviewed Auth identity was supplied but no matching owner Auth identity exists.');
  const access = single(await rows('Owner account access', admin.from('account_access').select('*').eq('user_profile_id', OWNER_IDS.profile)), ACCESS, 'Account access');
  const membershipRows = await rows('Owner administrative designation', admin.from('account_memberships').select('*')
    .or(`user_profile_id.eq.${OWNER_IDS.profile},id.eq.${OWNER_IDS.membership}`));
  const membership = single(membershipRows, MEMBERSHIP, 'Administrative designation');
  const grants = await rows('Owner scoped capabilities', admin.from('account_capability_grants').select('*')
    .or(`user_profile_id.eq.${OWNER_IDS.profile},id.in.(${OWNER_GRANTS.map(grant => grant.id).join(',')})`));
  requireCondition(grants.every(grant => OWNER_GRANTS.some(expected => exact(grant, expected)))
    && new Set(grants.map(grant => grant.id)).size === grants.length,
  'Existing capabilities are revoked, broader or otherwise inconsistent. Onboarding never restores or replaces them.');
  const audit = await rows('Owner lifecycle history', admin.from('audit_events')
    .select('object_type,object_id,event_type,event_metadata,actor_kind,actor_system_key')
    .in('object_id', [OWNER_IDS.profile, ...OWNER_GRANTS.map(grant => grant.id)]).limit(1000));
  requireCondition(audit.every(event => !/deleted|revoked|restored/.test(event.event_type)),
    'Previous removal or revocation requires a separate reviewed access decision.');
  const profileHistory = audit.filter(event => event.object_type === 'user_profile');
  if (profile) {
    requireCondition(profileHistory.some(event => event.event_type === 'profile_created'
      && event.actor_kind === 'system' && event.actor_system_key === 'database_privileged_operation'
      && exact(event.event_metadata?.after, { id: OWNER_IDS.profile, auth_user_id: user.id,
        identity_status: 'suspended', auth_linked_once: true, is_demo: true })),
    'The reserved profile lacks matching immutable initial-provisioning audit evidence.');
    if (profile.identity_status === 'suspended') requireCondition(profileHistory.every(event =>
      event.event_metadata?.before?.identity_status !== 'active' && event.event_metadata?.after?.identity_status !== 'active'),
    'A previously activated profile is now suspended. Onboarding cannot restore it.');
  } else requireCondition(profileHistory.length === 0, 'A historical owner profile cannot be recreated or relinked.');
  for (const event of audit) {
    if (event.object_type === 'account_capability_grant') requireCondition(grants.some(grant => grant.id === event.object_id),
      'A missing historical capability cannot be recreated by onboarding.');
    if (event.object_type === 'account_access') requireCondition(access && exact(event.event_metadata?.after, ACCESS),
      'Historical account access differs from the intended initial lifecycle.');
  }
  const complete = Boolean(profile?.identity_status === 'active' && account && facility && access && membership && grants.length === OWNER_GRANTS.length);
  requireCondition(profile?.identity_status !== 'active' || complete,
    'An activated owner configuration is incomplete. Onboarding cannot silently recreate access.');
  return { account, facility, profile, access, membership, grants, complete };
}

function receipt(options, state, emailSent = false) {
  return { action: options.action, target: OWNER_TARGET, applicationOrigin: OWNER_ORIGIN,
    configured: state.complete, status: state.complete ? 'application_access_configured' : 'preparation_required',
    authorizedRecipientMatched: true, emailSent, redirectResolutionVerified: options.redirectsVerified === true,
    emailTemplateVerified: false, emailDeliveryVerified: false, ids: OWNER_IDS,
    capabilities: OWNER_GRANTS.map(({ capability_key, scope_kind }) => ({ capability: capability_key, scope: scope_kind })),
    professionalApprovalGranted: false, passwordSetVerified: false, ownerFirstLoginVerified: false };
}

export async function onboardOwner(admin, options, { recoveryClient } = {}) {
  options = ownerOptions(options);
  try { await preflightSchema(admin); } catch { throw new OwnerOnboardingError('Read-only application schema preflight failed. No owner invitation or provisioning attempted.'); }
  const activationPreflight = await safe('Atomic owner activation preflight', admin.rpc('activate_development_owner', { p_auth_user_id: null, p_preflight: true }));
  requireCondition(activationPreflight?.ready === true && activationPreflight.scope === 'development_owner_initial_activation',
    'The reviewed atomic owner activation helper is not available. No invitation was sent.');
  let user = await findOwner(admin, options.email);
  let state = await inspect(admin, user, options);
  if (options.action === 'preflight-only') return receipt(options, state);
  if (options.action === 'send-recovery') {
    requireCondition(state.complete && user, 'Recovery requires the exact already-provisioned active owner identity.');
    requireCondition(recoveryClient?.auth?.resetPasswordForEmail, 'The separate public Auth client is required for recovery delivery.');
    options.redirectsVerified = await verifyOwnerRedirects(admin);
    await safe('Owner recovery delivery', recoveryClient.auth.resetPasswordForEmail(options.email,
      { redirectTo: `${OWNER_ORIGIN}/?auth=recovery` }));
    return receipt(options, state, true);
  }
  let emailSent = false;
  if (!user) {
    options.redirectsVerified = await verifyOwnerRedirects(admin);
    const invitation = await safe('Owner invitation delivery', admin.auth.admin.inviteUserByEmail(options.email,
      { redirectTo: `${OWNER_ORIGIN}/?auth=invite` }));
    user = validAuth(invitation?.user, options.email);
    options = { ...options, reviewedAuthId: user.id };
    emailSent = true;
    // Re-read after the external side effect before creating any application row.
    state = await inspect(admin, user, options);
  }
  if (!state.complete) {
    const insert = (table, value) => safe(`Create ${table} owner development row`, admin.from(table).insert(value));
    if (!state.account) await insert('client_accounts', ACCOUNT);
    if (!state.facility) await insert('facilities', FACILITY);
    if (!state.profile) await insert('user_profiles', { id: OWNER_IDS.profile, auth_user_id: user.id,
      display_name: PROFILE_NAME, identity_status: 'suspended', is_demo: true });
    if (!state.access) await insert('account_access', ACCESS);
    if (!state.membership) await insert('account_memberships', MEMBERSHIP);
    const missing = OWNER_GRANTS.filter(expected => !state.grants.some(grant => grant.id === expected.id));
    if (missing.length) await insert('account_capability_grants', missing);
    state = await inspect(admin, user, options);
    requireCondition(state.account && state.facility && state.profile && state.access && state.membership
      && state.grants.length === OWNER_GRANTS.length, 'Owner provisioning did not pass complete preactivation readback.');
    // The service-only database operation takes locks and rechecks immutable
    // lifecycle history and all exact grants in its activation transaction.
    await safe('Initial owner profile activation', admin.rpc('activate_development_owner', { p_auth_user_id: user.id }));
    state = await inspect(admin, user, options);
    requireCondition(state.complete, 'Owner activation readback is incomplete. No login acceptance is claimed.');
  }
  return receipt(options, state, emailSent);
}

export function ownerFetch(input, init) {
  const url = new URL(input instanceof Request ? input.url : input);
  requireCondition(url.origin === OWNER_TARGET && /^\/(auth|rest)\/v1\//.test(url.pathname),
    'Owner provisioning request destination is outside the approved Auth/Data API.');
  return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) });
}
async function main() {
  requireCondition(process.argv.length === 2, 'Owner onboarding uses reviewed environment inputs only; no command-line secrets or flags.');
  const config = ownerConfiguration();
  const client = key => createClient(OWNER_TARGET, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: ownerFetch },
  });
  const result = await onboardOwner(client(config.serviceRoleKey), config, { recoveryClient: client(config.publishableKey) });
  process.stdout.write(`${JSON.stringify({ ...result, observedAt: new Date().toISOString(),
    sourceCommit: /^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA : null })}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof OwnerOnboardingError ? error.message : 'Owner onboarding failed; provider details omitted.'}\n`);
    process.exitCode = 1;
  });
}
