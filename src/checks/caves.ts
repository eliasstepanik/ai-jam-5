// Check helper (no asserts, not a *.check.ts file, so all.ts never runs it): caveOf(seed) memoises generateCave(seed) so the cave,
// rocks and world checks generate each seed once (SAE4 §1.10, MW §4 caves.ts row). Callers must not mutate the shared result.
import type { CaveResult } from '../core/types.ts'
import { generateCave } from '../world/generate.ts'
import { paramsOf } from '../world/gen/params.ts'

// ponytail: unbounded Map keyed by (class - 3) * 2^32 + (seed >>> 0), so class 3 keeps the plain seed key; about 62 entries x ~80 kB per
// check run and class. Add an LRU if checks ever loop over 1000s of seeds.
const memo = new Map<number, CaveResult>()

// depthClass is rounded and clamped to 1..4 by paramsOf (default 3, R-164).
export function caveOf(seed: number, depthClass: number = 3): CaveResult {
  const seedKey = seed >>> 0, cls = paramsOf(depthClass).depthClass, key = (cls - 3) * 2 ** 32 + seedKey
  let res = memo.get(key)
  if (!res) { res = generateCave(seedKey, { depthClass: cls }); memo.set(key, res) }
  return res
}

// Seeds the memo with an already generated result (timeBudget's timed run); same sharing rule as caveOf.
export function primeCave(seed: number, r: CaveResult): void { memo.set(seed >>> 0, r) }
