// Pure debug-map palette: the same entrance BFS distance/zone boundaries as gameplay.
import { depthOf, zoneOfDepth } from './score.ts'
export type MapMode = 'plain' | 'zones' | 'distance'
export type RGB = readonly [number, number, number]
export const MAP_ZONES: readonly RGB[] = [[65, 135, 240], [35, 185, 155], [235, 170, 45], [210, 65, 90]]
const BLACK: RGB = [0, 0, 0], WHITE: RGB = [255, 255, 255], UNREACHABLE: RGB = [45, 45, 55]
export function mapColor(mode: MapMode, solid: boolean, distance: number, beaconDistance: number): RGB {
  if (solid) return BLACK
  if (mode === 'plain') return WHITE
  if (distance < 0) return UNREACHABLE
  if (mode === 'zones') return MAP_ZONES[zoneOfDepth(depthOf(distance, beaconDistance)) - 1]
  const t = Math.max(0, Math.min(1, distance / Math.max(1, beaconDistance)))
  const a: RGB = t < 0.5 ? [35, 90, 255] : [250, 225, 60]
  const b: RGB = t < 0.5 ? [250, 225, 60] : [240, 45, 35], f = t < 0.5 ? t * 2 : (t - 0.5) * 2
  return a.map((c, i) => Math.round(c + (b[i] - c) * f)) as [number, number, number]
}
