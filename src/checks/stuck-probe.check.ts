// F1 stuck-probe baseline (issue #113 chunk 13): drives three real-cave runs headless and records the stuck-relocation
// rate as a baseline for the smarter-monsters work. Baseline only: asserts finiteness and that monsters spawned,
// no threshold (plan part 2 chunk 13). Setup mirrors flow.check.ts fresh() minus the spawnT = 1e9 line: the probe
// must see the director spawn normally. Deterministic: no clock, no RNG (scriptedInput only).
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'
import { scriptedInput } from './input.ts'

const DT = 1 / 60
const STEPS = 3000 // pre-D3t first spawn on seed 1 is step 179; 3000 keeps monsterSteps > 0 with margin
const SEEDS = [1, 2, 3]

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

function probe(seed: number): void {
  const seedStr = String(seed)
  const s = init()
  startRun(s, seedStr, caveOf(parseSeed(seedStr)))
  s.settings.loaded = true
  const relocates0 = s.director.relocates
  let monsterSteps = 0 // sum over steps of live monsters (the shade-time denominator)
  let minDist = Infinity // closest approach of any live monster to the player, px
  let firstSpawnStep = -1
  for (let k = 0; k < STEPS; k++) {
    step(s, scriptedInput(k), DT)
    monsterSteps += s.monsters.length
    if (firstSpawnStep < 0 && s.monsters.length > 0) firstSpawnStep = s.meta.steps
    for (const m of s.monsters) {
      const d = Math.hypot(m.x - s.player.x, m.y - s.player.y)
      if (d < minDist) minDist = d
    }
  }
  const relocates = s.director.relocates - relocates0
  const metric = relocates / (monsterSteps / 3600) // relocates per minute per shade (60 fps -> 3600 steps/min)
  console.log(
    `stuck-probe seed=${seed} relocates/min/shade=${metric.toFixed(3)} monsterSteps=${monsterSteps}` +
      ` firstSpawnStep=${firstSpawnStep} minDist=${minDist.toFixed(1)}`,
  )
  ok(Number.isFinite(metric), `seed ${seed}: metric not finite`)
  ok(monsterSteps > 0, `seed ${seed}: no monsters spawned within ${STEPS} steps`)
}

export function run(): void {
  for (const seed of SEEDS) probe(seed)
}
