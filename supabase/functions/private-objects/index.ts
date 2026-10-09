import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { boundedBytes, createPrivateObjectGateway, MAX_BYTES } from './gateway.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const publishable = Deno.env.get('PRIVATE_OBJECT_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const allowedOrigins = (Deno.env.get('PRIVATE_OBJECT_ALLOWED_ORIGINS') ?? '').split(',').filter(Boolean);
const intendedTarget = url === 'https://txofqxictwecgcnvezlb.supabase.co'
  || (Deno.env.get('PRIVATE_OBJECT_ALLOW_LOCAL_TEST') === 'true' && /^http:\/\/(localhost|127\.0\.0\.1|kong):[0-9]+$/.test(url));

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
  enabled: intendedTarget && Boolean(publishable && serviceKey) && Deno.env.get('PRIVATE_OBJECT_TRANSPORT_MODE') === 'synthetic-only',
  allowedOrigins,
  createUserClient: (token: string) => createClient(url, publishable, {
    ...options, global: { ...options.global, headers: { Authorization: `Bearer ${token}` } },
  }),
  // Separate immutable server client; never install a caller's Authorization on it.
  createServiceClient: () => createClient(url, serviceKey, options),
}));
