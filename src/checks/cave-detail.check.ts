import { floorDetail, wallDetail, GROUND_DETAILS, WALL_DETAILS, detailStage } from '../core/cave-detail.ts'
const ok = (c: boolean, why: string): void => { if (!c) throw new Error('cave detail: ' + why) }
export function run(): void {
  // Sweep: depth = x / w, wet on even rows, a '#' wall column every 10 tiles (floor vines need wall-adjacent floor).
  const w = 100, h = 100
  let tiles = ''
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles += x % 10 === 0 ? '#' : '.'
  const floor = new Set<string>(), wall = new Set<string>()
  const band = (lo: number, hi: number) => ({ lo, hi, all: 0, vine: 0, rubble: 0 })
  const bands = [band(0, 0.1), band(0.35, 0.45), band(0, 0.3), band(0.7, 1)]
  let count = 0
  for (let seed = 1; seed <= 4; seed++) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const d = x / w, wet = y % 2 === 0
    const a = floorDetail(tiles, w, h, x, y, seed, d, wet), b = wallDetail(x, y, seed, d, wet)
    if (a) {
      floor.add(a)
      if (seed === 1) count++
      ok(a === floorDetail(tiles, w, h, x, y, seed, d, wet), 'deterministic shared chunk-border anchor')
      ok(!(d >= 0.7 && a.includes('vine')), 'no floor vine at depth >= 0.7')
      for (const k of bands) if (d >= k.lo && d < k.hi) { k.all++; if (a.includes('vine')) k.vine++; if (a.includes('rubble')) k.rubble++ }
    }
    if (b) { wall.add(b); ok(!(d >= 0.7 && b.includes('vine')), 'no wall vine at depth >= 0.7') }
  }
  ok(GROUND_DETAILS.every(n => floor.has(n)) && WALL_DETAILS.every(n => wall.has(n)), 'every supplied detail frame is reachable')
  // measured (seeds 1..4): 408, 414, 413, 427 floor details; bounds (333.3, 833.3) kept as the design pins them
  ok(count < w * h / 12 && count > w * h / 30, 'sparse ground density: ' + count)
  const [d0, d4, shallow, deep] = bands
  ok(d0.all > 0 && d4.all > 0 && d0.vine / d0.all > d4.vine / d4.all, 'vine share at depth 0 exceeds depth 0.4')
  ok(shallow.all > 0 && deep.all > 0 && deep.rubble / deep.all > shallow.rubble / shallow.all, 'rubble share rises with depth')
  ok(floorDetail(tiles, w, h, 52, 51, 1, 9) === floorDetail(tiles, w, h, 52, 51, 1, 1) && floorDetail(tiles, w, h, 52, 51, 1, -3) === floorDetail(tiles, w, h, 52, 51, 1, 0), 'depth is clamped to [0,1]')
  const corridor = '#'.repeat(10) + '.'.repeat(10) + '#'.repeat(10)
  for (let x = 1; x < 9; x++) ok(floorDetail(corridor, 10, 3, x, 1, 1, 0.5) === null, 'no detail in one-tile corridors')
  ok(detailStage(false, 100) === 0 && detailStage(true, 0) === 1 && detailStage(true, 20) === 2 && detailStage(true, 100) === 3, 'bounded progressive escape damage')
}
