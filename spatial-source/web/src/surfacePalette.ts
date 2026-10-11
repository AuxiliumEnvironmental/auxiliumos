/** Intended sRGB presentation colors, independent of Three, React and the document schema. */
export const SURFACE_COLORS = Object.freeze({ wall: '#F2F3F5', floor: '#B8BDC4', ceiling: '#D5D9DE' });
export type StructuralSurfaceRole = keyof typeof SURFACE_COLORS;
export const STRUCTURAL_EDGE_COLOR = '#68717C';
export const SELECTED_SURFACE_FACTOR = 0.92;
type LinearRGB = readonly [number, number, number];

/** Fail explicitly until a new emitter's material handling is deliberately implemented. */
export function structuralSurfaceRole(role: string): StructuralSurfaceRole {
  switch (role) {
    case 'wall': case 'floor': case 'ceiling': return role;
    default: throw new Error(`Unsupported structural surface role: ${role}`);
  }
}

export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** Linear RGB for vertex colors and glTF baseColorFactor, never raw sRGB bytes. */
export function hexToLinearRGB(hex: string): LinearRGB {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error('Expected a six-digit sRGB color');
  return Object.freeze([srgbToLinear(parseInt(hex.slice(1, 3), 16) / 255), srgbToLinear(parseInt(hex.slice(3, 5), 16) / 255), srgbToLinear(parseInt(hex.slice(5, 7), 16) / 255)]);
}

const linear = { wall: hexToLinearRGB(SURFACE_COLORS.wall), floor: hexToLinearRGB(SURFACE_COLORS.floor), ceiling: hexToLinearRGB(SURFACE_COLORS.ceiling) };
export function surfaceLinearRGB(role: StructuralSurfaceRole, selected = false): LinearRGB {
  const color = linear[role];
  return selected ? [color[0] * SELECTED_SURFACE_FACTOR, color[1] * SELECTED_SURFACE_FACTOR, color[2] * SELECTED_SURFACE_FACTOR] : color;
}
