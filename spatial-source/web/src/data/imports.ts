import { buildScene, requireValidDocument } from '../core';
import type { SpatialDocument } from '../types';
import { crc32, fail, MAX_ARCHIVE, sha256, stableJSON, strictJSON, utf8 } from './bytes';
import { readZIP } from './zip';

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('invalid-manifest'); return value as ObjectValue; }
function shape(value: ObjectValue, required: string[], optional: string[] = []): void {
  if (required.some(k => !Object.hasOwn(value, k)) || Object.keys(value).some(k => !required.includes(k) && !optional.includes(k))) fail('invalid-manifest-properties');
}
function array(value: unknown, min: number, max: number): unknown[] { if (!Array.isArray(value) || value.length < min || value.length > max) fail('invalid-manifest-array'); return value; }

/** Each existing profile retains its own vocabulary. Received SVG is never inserted into DOM. */
export function validateSVG(bytes: Uint8Array, profile: 'exchange' | 'drawing' = 'exchange'): void {
  let source: string; try { source = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('invalid-svg-encoding'); }
  const drawing = profile === 'drawing';
  const allowed: Record<string, string[]> = drawing ? {
    svg: ['xmlns', 'viewBox', 'role'], title: [], desc: [], rect: ['width', 'height', 'fill'],
    line: ['x1', 'x2', 'y1', 'y2', 'data-object-id', 'data-role', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap'],
    polygon: ['points', 'data-object-id', 'data-role', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray'],
    circle: ['cx', 'cy', 'r', 'data-object-id', 'data-role', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray'],
    text: ['x', 'y', 'font-family', 'font-size', 'fill', 'font-weight', 'data-object-id'], tspan: ['x', 'dy'],
  } : {
    svg: ['xmlns', 'viewBox', 'role'], title: [], desc: [], rect: ['x', 'y', 'width', 'height', 'fill'], polygon: ['points', 'fill'],
    line: ['x1', 'x2', 'y1', 'y2', 'stroke', 'stroke-width', 'stroke-linecap'], text: ['x', 'y', 'text-anchor', 'font-family', 'font-size', 'fill'],
  };
  const stack: string[] = []; let cursor = 0, roots = 0, elements = 0;
  const tokens = source.matchAll(/<[^>]*>/g);
  for (const match of tokens) {
    const text = source.slice(cursor, match.index), token = match[0]; cursor = match.index! + token.length;
    if (text.includes('<') || (!['text', 'title', 'desc', ...(drawing ? ['tspan'] : [])].includes(stack.at(-1) ?? '') && text.trim())) fail('invalid-svg-text');
    if (/&(?!(?:amp|lt|gt|quot|apos);|#\d+;|#x[0-9a-fA-F]+;)/.test(text) || utf8.encode(text).length > 100_000) fail('invalid-svg-entity');
    const closing = /^<\/([a-z]+)\s*>$/.exec(token);
    if (closing) { if (stack.pop() !== closing[1]) fail('invalid-svg-nesting'); continue; }
    const opening = /^<([a-z]+)([\s\S]*?)\/?\s*>$/.exec(token);
    if (!opening || !Object.hasOwn(allowed, opening[1]) || ++elements > 400_000) fail('unsafe-svg-element');
    const name = opening[1];
    if (!stack.length) { if (name !== 'svg' || ++roots !== 1) fail('invalid-svg-root'); }
    else if (!(stack.length === 1 && stack[0] === 'svg' && name !== 'svg' && name !== 'tspan') && !(drawing && stack.length === 2 && stack[0] === 'svg' && stack[1] === 'text' && name === 'tspan')) fail('invalid-svg-nesting');
    let attrs = opening[2].trim(), xmlns = false; const seen = new Set<string>();
    while (attrs) {
      const attr = /^([A-Za-z][A-Za-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')\s*/.exec(attrs);
      if (!attr) fail('invalid-svg-attribute');
      const key = attr[1], value = attr[2] ?? attr[3]; attrs = attrs.slice(attr[0].length);
      if (!allowed[name].includes(key) || seen.has(key) || /url\(|[<>]|&/i.test(value) || utf8.encode(value).length > (drawing ? 20_000 : 100_000)) fail('unsafe-svg-attribute'); seen.add(key);
      if (['fill', 'stroke'].includes(key) && !/^(?:#[a-fA-F0-9]{6}|white|none)$/.test(value) || key === 'font-family' && value !== 'system-ui,sans-serif' || key === 'role' && value !== 'img' || key === 'stroke-linecap' && !(drawing ? ['round'] : ['round', 'butt', 'square']).includes(value) || key === 'text-anchor' && !['start', 'middle', 'end'].includes(value) || key === 'font-weight' && value !== '600' || key === 'data-object-id' && !/^[A-Za-z0-9_-]{1,96}$/.test(value) || key === 'data-role' && !/^[a-z-]{1,32}$/.test(value)) fail('unsupported-svg-attribute');
      if (key === 'xmlns') { if (value !== 'http://www.w3.org/2000/svg') fail('invalid-svg-namespace'); xmlns = true; }
      if (['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'dy', 'width', 'height', 'font-size', 'stroke-width', 'stroke-dasharray', 'points', 'viewBox'].includes(key)) {
        const tokens = value.trim().split(/[\s,]+/), numbers = tokens.map(Number);
        if (tokens.some(t => !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(t)) || numbers.some(n => !Number.isFinite(n) || Math.abs(n) > 1_000_000)) fail('invalid-svg-number');
        if (key === 'viewBox' ? numbers.length !== 4 || numbers[2] <= 0 || numbers[3] <= 0 : key === 'points' ? numbers.length < 6 || numbers.length > 2000 || numbers.length % 2 !== 0 : key === 'stroke-dasharray' ? numbers.length > 2000 : numbers.length !== 1) fail('invalid-svg-number');
        if (['width', 'height', 'font-size', 'stroke-width', 'r'].includes(key) && numbers[0] < 0) fail('invalid-svg-number');
      }
    }
    if (name === 'svg' && !xmlns) fail('missing-svg-namespace');
    if (!/\/\s*>$/.test(token)) stack.push(name);
  }
  if (stack.length || roots !== 1 || source.slice(cursor).trim()) fail('invalid-svg-document');
}
export function validatePNG(bytes: Uint8Array): void {
  if (bytes.length < 57 || ![137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) fail('invalid-png');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let offset = 8, first = true, idat = false, end = false, chunks = 0;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset), type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    if (offset + 12 + length > bytes.length || crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== view.getUint32(offset + 8 + length)) fail('invalid-png-chunk');
    if (first) {
      if (type !== 'IHDR' || length !== 13) fail('invalid-png-header');
      const w = view.getUint32(offset + 8), h = view.getUint32(offset + 12);
      if (!w || !h || w > 8192 || h > 8192 || w * h > 16_000_000 || bytes[offset + 16] !== 8 || ![0, 2, 4, 6].includes(bytes[offset + 17]) || bytes[offset + 18] || bytes[offset + 19] || bytes[offset + 20]) fail('png-dimension-or-format-limit'); first = false;
    } else if (type === 'IHDR') fail('duplicate-png-header');
    else if (!['IDAT', 'IEND', 'cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB', 'bKGD', 'pHYs', 'tEXt', 'zTXt', 'iTXt', 'tIME', 'eXIf'].includes(type)) fail('unsupported-png-chunk');
    if (++chunks > 100_000) fail('png-chunk-limit');
    if (type === 'IDAT') idat = true;
    offset += 12 + length;
    if (type === 'IEND') { if (length || offset !== bytes.length || !idat) fail('invalid-png-end'); end = true; break; }
  }
  if (!end) fail('truncated-png');
}
export function validatePDF(bytes: Uint8Array): void {
  const source = new TextDecoder('latin1').decode(bytes);
  if (!source.startsWith('%PDF-1.') || !/%%EOF\s*$/.test(source)) fail('unsupported-pdf');
  // Preserve native conservative name admission, including PDF's #hex name escapes.
  const forbidden = new Set(['JavaScript', 'JS', 'Launch', 'OpenAction', 'AA', 'URI', 'EmbeddedFile', 'RichMedia', 'XFA', 'AcroForm', 'GoToR', 'GoToE', 'SubmitForm', 'ImportData', 'ObjStm', 'XRef', 'Encrypt', 'Filespec']);
  for (let cursor = 0; cursor < bytes.length; cursor++) {
    if (bytes[cursor] !== 47) continue;
    let name = ''; cursor++;
    while (cursor < bytes.length && ![0, 9, 10, 12, 13, 32, 40, 41, 60, 62, 91, 93, 123, 125, 47, 37].includes(bytes[cursor])) {
      const pair = String.fromCharCode(bytes[cursor + 1] ?? 0, bytes[cursor + 2] ?? 0);
      if (bytes[cursor] === 35 && /^[a-fA-F0-9]{2}$/.test(pair)) { name += String.fromCharCode(parseInt(pair, 16)); cursor += 3; }
      else name += String.fromCharCode(bytes[cursor++]);
      if (name.length > 256) break;
    }
    if (forbidden.has(name)) fail('unsupported-pdf-active-name');
    cursor--;
  }
}
function validateGLB(bytes: Uint8Array): void {
  if (bytes.length < 28) fail('invalid-glb');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), jsonLength = v.getUint32(12, true), binaryOffset = 20 + jsonLength;
  if (v.getUint32(0, true) !== 0x46546c67 || v.getUint32(4, true) !== 2 || v.getUint32(8, true) !== bytes.length || v.getUint32(16, true) !== 0x4e4f534a || jsonLength % 4 || binaryOffset + 8 > bytes.length || v.getUint32(binaryOffset + 4, true) !== 0x004e4942 || binaryOffset + 8 + v.getUint32(binaryOffset, true) !== bytes.length) fail('invalid-glb-chunks');
  const root = object(strictJSON(bytes.subarray(20, binaryOffset)));
  if (object(root.asset).version !== '2.0' || 'images' in root || 'textures' in root || 'extensionsRequired' in root || array(root.buffers, 1, 1).some(buffer => 'uri' in object(buffer))) fail('unsupported-glb-resources');
}
function compareScene(value: unknown, document: SpatialDocument, floorID: string): void {
  // A derivative may vary only within floating-point serialization precision. Never use it as truth.
  const equal = (a: unknown, b: unknown): boolean => {
    if (typeof a === 'number' && typeof b === 'number') return Number.isFinite(a) && Math.abs(a - b) <= 1e-8;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const aa = a as ObjectValue, bb = b as ObjectValue, keys = Object.keys(aa);
    return keys.length === Object.keys(bb).length && keys.every(key => Object.hasOwn(bb, key) && equal(aa[key], bb[key]));
  };
  if (!equal(value, buildScene(document, floorID))) fail('scene-geometry-mismatch');
}
export async function importDocument(bytes: Uint8Array, filename: string): Promise<SpatialDocument> {
  if (!bytes.length || bytes.length > MAX_ARCHIVE) fail('import-size-limit');
  if (/\.json$/i.test(filename)) return { ...requireValidDocument(strictJSON(bytes)), reviewState: 'needsReview' };
  if (!/\.zip$/i.test(filename)) fail('unsupported-import-format');
  const files = readZIP(bytes); if (!files['manifest.json'] || !files['geometry.json']) fail('missing-archive-members');
  const manifest = object(strictJSON(files['manifest.json'])), document = requireValidDocument(strictJSON(files['geometry.json']));
  if (manifest.documentID !== document.documentID || manifest.revision !== document.revision || manifest.measurementStatus !== 'unverified') fail('manifest-identity-mismatch');
  const local = manifest.profileVersion === 'auxilium-spatial-local-document/1.0.0';
  if (local) {
    shape(manifest, ['profileVersion', 'documentID', 'revision', 'measurementStatus', 'coordinateSystem', 'floors', 'files']);
    if (manifest.coordinateSystem !== document.coordinateSystem) fail('manifest-coordinate-mismatch');
    const floors = array(manifest.floors, 1, 100); if (floors.length !== document.floors.length) fail('manifest-floor-mismatch');
    floors.forEach((value, index) => {
      const item = object(value), floor = document.floors[index];
      shape(item, ['floorID', 'label', 'elevation', 'index', 'pageCount', 'representationStatus']);
      if (item.floorID !== floor.id || item.index !== index || item.label !== floor.label || item.elevation !== floor.elevation || !Number.isInteger(item.pageCount) || Number(item.pageCount) < 1 || Number(item.pageCount) > 500 || item.representationStatus !== (floor.walls.length || floor.rooms.length ? 'geometry' : 'empty')) fail('manifest-floor-mismatch');
    });
  } else {
    shape(manifest, ['formatVersion', 'documentID', 'revision', 'measurementStatus', 'contentClass', 'files']);
    if (manifest.formatVersion !== '1.0.0' || manifest.contentClass !== 'spatial-draft' || document.floors.length !== 1 || Object.keys(files).length !== 4) fail('unsupported-exchange-profile');
  }
  const records = array(manifest.files, local ? 5 : 3, local ? 4095 : 3), seen = new Set<string>();
  for (const value of records) {
    const item = object(value);
    shape(item, local ? ['path', 'mimeType', 'sha256', 'bytes'] : ['path', 'sha256', 'bytes'], local ? ['floorID', 'pageIndex'] : []);
    const path = String(item.path), data = files[path];
    if (typeof item.path !== 'string' || seen.has(path) || !data || item.bytes !== data.length || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256) || await sha256(data) !== item.sha256) fail('archive-byte-identity-mismatch');
    seen.add(path);
    if (local) {
      const match = /^floors\/(\d{4})\/(scene\.json|model\.glb|floorplan\.pdf|floorplan-(\d{4})\.(svg|png))$/.exec(path);
      if (path === 'geometry.json') { if (item.floorID !== undefined || item.pageIndex !== undefined || item.mimeType !== 'application/json') fail('invalid-geometry-record'); }
      else {
        if (!match) fail('unsupported-local-member');
        const floor = document.floors[Number(match[1])], floorRecord = object((manifest.floors as unknown[])[Number(match[1])]);
        if (!floor || item.floorID !== floor.id) fail('file-floor-mismatch');
        const expected = match[2] === 'scene.json' ? 'application/json' : match[2] === 'model.glb' ? 'model/gltf-binary' : match[2] === 'floorplan.pdf' ? 'application/pdf' : match[4] === 'svg' ? 'image/svg+xml' : 'image/png';
        if (item.mimeType !== expected || (match[3] !== undefined ? item.pageIndex !== Number(match[3]) || Number(match[3]) >= Number(floorRecord.pageCount) : item.pageIndex !== undefined)) fail('invalid-file-profile');
        if (match[2] === 'scene.json') compareScene(strictJSON(data), document, floor.id);
      }
    } else if (!['geometry.json', 'scene.json', 'floorplan.svg'].includes(path)) fail('unsupported-exchange-member');
    if (path.endsWith('.svg')) validateSVG(data, local ? 'drawing' : 'exchange');
    if (path.endsWith('.png')) validatePNG(data);
    if (path.endsWith('.glb')) validateGLB(data);
    if (path.endsWith('.pdf')) validatePDF(data);
  }
  if (seen.size + 1 !== Object.keys(files).length || !seen.has('geometry.json')) fail('unlisted-archive-members');
  if (local) for (let index = 0; index < document.floors.length; index++) {
    const base = `floors/${index.toString().padStart(4, '0')}/`, pages = Number(object((manifest.floors as unknown[])[index]).pageCount);
    if (!seen.has(`${base}scene.json`) || !seen.has(`${base}floorplan.pdf`)) fail('missing-floor-artifact');
    for (let page = 0; page < pages; page++) for (const ext of ['svg', 'png']) if (!seen.has(`${base}floorplan-${page.toString().padStart(4, '0')}.${ext}`)) fail('missing-floor-page');
  }
  else compareScene(strictJSON(files['scene.json']), document, document.floors[0].id);
  return { ...document, reviewState: 'needsReview' };
}
