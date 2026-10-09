import { Capacitor, registerPlugin } from '@capacitor/core';
import { requireValidDocument } from './core';
import type { SpatialDocument } from './types';

export const captureBridgeVersion = '1.0.0';
interface NativeCapture {
  capabilities(options: { bridgeVersion: string }): Promise<{ bridgeVersion: string; available: boolean; reason?: string }>;
  capture(options: { bridgeVersion: string }): Promise<{ bridgeVersion: string; document: unknown; nativeSourceRetained: boolean }>;
}
const capture = registerPlugin<NativeCapture>('AuxiliumCapture');
export async function captureCapabilities(): Promise<{ available: boolean; reason?: string }> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') {
    return { available: false, reason: 'Room scanning is available in the installed iPhone app on supported LiDAR hardware. You can edit and navigate layouts here.' };
  }
  try {
    const result = await capture.capabilities({ bridgeVersion: captureBridgeVersion });
    if (result.bridgeVersion !== captureBridgeVersion || typeof result.available !== 'boolean') throw new Error('Incompatible capture bridge.');
    return { available: result.available, reason: result.reason };
  } catch (error) { return { available: false, reason: error instanceof Error ? error.message : 'Native capture is unavailable.' }; }
}
export async function captureRoom(): Promise<SpatialDocument> {
  const capabilities = await captureCapabilities();
  if (!capabilities.available) throw new Error(capabilities.reason ?? 'Native capture is unavailable.');
  const result = await capture.capture({ bridgeVersion: captureBridgeVersion });
  if (result.bridgeVersion !== captureBridgeVersion || result.nativeSourceRetained !== true) {
    throw new Error('The native capture did not confirm compatible, retained source. No layout was imported.');
  }
  return requireValidDocument(result.document);
}
