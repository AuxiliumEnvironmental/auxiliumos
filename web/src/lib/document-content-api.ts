import type { SupabaseClient } from '@supabase/supabase-js';
import type { RuntimeConfig } from './config';
import { RuntimeError, isAbort } from './errors';

export const DOCUMENT_CONTENT_MAX_BYTES = 65_536;
export type DocumentContentRequest = Readonly<{
  versionId: string; verifiedSha256: string; byteSize: number; mediaType: 'text/plain';
}>;
export type VerifiedDocumentContent = { bytes: ArrayBuffer; filename: string };
const messages = {
  unauthenticated: 'Your session is unavailable. Sign in again before requesting content.',
  unavailable: 'Content is unavailable to your current access, or this service is not enabled. Visible history does not grant content permission.',
  invalid_request: 'This version request could not be validated. Refresh version history before retrying.',
  conflict: 'This version could not be confirmed. Refresh version history before requesting it again.',
  backend: 'The secure download service is unavailable or may not be enabled. No browser handoff was initiated. Try again later.',
  invalid_response: 'The response did not match the exact version or secure download contract. No browser handoff was initiated. Refresh version history before retrying.',
  network: 'The secure download could not be completed. Check your connection and retry.',
  save: 'The browser handoff could not be confirmed. Check your browser downloads before retrying.',
} as const;
export class DocumentContentError extends RuntimeError {
  constructor(public readonly reason: keyof typeof messages) {
    super(reason === 'unauthenticated' ? 'session_expired' : reason === 'invalid_request' ? 'validation'
      : reason === 'network' ? 'network' : 'backend', messages[reason], reason !== 'unauthenticated');
    this.name = 'DocumentContentError';
  }
}
function checkAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Canceled', 'AbortError');
}
// Auth's getSession and Web Crypto have no AbortSignal option. Stop waiting and
// discard their late results; the SDK owns session storage, never content bytes.
function cancellable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  checkAborted(signal);
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Canceled', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(value => { signal.removeEventListener('abort', abort); if (signal.aborted) abort(); else resolve(value); },
      () => { signal.removeEventListener('abort', abort); reject(signal.aborted ? new DOMException('Canceled', 'AbortError') : new DocumentContentError('network')); });
  });
}
const invalidResponse = (): never => { throw new DocumentContentError('invalid_response'); };

// Direct fetch preserves exact bytes (functions.invoke decodes text responses).
// getSession supplies a credential, not authorization: the gateway independently
// authenticates and rechecks the current exact-version grant before returning it.
export class DocumentContentApi {
  constructor(private readonly client: SupabaseClient, private readonly config: RuntimeConfig,
    private readonly transport: typeof fetch = (input, init) => fetch(input, init)) {}

  async download(request: DocumentContentRequest, signal?: AbortSignal): Promise<VerifiedDocumentContent> {
    const r = { ...request };
    if (typeof r.versionId !== 'string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(r.versionId)
      || typeof r.verifiedSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.verifiedSha256) || !Number.isSafeInteger(r.byteSize)
      || r.byteSize < 1 || r.byteSize > DOCUMENT_CONTENT_MAX_BYTES || r.mediaType !== 'text/plain') {
      throw new DocumentContentError('invalid_request');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timeout = setTimeout(abort, 15_000);
    let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let bytes: Uint8Array | undefined;
    let delivered = false;
    const cancelBody = () => { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); };
    controller.signal.addEventListener('abort', cancelBody, { once: true });
    try {
      checkAborted(controller.signal);
      const session = await cancellable(this.client.auth.getSession(), controller.signal);
      checkAborted(controller.signal);
      if (session.error || !session.data.session?.access_token || session.data.session.user.is_anonymous) {
        throw new DocumentContentError('unauthenticated');
      }
      // The runtime validates this origin/key before mounting authenticated UI.
      const url = `${this.config.url}/functions/v1/document-version-content/${r.versionId}/content?sha256=${r.verifiedSha256}`;
      response = await this.transport(url, { method: 'GET', headers: {
        Authorization: `Bearer ${session.data.session.access_token}`, apikey: this.config.publishableKey,
        Accept: 'text/plain',
      }, signal: controller.signal, cache: 'no-store', redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' });
      checkAborted(controller.signal);
      // Never parse/display error bodies, provider messages, keys or tokens.
      if (response.status !== 200) {
        throw new DocumentContentError(response.status === 401 ? 'unauthenticated'
          : response.status === 404 || response.status === 403 ? 'unavailable'
            : response.status === 400 ? 'invalid_request' : response.status === 409 ? 'conflict' : 'backend');
      }
      const filename = `document-version-${r.versionId}.txt`;
      const length = response.headers.get('Content-Length');
      if (!/^text\/plain\s*;\s*charset=utf-8$/i.test(response.headers.get('Content-Type') ?? '')
        || !/(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get('Cache-Control') ?? '')
        || response.headers.get('X-Content-Type-Options')?.toLowerCase() !== 'nosniff'
        || response.headers.get('Content-Disposition') !== `attachment; filename="${filename}"`
        || (length !== null && (!/^[1-9][0-9]{0,4}$/.test(length) || Number(length) !== r.byteSize))
        || response.redirected || !response.body) invalidResponse();
      reader = response.body!.getReader();
      bytes = new Uint8Array(r.byteSize);
      let offset = 0;
      while (true) {
        const chunk = await reader.read();
        checkAborted(controller.signal);
        if (chunk.done) break;
        if (offset + chunk.value.byteLength > r.byteSize) invalidResponse();
        bytes.set(chunk.value, offset); offset += chunk.value.byteLength;
      }
      if (offset !== r.byteSize) invalidResponse();
      const digest = await cancellable(crypto.subtle.digest('SHA-256', bytes), controller.signal);
      checkAborted(controller.signal);
      const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (hex !== r.verifiedSha256) invalidResponse();
      delivered = true;
      return { bytes: bytes.buffer as ArrayBuffer, filename };
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Canceled', 'AbortError');
      if (error instanceof DocumentContentError) throw error;
      if (isAbort(error) || controller.signal.aborted) throw new DocumentContentError('network');
      throw new DocumentContentError('network');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
      controller.signal.removeEventListener('abort', cancelBody);
      cancelBody();
      if (!delivered) bytes?.fill(0);
    }
  }
}
