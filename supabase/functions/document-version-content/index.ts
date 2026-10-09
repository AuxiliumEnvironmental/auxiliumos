import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { boundedBytes, createDocumentVersionContentGateway, MAX_BYTES } from './gateway.mjs';

const url = Deno.env.get('SUPABASE_URL') ?? '';
const publishable = Deno.env.get('DOCUMENT_CONTENT_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// Same exact development target and browser-origin boundary as private-objects.
// Neither deployment nor these defaults enables the separate DB content gate.
const canonicalDevelopment = url === 'https://txofqxictwecgcnvezlb.supabase.co';
// Exact existing editor project; CORS grants no identity or content authority.
const canonicalEditorOrigin = 'https://id-preview--0b7bbfc6-627f-4ca0-9217-98f5b164b419.lovable.app';
const mode = Deno.env.get('DOCUMENT_CONTENT_TRANSPORT_MODE') ?? (canonicalDevelopment ? 'synthetic-only' : 'disabled');
const originSetting = Deno.env.get('DOCUMENT_CONTENT_ALLOWED_ORIGINS')
  ?? (canonicalDevelopment ? `http://127.0.0.1:4179,http://localhost:4179,${canonicalEditorOrigin}` : '');
const allowedOrigins = originSetting.trim() ? originSetting.split(',').map(origin => origin.trim()) : [];
const validOrigins = allowedOrigins.every(origin => {
  try {
    const parsed = new URL(origin);
    if (canonicalDevelopment && origin === canonicalEditorOrigin) return true;
    return ['http:', 'https:'].includes(parsed.protocol) && ['localhost', '127.0.0.1'].includes(parsed.hostname)
      && Number(parsed.port) > 0 && origin === parsed.origin;
  } catch { return false; }
});
const localTarget = url.match(/^http:\/\/(localhost|127\.0\.0\.1|kong):([0-9]+)$/);
const intendedTarget = canonicalDevelopment || (Deno.env.get('DOCUMENT_CONTENT_ALLOW_LOCAL_TEST') === 'true'
  && localTarget !== null && Number(localTarget[2]) > 0 && Number(localTarget[2]) <= 65535);

// Bound bytes before the SDK buffers a Blob/JSON. Reject redirects rather than
// forwarding bearer credentials. No provider URL or headers reach the response.
async function boundedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const parsed = new URL(requestUrl);
  if (parsed.origin !== url || parsed.username || parsed.password) throw new Error('backend_unavailable');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15_000);
  const upstreamSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  const abort = () => controller.abort();
  upstreamSignal?.addEventListener('abort', abort, { once: true });
  if (upstreamSignal?.aborted) controller.abort();
  try {
    const response = await fetch(input, { ...init, signal: controller.signal, redirect: 'error', cache: 'no-store' });
    if (response.redirected || (response.status >= 300 && response.status < 400)) throw new Error('backend_unavailable');
    if ([204, 205].includes(response.status)) return response;
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const isDownload = parsed.pathname.startsWith('/storage/v1/object/') && method === 'GET';
    const body = await boundedBytes(response.body, isDownload && response.ok ? MAX_BYTES : 131_072);
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } finally { clearTimeout(timer); upstreamSignal?.removeEventListener('abort', abort); }
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: boundedFetch } };

Deno.serve(createDocumentVersionContentGateway({
  enabled: intendedTarget && validOrigins && Boolean(publishable && serviceKey) && mode === 'synthetic-only',
  allowedOrigins,
  createUserClient: (token: string) => createClient(url, publishable, {
    ...options, global: { ...options.global, headers: { Authorization: `Bearer ${token}` } },
  }),
  // The server client never receives a caller's mutable Authorization header.
  createServiceClient: () => createClient(url, serviceKey, options),
}));
