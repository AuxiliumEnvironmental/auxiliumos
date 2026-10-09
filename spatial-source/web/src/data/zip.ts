import { Inflate } from 'fflate';
import { concatenate, crc32, fail, MAX_ARCHIVE, MAX_MEMBER, utf8 } from './bytes';
function validPath(path: string): boolean { return path.length <= 128 && /^[A-Za-z0-9_.\/-]+$/.test(path) && !path.startsWith('/') && path.split('/').every(p => p && p !== '.' && p !== '..'); }
/** Stored, deterministic archives. No filesystem extraction is ever performed. */
export function writeZIP(files: Record<string, Uint8Array>): Uint8Array {
  const names = Object.keys(files).sort(); if (!names.length || names.length > 4096) fail('zip-member-limit');
  const local: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0;
  for (const path of names) {
    const name = utf8.encode(path), data = files[path];
    if (!validPath(path) || !data.length || data.length > MAX_MEMBER) fail('invalid-zip-member');
    const checksum = crc32(data);
    const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(10, 0, true); h.setUint16(12, 33, true);
    h.setUint32(14, checksum, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); header.set(name, 30);
    const directory = new Uint8Array(46 + name.length), d = new DataView(directory.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(14, 33, true);
    d.setUint32(16, checksum, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true); d.setUint16(28, name.length, true); d.setUint32(42, offset, true); directory.set(name, 46);
    local.push(header, data); central.push(directory); offset += header.length + data.length;
  }
  const directory = concatenate(central), end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, names.length, true); e.setUint16(10, names.length, true); e.setUint32(12, directory.length, true); e.setUint32(16, offset, true);
  return concatenate([...local, directory, end]);
}
export function readZIP(bytes: Uint8Array): Record<string, Uint8Array> {
  if (bytes.length < 22 || bytes.length > MAX_ARCHIVE) fail('zip-size-limit');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = bytes.length - 22;
  const u16 = (p: number) => { if (p < 0 || p + 2 > bytes.length) fail('truncated-zip'); return v.getUint16(p, true); };
  const u32 = (p: number) => { if (p < 0 || p + 4 > bytes.length) fail('truncated-zip'); return v.getUint32(p, true); };
  if (u32(end) !== 0x06054b50 || u16(end + 4) || u16(end + 6) || u16(end + 20)) fail('unsupported-zip');
  const count = u16(end + 10), size = u32(end + 12), start = u32(end + 16);
  if (!count || count > 4096 || count !== u16(end + 8) || start + size !== end) fail('invalid-zip-directory');
  const files: Record<string, Uint8Array> = Object.create(null); let cursor = start, nextLocal = 0, total = 0;
  for (let index = 0; index < count; index++) {
    if (u32(cursor) !== 0x02014b50 || cursor + 46 > end) fail('invalid-zip-directory');
    const flags = u16(cursor + 8), method = u16(cursor + 10), crc = u32(cursor + 16), compressed = u32(cursor + 20), expanded = u32(cursor + 24);
    const nameLength = u16(cursor + 28), extra = u16(cursor + 30), comment = u16(cursor + 32), local = u32(cursor + 42);
    const fileKind = u32(cursor + 38) >>> 16 & 0xf000;
    if (![0, 0x800].includes(flags) || ![0, 8].includes(method) || u16(cursor + 6) > 20 || extra || comment || u16(cursor + 34) || ![0, 0x8000].includes(fileKind) || u32(cursor + 38) & 0x10 || local !== nextLocal) fail('unsupported-zip');
    if (!expanded || expanded > MAX_MEMBER || compressed > MAX_MEMBER || expanded / Math.max(compressed, 1) > 200 || (total += expanded) > MAX_ARCHIVE) fail('zip-expansion-limit');
    if (cursor + 46 + nameLength > end) fail('truncated-zip');
    let name: string; try { name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)); } catch { fail('invalid-zip-name'); }
    if (!validPath(name) || Object.hasOwn(files, name)) fail('unsafe-or-duplicate-zip-path');
    if (u32(local) !== 0x04034b50 || u16(local + 4) !== u16(cursor + 6) || u16(local + 6) !== flags || u16(local + 8) !== method || u16(local + 10) !== u16(cursor + 12) || u16(local + 12) !== u16(cursor + 14) || u32(local + 14) !== crc || u32(local + 18) !== compressed || u32(local + 22) !== expanded || u16(local + 26) !== nameLength || u16(local + 28)) fail('zip-header-mismatch');
    if (local + 30 + nameLength + compressed > start) fail('zip-overlap');
    const localName = bytes.subarray(local + 30, local + 30 + nameLength), centralName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    if (localName.some((b, i) => b !== centralName[i])) fail('zip-name-mismatch');
    const packed = bytes.subarray(local + 30 + nameLength, local + 30 + nameLength + compressed);
    let data: Uint8Array;
    if (method === 0) { if (compressed !== expanded) fail('zip-size-mismatch'); data = packed.slice(); }
    else {
      const parts: Uint8Array[] = []; let emitted = 0;
      const inflater = new Inflate((part) => { emitted += part.length; if (emitted > expanded) fail('zip-expansion-limit'); parts.push(part.slice()); });
      // Small input chunks bound intermediate inflation even for a deliberately false size declaration.
      for (let p = 0; p < packed.length; p += 256) inflater.push(packed.subarray(p, p + 256), p + 256 >= packed.length);
      if (emitted !== expanded) fail('zip-size-mismatch'); data = concatenate(parts);
    }
    if (crc32(data) !== crc) fail('zip-crc-mismatch'); files[name] = data;
    nextLocal = local + 30 + nameLength + compressed; cursor += 46 + nameLength;
  }
  if (cursor !== end || nextLocal !== start) fail('zip-overlay'); return files;
}
