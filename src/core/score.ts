// L0 core: depth metric, score formula, DEFAULT_BEST and DEFAULT_RESULT.
// Spec: docs/architecture-scoring-and-save.md §1/§2/§5/§6, architecture-modules-core.md §3.8, R-006, R-007, R-031 (weights from T.score).
// Pure: no state, no DOM, no clock. trackDepth lives in src/systems/depth.ts, storage in src/core/storage.ts.
import type { Best, RunResult, ScoreInput, ScoreParts, Zone } from './types.ts'
import { T } from './tuning.ts'

export const DEPTH_MAX = 40

// Normalised path distance 0..DEPTH_MAX. dist <= 0 (entrance, or -1 = unreachable) and beaconDist <= 0 give 0;
// dist beyond beaconDist clamps to DEPTH_MAX.
export function depthOf(dist: number, beaconDist: number): number {
  if (dist <= 0 || beaconDist <= 0) return 0
  return Math.floor((DEPTH_MAX * Math.min(dist, beaconDist)) / beaconDist)
}

// 0-9 -> 1, 10-19 -> 2, 20-29 -> 3, 30-40 -> 4.
// ponytail: spec formula verbatim; defined for depth 0..DEPTH_MAX (negative depth would give a non-Zone), callers pass depthOf output.
export function zoneOfDepth(depth: number): Zone {
  return Math.min(4, 1 + Math.floor(depth / 10)) as Zone
}

// score = depth*100 + (win ? 1000 : 0) + (win ? max(0, 600 - seconds) : 0) + minerals*25 + hp*50; weights come from T.score (C8).
export function computeScore(i: ScoreInput): ScoreParts {
  const w = T.score
  const p = {
    depth: i.depth * w.depthPts,
    win: i.won ? w.winPts : 0,
    time: i.won ? Math.max(0, w.timeCapS - i.seconds) : 0,
    minerals: i.mineralsUsed * w.mineralPts,
    hp: i.hpLeft * w.hpPts,
  }
  return { ...p, total: p.depth + p.win + p.time + p.minerals + p.hp }
}

// Literal from scoring-and-save §6. State.best is null until a run is saved; this is the fill() template.
export const DEFAULT_BEST: Best = { v: 1, score: 0, depth: 0, seconds: 0, won: false, mineralsUsed: 0, hpLeft: 0, seedText: '', at: '' }

// §5: every field zero/false/'', zone 1, parts all 0. State.result is null until a run ends; this is the fill() template.
export const DEFAULT_RESULT: RunResult = {
  won: false, depth: 0, zone: 1, seconds: 0, mineralsUsed: 0, hpLeft: 0,
  parts: { depth: 0, win: 0, time: 0, minerals: 0, hp: 0, total: 0 },
  seed: 0, seedText: '', kills: 0, parries: 0, perfectParries: 0,
  isNewBest: false, prevBest: 0, endAt: 0,
}
