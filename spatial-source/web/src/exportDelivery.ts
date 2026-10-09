import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ExportArtifact } from './types';

interface NativeFiles {
  saveExport(options: { bridgeVersion: '1.0.0'; filename: string; mimeType: string; base64: string }): Promise<{ bridgeVersion: string; completed: boolean }>;
}
const nativeFiles = registerPlugin<NativeFiles>('AuxiliumFiles');
const MAX_BYTES = 32 * 1024 * 1024;
const extensions: Record<string, string> = {
  'application/json': 'json', 'application/zip': 'zip', 'image/svg+xml': 'svg',
  'model/gltf-binary': 'glb', 'application/pdf': 'pdf', 'image/png': 'png'
};
export function nativeExportFilename(filename: string, mimeType: string): string {
  const extension = extensions[mimeType];
  if (!extension) throw new Error('Unsupported export format.');
  const stem = filename.replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]/g, '_').replace(/^_+/, '').slice(0, 105);
  return `${stem || 'Auxilium-Spatial'}.${extension}`;
}
export async function saveExport(artifact: ExportArtifact): Promise<{ completed: boolean }> {
  if (!extensions[artifact.mimeType] || artifact.bytes.byteLength < 1 || artifact.bytes.byteLength > MAX_BYTES) {
    throw new Error('This export is unsupported or exceeds the 32 MiB delivery limit.');
  }
  if (Capacitor.isNativePlatform()) {
    if (Capacitor.getPlatform() !== 'ios') throw new Error('Native file delivery requires iOS.');
    let binary = '';
    for (let i = 0; i < artifact.bytes.length; i += 16384) binary += String.fromCharCode(...artifact.bytes.subarray(i, i + 16384));
    const result = await nativeFiles.saveExport({ bridgeVersion: '1.0.0',
      filename: nativeExportFilename(artifact.filename, artifact.mimeType), mimeType: artifact.mimeType, base64: btoa(binary) });
    if (result.bridgeVersion !== '1.0.0' || typeof result.completed !== 'boolean') throw new Error('Incompatible file delivery response.');
    return { completed: result.completed };
  }
  // Explicit user export only. Retain URL briefly because browser download capture is asynchronous.
  const url = URL.createObjectURL(new Blob([new Uint8Array(artifact.bytes)], { type: artifact.mimeType }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = nativeExportFilename(artifact.filename, artifact.mimeType);
  anchor.style.display = 'none'; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  // Browser confirms initiation, not that a user retained the resulting file.
  return { completed: true };
}
