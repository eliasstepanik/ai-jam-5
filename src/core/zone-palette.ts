// Render palette target; gameplay depth/zone fields are unchanged. Fade is independent of frame rate.
import type { Zone } from './types.ts'
export const ZONE_PALETTE = [[1, 1, 1], [1, 1, 1], [0.83, 0.89, 1], [0.82, 1, 0.8], [0.94, 0.8, 1]] as const
export const fadeChannel = (from: number, to: number, dt: number): number => to + (from - to) * Math.exp(-3 * Math.max(0, dt))
export function fadePalette(rgb: number[], zone: Zone, dt: number): void {
  const target = ZONE_PALETTE[zone]
  for (let i = 0; i < 3; i++) rgb[i] = fadeChannel(rgb[i] ?? 1, target[i], dt)
}
