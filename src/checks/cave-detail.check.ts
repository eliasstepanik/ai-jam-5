import { floorDetail, wallDetail, GROUND_DETAILS, WALL_DETAILS, detailStage } from '../core/cave-detail.ts'
const ok = (c: boolean, why: string): void => { if (!c) throw new Error('cave detail: ' + why) }
export function run(): void {
  const w = 100, h = 100, tiles = '.'.repeat(w * h), floor = new Set<string>(), wall = new Set<string>()
  let count = 0
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const a = floorDetail(tiles, w, h, x, y, 1, 4), b = wallDetail(x, y, 1)
    if (a) { floor.add(a); count++; ok(a === floorDetail(tiles, w, h, x, y, 1, 4), 'deterministic shared chunk-border anchor') }
    if (b) wall.add(b)
  }
  ok(GROUND_DETAILS.every(n => floor.has(n)) && WALL_DETAILS.every(n => wall.has(n)), 'every supplied detail frame is reachable')
  ok(count < w * h / 12 && count > w * h / 30, 'sparse ground density')
  const corridor = '#'.repeat(10) + '.'.repeat(10) + '#'.repeat(10)
  for (let x = 1; x < 9; x++) ok(floorDetail(corridor, 10, 3, x, 1, 1, 4) === null, 'no detail in one-tile corridors')
  ok(detailStage(false, 100) === 0 && detailStage(true, 0) === 1 && detailStage(true, 20) === 2 && detailStage(true, 100) === 3, 'bounded progressive escape damage')
}
