import { jsPDF } from 'jspdf';
import { roomBoundary, wallPath } from '../core';
import type { Floor, FrozenRevision, Point2 } from '../types';
import { fail, utf8 } from './bytes';

const W = 1200, H = 900;
const xml = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
export interface DrawingLine { a: Point2; b: Point2; color: string; width: number; dashed?: boolean }
export interface DrawingLabel { point: Point2; text: string; size: number }
export interface Drawing { width: number; height: number; lines: DrawingLine[]; polygons: Point2[][]; labels: DrawingLabel[] }
const glyphWidth = (character: string, size: number) => size * (/^[\x20-\x7e\u00a0-\u00ff]$/.test(character) ? 0.85 : 1.2);
function wrap(text: string, width: number, size: number): string[] {
  const result: string[] = []; let line = '', used = 0;
  for (const character of text) {
    const advance = glyphWidth(character, size);
    if (character === '\n') { result.push(line); line = ''; used = 0; continue; }
    while (used + advance > width && line) {
      const wordBreak = line.lastIndexOf(' ') + 1, split = wordBreak > 0 && wordBreak < line.length ? wordBreak : line.length;
      result.push(line.slice(0, split)); line = line.slice(split); used = [...line].reduce((sum, value) => sum + glyphWidth(value, size), 0);
    }
    line += character; used += advance;
  }
  result.push(line); return result;
}
function pageHeader(frozen: FrozenRevision, floor: Floor): { page: Drawing; top: number } {
  const page: Drawing = { width: W, height: H, lines: [], polygons: [], labels: [] }; let top = 48;
  for (const text of wrap(frozen.document.title, 1072, 24)) { page.labels.push({ point: { x: 64, z: top }, text, size: 24 }); top += 29; }
  for (const text of wrap(floor.label, 1072, 18)) { page.labels.push({ point: { x: 64, z: top }, text, size: 18 }); top += 23; }
  page.labels.push({ point: { x: 64, z: 836 }, text: `Revision ${frozen.document.revision} · Unverified layout · Not for surveying`, size: 14 });
  wrap(`${frozen.document.documentID} · ${frozen.hash.slice(0, 16)}`, 1072, 11).forEach((text, i) => page.labels.push({ point: { x: 64, z: 863 + i * 14 }, text, size: 11 }));
  return { page, top: top + 25 };
}
export function drawings(frozen: FrozenRevision, floor: Floor): Drawing[] {
  const header = pageHeader(frozen, floor), output = header.page, contentHeight = 785 - header.top;
  const points = [...floor.nodes.map(n => n.point), ...(floor.areas ?? []).flatMap(a => a.polygon)];
  const extent = points.reduce((e, p) => ({ minX: Math.min(e.minX, p.x), maxX: Math.max(e.maxX, p.x), minZ: Math.min(e.minZ, p.z), maxZ: Math.max(e.maxZ, p.z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const { minX, maxX, minZ, maxZ } = points.length ? extent : { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
  const scale = Math.min(1040 / Math.max(maxX - minX, 1), contentHeight / Math.max(maxZ - minZ, 1));
  const map = (p: Point2): Point2 => ({ x: 80 + (1040 - (maxX - minX) * scale) / 2 + (p.x - minX) * scale, z: header.top + (contentHeight - (maxZ - minZ) * scale) / 2 + (p.z - minZ) * scale });
  const label = (text: string, x: number, z: number, size: number) => { output.labels.push({ point: { x, z }, text, size }); };
  const directory: string[] = [];
  for (let index = 0; index < floor.rooms.length; index++) {
    const room = floor.rooms[index];
    const boundary = roomBoundary(floor, room), polygon = boundary.map(map); output.polygons.push(polygon);
    if (polygon.length) {
      const center = polygon.reduce((sum, p) => ({ x: sum.x + p.x / polygon.length, z: sum.z + p.z / polygon.length }), { x: 0, z: 0 });
      const bounds = polygon.reduce((r, p) => ({ minX: Math.min(r.minX, p.x), maxX: Math.max(r.maxX, p.x), minZ: Math.min(r.minZ, p.z), maxZ: Math.max(r.maxZ, p.z) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
      const width = Math.max(30, Math.min(280, (bounds.maxX - bounds.minX) * 0.7));
      let chunks = wrap(room.label, width, 14);
      if (chunks.length * 18 > Math.min(100, (bounds.maxZ - bounds.minZ) * 0.55) || width < 60) {
        const reference = `R${index + 1}`; chunks = [reference]; directory.push(`${reference} (${room.id}): ${room.label}`);
      }
      chunks.forEach((chunk, i) => { const estimated = [...chunk].reduce((n, c) => n + glyphWidth(c, 14), 0); label(chunk, center.x - estimated / 2, center.z + (i - (chunks.length - 1) / 2) * 18, 14); });
    }
  }
  for (const wall of floor.walls) {
    const path = wallPath(floor, wall); let distance = 0;
    const openings = floor.openings.filter(o => o.wallID === wall.id).sort((a, b) => a.offset - b.offset);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      const at = (s: number) => map({ x: a.x + (b.x - a.x) * s / length, z: a.z + (b.z - a.z) * s / length });
      let start = 0;
      for (const opening of openings) {
        const from = Math.max(0, opening.offset - distance), to = Math.min(length, opening.offset + opening.width - distance);
        if (to <= 0 || from >= length || to <= from) continue;
        if (from > start) output.lines.push({ a: at(start), b: at(from), color: '#173344', width: 3, dashed: wall.provenance.origin === 'inferred' });
        if (opening.kind === 'window') output.lines.push({ a: at(from), b: at(to), color: '#3982a3', width: 1.5 });
        else output.lines.push({ a: at(from), b: at(to), color: '#7b9fae', width: 1, dashed: true });
        start = Math.max(start, to);
      }
      if (start < length) output.lines.push({ a: at(start), b: at(length), color: '#173344', width: 3, dashed: wall.provenance.origin === 'inferred' });
      distance += length;
    }
  }
  for (let index = 0; index < (floor.areas ?? []).length; index++) {
    const area = floor.areas![index];
    for (let i = 0; i < area.polygon.length; i++) output.lines.push({ a: map(area.polygon[i]), b: map(area.polygon[(i + 1) % area.polygon.length]), color: '#8f6b91', width: 1.5, dashed: true });
    if (area.polygon.length) { const p = map(area.polygon[0]); const reference = `A${index + 1}`; label(reference, Math.min(p.x + 5, 1080), p.z - 5, 13); directory.push(`${reference} (${area.id}), semantic area: ${area.label}`); }
  }
  if (!floor.walls.length) label('No captured or authored geometry on this floor', 320, 430, 18);
  if (!floor.rooms.length && floor.walls.length) label('Incomplete room boundaries: review and correct before use', 64, 793, 14);
  const pages = [output];
  if (directory.length) {
    label('Some labels are listed on the following directory pages.', 64, 810, 14);
    let page: Drawing | undefined, y = 0;
    for (const entry of directory) {
      const lines = wrap(entry, 1060, 16);
      for (const text of lines) {
        if (!page || y > 780) {
          if (pages.length >= 500) fail('drawing-page-limit');
          const next = pageHeader(frozen, floor); page = next.page; pages.push(page); y = next.top;
          page.labels.push({ point: { x: 64, z: y }, text: 'Label directory', size: 20 }); y += 32;
        }
        page.labels.push({ point: { x: 64, z: y }, text, size: 16 }); y += 22;
      }
      y += 10;
    }
  }
  return pages;
}
export function drawing(frozen: FrozenRevision, floor: Floor): Drawing { return drawings(frozen, floor)[0]; }
export function svgDrawing(frozen: FrozenRevision, floor: Floor, pageIndex = 0, prepared?: Drawing[]): Uint8Array {
  const d = (prepared ?? drawings(frozen, floor))[pageIndex]; if (!d) fail('drawing-page-not-found');
  return svgPages([d]);
}
/** A single-floor exchange retains its one SVG member, including every directory panel. */
export function svgFloorOverview(frozen: FrozenRevision, floor: Floor): Uint8Array { return svgPages(drawings(frozen, floor)); }
function svgPages(pages: Drawing[]): Uint8Array {
  const number = (n: number) => Number(n.toFixed(4)).toString();
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H * pages.length}" role="img">`, `<rect width="1200" height="${H * pages.length}" fill="#ffffff"/>`];
  for (let index = 0; index < pages.length; index++) {
  const d = pages[index], offset = index * H;
  for (const p of d.polygons) {
    if (p.length > 1000) fail('svg-polygon-capacity');
    parts.push(`<polygon points="${p.map(v => `${number(v.x)},${number(v.z + offset)}`).join(' ')}" fill="#eaf5fa"/>`);
  }
  for (const line of d.lines) {
    const length = Math.hypot(line.b.x - line.a.x, line.b.z - line.a.z);
    for (let p = 0; p < length; p += line.dashed ? 9 : length) {
      const end = line.dashed ? Math.min(p + 5, length) : length;
      const at = (s: number) => ({ x: line.a.x + (line.b.x - line.a.x) * s / length, z: line.a.z + (line.b.z - line.a.z) * s / length });
      const a = at(p), b = at(end);
      parts.push(`<line x1="${number(a.x)}" y1="${number(a.z + offset)}" x2="${number(b.x)}" y2="${number(b.z + offset)}" stroke="${line.color}" stroke-width="${line.width}"/>`);
    }
  }
  for (const label of d.labels) parts.push(`<text x="${number(label.point.x)}" y="${number(label.point.z + offset)}" font-size="${label.size}" font-family="system-ui,sans-serif" fill="#173344">${xml(label.text)}</text>`);
  }
  parts.push('</svg>'); return utf8.encode(parts.join(''));
}
/** Reject known missing-glyph output rather than exporting boxes as if labels were readable.
 * This is local canvas coverage checking, not a claim of exhaustive Unicode/font acceptance. */
function assertDrawingGlyphs(drawing: Drawing): void {
  const characters = new Set(drawing.labels.flatMap(label => [...label.text].filter(character => /[^\x20-\x7e\u00a0-\u00ff]/.test(character))));
  if (!characters.size) return;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  try {
    const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) fail('png-renderer-unavailable');
    context.font = '32px system-ui,sans-serif'; context.fillStyle = '#000000';
    const pixels = (text: string) => { context.clearRect(0, 0, 64, 64); context.fillText(text, 0, 45); return context.getImageData(0, 0, 64, 64).data; };
    const missing = ['\u0378', '\uffff', '\u{10ffff}'].map(pixels);
    for (const character of characters) {
      const sample = pixels(character);
      if (missing.some(reference => sample.every((value, index) => value === reference[index]))) fail('drawing-font-missing-glyphs: This browser cannot render every label. Use SVG or geometry export, or a browser with fonts for these characters.');
    }
  } finally { canvas.width = canvas.height = 0; }
}
export async function pngDrawing(frozen: FrozenRevision, floor: Floor, pageIndex = 0, prepared?: Drawing[]): Promise<Uint8Array> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') fail('png-requires-browser-renderer');
  const pages = prepared ?? drawings(frozen, floor), page = pages[pageIndex]; if (!page) fail('drawing-page-not-found');
  await document.fonts.ready; assertDrawingGlyphs(page);
  const svg = svgDrawing(frozen, floor, pageIndex, pages), url = URL.createObjectURL(new Blob([new Uint8Array(svg).buffer], { type: 'image/svg+xml' }));
  const canvas = document.createElement('canvas'); canvas.width = W * 2; canvas.height = H * 2;
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { image.src = ''; reject(new Error('png-render-timeout')); }, 15_000);
      image.onload = () => { clearTimeout(timer); resolve(); }; image.onerror = () => { clearTimeout(timer); reject(new Error('png-render-failed')); }; image.src = url;
    });
    const context = canvas.getContext('2d'); if (!context) fail('png-renderer-unavailable');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('png-encode-failed')), 'image/png'));
    if (blob.size > 32 * 1024 * 1024) fail('png-size-limit'); return new Uint8Array(await blob.arrayBuffer());
  } finally { URL.revokeObjectURL(url); canvas.width = 0; canvas.height = 0; }
}
export async function pdfDrawing(frozen: FrozenRevision, floors: Floor[]): Promise<Uint8Array> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [W, H], compress: true, putOnlyUsedFonts: true });
  pdf.setCreationDate("D:20000101000000+00'00'"); pdf.setFileId(frozen.hash.slice(0, 32));
  pdf.setProperties({ title: frozen.document.title, subject: `Unverified spatial layout. Source revision ${frozen.document.revision}. ${frozen.hash}`, creator: 'Auxilium Spatial', author: '' });
  let pageCount = 0;
  for (const floor of floors) {
    const pages = drawings(frozen, floor);
    if (pageCount + pages.length > 500) fail('drawing-page-limit');
    for (let index = 0; index < pages.length; index++) {
    if (pageCount++) pdf.addPage([W, H], 'landscape');
    const d = pages[index];
    if (d.labels.some(l => /[^\x20-\x7e\u00a0-\u00ff]/.test(l.text))) {
      // System-font rasterization preserves Unicode without shipping private or bundled font binaries.
      pdf.addImage(await pngDrawing(frozen, floor, index, pages), 'PNG', 0, 0, W, H); continue;
    }
    pdf.setFillColor('#eaf5fa');
    for (const polygon of d.polygons) if (polygon.length > 2) {
      const relative = polygon.slice(1).map((p, n) => [p.x - polygon[n].x, p.z - polygon[n].z]);
      pdf.lines(relative, polygon[0].x, polygon[0].z, [1, 1], 'F', true);
    }
    for (const line of d.lines) { pdf.setDrawColor(line.color); pdf.setLineWidth(line.width); pdf.setLineDashPattern(line.dashed ? [5, 4] : [], 0); pdf.line(line.a.x, line.a.z, line.b.x, line.b.z); }
    pdf.setTextColor('#173344');
    for (const label of d.labels) { pdf.setFontSize(label.size); pdf.text(label.text, label.point.x, label.point.z); }
    }
  }
  const bytes = new Uint8Array(pdf.output('arraybuffer'));
  // jsPDF 4.2.1 always emits a default view /OpenAction, with no public opt-out.
  // The native drawing profile disallows all OpenAction names. Remove only this
  // exact generated catalog default using equal-length whitespace, preserving
  // every xref offset and compressed stream. A library format change fails closed.
  const source = new TextDecoder('latin1').decode(bytes), catalogs = [...source.matchAll(/\/Type \/Catalog\n\/Pages \d+ 0 R\n(\/OpenAction \[3 0 R \/FitH null\])\n/g)];
  if (catalogs.length !== 1) fail('unsupported-generated-pdf-catalog');
  const catalog = catalogs[0], start = catalog.index! + catalog[0].indexOf(catalog[1]); bytes.fill(32, start, start + catalog[1].length);
  return bytes;
}
