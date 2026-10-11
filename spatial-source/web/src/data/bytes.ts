export const MAX_ARCHIVE = 64 * 1024 * 1024;
export const MAX_MEMBER = 32 * 1024 * 1024;
export const utf8 = new TextEncoder();
export const clone = <T>(value: T): T => structuredClone(value);
export function fail(code: string): never { throw new Error(code); }
export async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) fail('secure-context-required');
  const result = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return [...new Uint8Array(result)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export function stableJSON(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`;
  return `{${Object.keys(value).filter(k => (value as Record<string, unknown>)[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableJSON((value as Record<string, unknown>)[k])}`).join(',')}}`;
}
export function jsonBytes(value: unknown): Uint8Array { return utf8.encode(stableJSON(value)); }

/** Strict admission precedes the geometry/schema validator. No JSON.parse overwrite of duplicate keys. */
export function strictJSON(bytes: Uint8Array): unknown {
  if (!bytes.length || bytes.length > MAX_MEMBER) fail('json-size-limit');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('invalid-utf8'); }
  let offset = 0, values = 0;
  const whitespace = () => { while (offset < text.length && /[\x20\t\r\n]/.test(text[offset])) offset++; };
  function string(): string {
    const start = offset++;
    let escape = false;
    while (offset < text.length) {
      const c = text[offset++];
      if (c.charCodeAt(0) < 32) fail('invalid-json-string');
      if (c === '"' && !escape) {
        if (offset - start > 100_000) fail('json-string-limit');
        try {
          const value = JSON.parse(text.slice(start, offset)) as string;
          if (utf8.encode(value).length > 100_000 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) fail('invalid-unicode');
          return value;
        } catch { fail('invalid-json-string'); }
      }
      escape = c === '\\' && !escape;
    }
    fail('unterminated-string');
  }
  function value(depth: number): unknown {
    whitespace();
    if (depth > 32 || ++values > 1_000_000) fail('json-complexity-limit');
    const c = text[offset];
    if (c === '"') return string();
    if (c === '{') {
      offset++; whitespace();
      const object: Record<string, unknown> = Object.create(null);
      if (text[offset] === '}') { offset++; return object; }
      while (true) {
        whitespace(); if (text[offset] !== '"') fail('invalid-object-key');
        const key = string();
        if (key === '__proto__' || key === 'constructor' || key === 'prototype' || Object.hasOwn(object, key)) fail('duplicate-or-unsafe-json-key');
        whitespace(); if (text[offset++] !== ':') fail('invalid-json');
        object[key] = value(depth + 1); whitespace();
        const separator = text[offset++];
        if (separator === '}') return object;
        if (separator !== ',') fail('invalid-json');
      }
    }
    if (c === '[') {
      offset++; whitespace(); const array: unknown[] = [];
      if (text[offset] === ']') { offset++; return array; }
      while (true) {
        array.push(value(depth + 1)); whitespace(); const separator = text[offset++];
        if (separator === ']') return array;
        if (separator !== ',') fail('invalid-json');
      }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(literal, offset)) { offset += literal.length; return result; }
    }
    const token = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(offset));
    if (!token) fail('invalid-json-value');
    offset += token[0].length; const number = Number(token[0]);
    if (!Number.isFinite(number)) fail('nonfinite-json-number');
    return number;
  }
  const result = value(0); whitespace(); if (offset !== text.length) fail('trailing-json'); return result;
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff; for (const byte of bytes) c = crcTable[(c ^ byte) & 255] ^ c >>> 8;
  return (c ^ 0xffffffff) >>> 0;
}
export function concatenate(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((n, part) => n + part.length, 0); if (size > MAX_ARCHIVE) fail('archive-size-limit');
  const bytes = new Uint8Array(size); let position = 0;
  for (const part of parts) { bytes.set(part, position); position += part.length; } return bytes;
}
