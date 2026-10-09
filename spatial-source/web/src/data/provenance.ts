import { requireValidDocument } from '../core';
import type { SourceProvenance } from '../types';
import { fail, MAX_MEMBER, sha256, stableJSON, strictJSON } from './bytes';

export function validSourceReason(reason: unknown): reason is string {
  return typeof reason === 'string' && !!reason.trim() && [...reason].length <= 256 && !/[\u0000-\u001f]/.test(reason) && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(reason);
}

/** A recoverable origin association, never permission to publish or replace another draft. */
export async function validateSourceProvenance(value: SourceProvenance, documentID: string): Promise<void> {
  if (value.sourceIdentity === undefined && value.sourceBytes === undefined) return;
  const source = value.sourceIdentity;
  if (!source || typeof source !== 'object' || Array.isArray(source) || Object.keys(source).sort().join(',') !== 'documentID,reason,revision,sha256' || typeof source.documentID !== 'string' || !/^[A-Za-z0-9_-]{1,96}$/.test(source.documentID) || source.documentID === documentID || !Number.isSafeInteger(source.revision) || source.revision < 1 || typeof source.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256) || !validSourceReason(source.reason)) fail('invalid-source-identity');
  if (!(value.sourceBytes instanceof Uint8Array) || value.sourceBytes.length > MAX_MEMBER || await sha256(value.sourceBytes) !== source.sha256) fail('source-byte-identity-mismatch');
  const document = requireValidDocument(strictJSON(value.sourceBytes));
  if (document.documentID !== source.documentID || document.revision !== source.revision || stableJSON(document) !== new TextDecoder('utf-8', { fatal: true }).decode(value.sourceBytes)) fail('source-document-identity-mismatch');
}
