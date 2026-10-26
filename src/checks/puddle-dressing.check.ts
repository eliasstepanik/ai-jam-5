import { CAVE_DRESSING, GROUND_DRESSING, WALL_DRESSING, dressingAt, dressingWall } from '../core/cave-props.ts'
import { createWaterFx, sampleWaterFoot, waterClock, waterInterior, RIPPLE_CAP } from '../core/puddle-fx.ts'
const ok = (value: boolean, why: string): void => { if (!value) throw new Error('puddle/dressing: ' + why) }
export function run(): void {
  const w = 180, tiles = '.'.repeat(w * w), found = new Set<string>(), walls = new Set<string>(); let count = 0
  for (let y = 1; y < w - 1; y++) for (let x = 1; x < w - 1; x++) {
    const n = dressingAt(tiles, w, w, x, y, 7), wall = dressingWall(x, y, 7)
    if (wall) walls.add(wall.name)
    if (n >= 0) { count++; found.add(CAVE_DRESSING[n].name); ok(n === dressingAt(tiles, w, w, x, y, 7), 'deterministic placement') }
  }
  ok(CAVE_DRESSING.length === 50 && CAVE_DRESSING.filter(d => d.water).length === 10, 'all supplied dressing/puddle metadata')
  ok(GROUND_DRESSING.every(d => found.has(d.name)) && WALL_DRESSING.every(d => walls.has(d.name)), 'every variant reachable')
  ok(count < w * w / 12 && count > w * w / 30, 'bounded sparse ground density')
  const narrow = '#'.repeat(9) + '.'.repeat(9) + '#'.repeat(9)
  for (let x = 0; x < 9; x++) ok(dressingAt(narrow, 9, 3, x, 1, 7) < 0, 'no props in narrow corridors')
  const data = new Uint8ClampedArray([73,71,56,255,73,71,56,255,73,71,56,255,45,41,35,255,73,71,56,0])
  ok(waterInterior(data).join() === '1,1,1,0,0', 'water interior excludes shore and transparency')
  const fx = createWaterFx(); waterClock(fx, 1, 0, true)
  for (let i = 0; i < 40; i++) sampleWaterFoot(fx, i, 0, 0, 1)
  waterClock(fx, 1, .1, true); waterClock(fx, 1, .2, true)
  for (let i = 0; i < 40; i++) sampleWaterFoot(fx, i, 9, 0, 1)
  ok(fx.ripples.length === RIPPLE_CAP, 'hard ripple cap recycles oldest wakes')
  const before = fx.ripples.length; sampleWaterFoot(fx, 39, 9, 0, 1)
  ok(fx.ripples.length === before, 'stationary feet never emit')
  const clock = fx.clock; waterClock(fx, 1, 10, false)
  ok(fx.clock === clock, 'pause freezes ripple life')
  sampleWaterFoot(fx, 39, 900, 0, 1)
  ok(fx.ripples.every(r => r.actor !== 39), 'teleport clears that actor trail without a splash line')
  waterClock(fx, 2, 0, true)
  ok(!fx.ripples.length && !fx.feet.size, 'new run clears water history')
  sampleWaterFoot(fx, -1, 0, 0, null); waterClock(fx, 2, .1, true); waterClock(fx, 2, .2, true); sampleWaterFoot(fx, -1, 20, 0, null)
  ok(!fx.ripples.length, 'dry ground never emits water ripples')
}
