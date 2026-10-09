import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { boundedBytes, createPrivateObjectGateway, MAX_BYTES } from './gateway.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const publishable = Deno.env.get('PRIVATE_OBJECT_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// Nonsecret, DEVELOPMENT-ONLY defaults for the existing auxiliumos-dev backend.
// They authorize neither bucket provisioning nor SQL reservation enablement.
const canonicalDevelopment = url === 'https://txofqxictwecgcnvezlb.supabase.co';
// Exact existing editor project, verified through its project metadata. This is
// browser transport configuration, never identity, grant or live-data authority.
const canonicalEditorOrigin = 'https://id-preview--0b7bbfc6-627f-4ca0-9217-98f5b164b419.lovable.app';
const canonicalApplicationOrigin = 'https://auxiliumos.io';
const mode = Deno.env.get('PRIVATE_OBJECT_TRANSPORT_MODE') ?? (canonicalDevelopment ? 'synthetic-only' : 'disabled');
const originSetting = Deno.env.get('PRIVATE_OBJECT_ALLOWED_ORIGINS')
  ?? (canonicalDevelopment ? `http://127.0.0.1:4179,http://localhost:4179,${canonicalEditorOrigin},${canonicalApplicationOrigin}` : '');
const allowedOrigins = originSetting.trim() ? originSetting.split(',').map(origin => origin.trim()) : [];
// Overrides select exact local, editor or owner application origins on this one
// development backend, never arbitrary hosts, wildcard patterns or redirects.
const validOrigins = allowedOrigins.every(origin => {
  try {
    const parsed = new URL(origin);
    if (canonicalDevelopment && [canonicalEditorOrigin, canonicalApplicationOrigin].includes(origin)) return true;
    return ['http:', 'https:'].includes(parsed.protocol)
      && ['localhost', '127.0.0.1'].includes(parsed.hostname)
      && Number(parsed.port) > 0 && origin === parsed.origin;
  } catch { return false; }
});
const localTarget = url.match(/^http:\/\/(localhost|127\.0\.0\.1|kong):([0-9]+)$/);
const intendedTarget = canonicalDevelopment || (Deno.env.get('PRIVATE_OBJECT_ALLOW_LOCAL_TEST') === 'true'
  && localTarget !== null && Number(localTarget[2]) > 0 && Number(localTarget[2]) <= 65535);

// Bound provider responses before SDK Blob/JSON decoding, including a changed
// bucket or oversized provider response. Never forward credentials on redirects.
async function boundedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const abort = () => controller.abort();
  init?.signal?.addEventListener('abort', abort, { once: true });
  if (init?.signal?.aborted) controller.abort();
  try {
    const response = await fetch(input, { ...init, signal: controller.signal, redirect: 'error', cache: 'no-store' });
    if ([204, 205, 304].includes(response.status)) return response;
    const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const isDownload = new URL(requestUrl).pathname.startsWith('/storage/v1/object/') && (init?.method ?? 'GET') === 'GET';
    const body = await boundedBytes(response.body, isDownload && response.ok ? MAX_BYTES : 131_072);
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', abort); }
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: boundedFetch } };

Deno.serve(createPrivateObjectGateway({
  enabled: intendedTarget && validOrigins && Boolean(publishable && serviceKey) && mode === 'synthetic-only',
  allowedOrigins,
  createUserClient: (token: string) => createClient(url, publishable, {
    ...options, global: { ...options.global, headers: { Authorization: `Bearer ${token}` } },
  }),
  // Separate immutable server client; never install a caller's Authorization on it.
  createServiceClient: () => createClient(url, serviceKey, options),
}));
