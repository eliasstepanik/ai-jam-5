import { heartFrames } from '../core/heart-ui.ts'
import type { HeartUi } from '../core/heart-ui.ts'
const ok = (value: boolean, why: string): void => { if (!value) throw new Error('heart UI: ' + why) }
export function run(): void {
  const c: HeartUi = { runId: -1, hp: 5, time: 0, lostAt: [] }
  const sample = (hp: number, t: number, run = 1): string => heartFrames(c, hp, 5, run, t).join('')
  ok(sample(5, 0) === '00000', 'five full hearts on a new run')
  ok(sample(4, 1) === '00002', 'only the newly lost heart breaks')
  ok(sample(4, 1.181) === '00001', 'broken frame becomes empty after 180ms')
  ok(sample(2, 2) === '00221', 'multi-heart loss animates both new slots without old empty slots')
  ok(sample(3, 2.05) === '00021', 'healing restores full hearts without replaying old losses')
  ok(sample(3, 2.2) === '00011', 'all depleted hearts settle to empty')
  ok(sample(5, 0, 2) === '00000', 'new run clears prior damage frames')
}
