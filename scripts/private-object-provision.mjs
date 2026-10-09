import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const PRIVATE_BUCKET = 'os-private-ingest';
export const PRIVATE_BUCKET_OPTIONS = Object.freeze({ public: false, fileSizeLimit: 65_536, allowedMimeTypes: ['text/plain'] });
const TARGETS = new Set(['https://txofqxictwecgcnvezlb.supabase.co','http://127.0.0.1:54321','http://localhost:54321']);
class ProvisionError extends Error {}

export function assertPrivateBucket(bucket) {
  if (!bucket || bucket.id !== PRIVATE_BUCKET || bucket.public !== false
    || Number(bucket.file_size_limit) !== 65_536 || !Array.isArray(bucket.allowed_mime_types)
    || bucket.allowed_mime_types.length !== 1 || bucket.allowed_mime_types[0] !== 'text/plain') {
    throw new ProvisionError('Private bucket configuration differs from the reviewed synthetic subset. No automatic mutation or reuse is permitted.');
  }
}

export async function provisionPrivateBucket(client, { create = false, reviewedExisting = false } = {}) {
  if (typeof create !== 'boolean' || typeof reviewedExisting !== 'boolean') {
    throw new ProvisionError('Provisioning and existing-entry review decisions must be explicit booleans. No requests made.');
  }
  const listing = await client.storage.listBuckets();
  if (listing.error || !Array.isArray(listing.data)) throw new ProvisionError('Bucket inventory unavailable; no provisioning attempted.');
  let bucket = listing.data.find((item) => item.id === PRIVATE_BUCKET);
  let created = false;
  if (!bucket) {
    if (!create) throw new ProvisionError('Private bucket is absent. Read-only preflight made no changes; an authorized operator must explicitly use --create.');
    const result = await client.storage.createBucket(PRIVATE_BUCKET, PRIVATE_BUCKET_OPTIONS);
    if (result.error) throw new ProvisionError('Bucket creation not confirmed. Re-run read-only inventory before retry; provider details omitted.');
    created = true;
  }
  const current = await client.storage.getBucket(PRIVATE_BUCKET);
  if (current.error) throw new ProvisionError('Bucket readback unavailable. Do not enable transport.');
  bucket = current.data;
  assertPrivateBucket(bucket);
  const objects = await client.storage.from(PRIVATE_BUCKET).list('', { limit: 1 });
  if (objects.error || !Array.isArray(objects.data)) throw new ProvisionError('Private bucket inventory unavailable. Do not enable transport.');
  const containsEntries = objects.data.length > 0;
  if (containsEntries && !reviewedExisting) throw new ProvisionError('Private bucket contains existing entries. Reconcile exact manifests, signing history and provider policies before explicitly using --reviewed-existing. Nothing was deleted or overwritten.');
  return { bucket: PRIVATE_BUCKET, mode: create ? 'create-if-absent' : 'verify-only', created, public: false, maxBytes: 65_536,
    mediaTypes: ['text/plain'], containsEntries, existingEntriesReviewed: containsEntries && reviewedExisting,
    policiesAndSigningHistoryVerified: false };
}

async function main() {
  const flags = process.argv.slice(2);
  if (flags.some((flag) => !['--create','--reviewed-existing'].includes(flag))) throw new ProvisionError('Usage: node scripts/private-object-provision.mjs [--create] [--reviewed-existing]');
  const url = process.env.AUXILIUMOS_TEST_URL;
  const key = process.env.AUXILIUMOS_TEST_SERVICE_ROLE_KEY;
  if (!TARGETS.has(url) || !key?.trim()) throw new ProvisionError('Secure AUXILIUMOS_TEST_URL and AUXILIUMOS_TEST_SERVICE_ROLE_KEY are required for the approved development/local target. No requests made.');
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init)=>fetch(input,{...init,redirect:'error',signal:AbortSignal.timeout(15_000)})}});
  const result = await provisionPrivateBucket(client,{create:flags.includes('--create'),reviewedExisting:flags.includes('--reviewed-existing')});
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(`${error instanceof ProvisionError ? error.message : 'Private bucket preflight failed; provider details omitted.'}\n`); process.exitCode=1; });
}
