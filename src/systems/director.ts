// L3 systems: monster director (spawn interval, alive cap, weighted pick, unseen far despawn, spawn position search).
// Spec: docs/architecture-monsters-ai-2.md §5 (director, findSpawn), §3 (mineral attractMul), §7 (ramp);
// docs/architecture-world-queries.md §6 (sampleSpawn). Must never import monsters.ts (layer rule, modules-systems §1).
// Escape table (B8): 1.2 s interval, cap 8, gap 220..340 from the player alone (the cave is lit), despawn 700, escape distance field.
// Never imports quake/rocks/combat/beacon.
import type { MonsterKind, State } from '../core/types.ts'
import { clamp } from '../core/math.ts'
import { rand, randRange } from '../core/rng.ts'
import { T, zt } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { circleHitsSolid } from '../world/collide.ts'
import { idx, inMap, TILE, worldToTile } from '../world/grid.ts'
import { exitDistAt, pathDistAt } from '../world/caches.ts'
import { insideLight, lightRadius } from './light.ts'

const KINDS: readonly MonsterKind[] = ['lurker', 'stalker', 'devourer'] // fixed pick order (spec §5)
const EPS = 1e-9 // R-127: accumulated-time thresholds compare x + EPS >= limit

// Up to T.director.spawnTries tries, 2 draws each (angle, gap), also after a hit so the draw count is fixed (as sampleSpawn).
// sampleSpawn cannot express the path-distance sanity rule |pathDist[tile] - pathDist[playerTile]| > ceil(r / 32) + 4 (it returns
// its first survivor before any caller test), so the whole loop is written here with the same draw order and solid test.
export function findSpawn(s: State, kind: MonsterKind): { x: number; y: number } | null {
  const esc = s.meta.phase === 'escape'
  const p = s.player, K = T.monsters[kind], [g0, g1] = esc ? T.escape.spawnGapPx : T.director.spawnGapPx
  const fieldAt = esc ? exitDistAt : pathDistAt // escape: tiles are ranked by the (rock-aware) exit field, descent by the entrance field
  const pTile = idx(s, worldToTile(p.x), worldToTile(p.y)), pDist = fieldAt(s, pTile)
  const R = esc ? 0 : lightRadius(s)
  let result: { x: number; y: number } | null = null
  for (let k = 0; k < T.director.spawnTries; k++) {
    const a = randRange(s, 'gameplay', 0, 2 * Math.PI), g = randRange(s, 'gameplay', g0, g1)
    if (result) continue
    const r = R + g
    const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r
    const tx = worldToTile(x), ty = worldToTile(y)
    if (!inMap(s, tx, ty) || circleHitsSolid(s, x, y, K.radiusPx) || (!esc && insideLight(s, x, y, K.radiusPx))) continue
    const d = fieldAt(s, idx(s, tx, ty))
    if (d < 0 || Math.abs(d - pDist) > Math.ceil(r / TILE) + 4) continue
    result = { x, y }
  }
  return result
}

export function stepDirector(s: State, dt: number): void {
  const esc = s.meta.phase === 'escape'
  if (!esc && s.meta.phase !== 'descent') return
  const p = s.player, dir = s.director, z = s.meta.zone
  const A = esc ? 1 : T.minerals.table[p.activeMineral].attractMul // minerals do nothing in escape
  const despawnPx = esc ? T.escape.despawnPx : T.director.despawnPx
  for (let i = s.monsters.length - 1; i >= 0; i--) { // silent despawn: not a kill, never in view
    const m = s.monsters[i]
    if (!m.seen && Math.hypot(m.x - p.x, m.y - p.y) > despawnPx) s.monsters.splice(i, 1)
  }
  dir.alive.lurker = dir.alive.stalker = dir.alive.devourer = 0
  let live = 0
  for (const m of s.monsters) if (m.ai !== 'dying') { dir.alive[m.kind] += 1; live += 1 }
  dir.spawnT -= dt
  if (dir.spawnT > EPS) return // R-127: <= EPS counts as elapsed
  dir.spawnT = esc ? T.escape.spawnIntervalS : zt(T.director.spawnIntervalS, z) / (A * (p.energy <= 0 ? T.director.flameOutSpawnMul : 1))
  if (live >= (esc ? T.escape.maxAlive : clamp(Math.round(zt(T.director.maxAlive, z) * A), 1, T.director.monstersMax))) return
  const w = KINDS.map(k => k === 'devourer' && dir.alive.devourer >= T.director.devourerMax ? 0 : zt(T.director.weights[k], z))
  let u = rand(s, 'gameplay') * w.reduce((a, b) => a + b, 0), pick = -1
  for (let i = 0; i < KINDS.length; i++) {
    if (w[i] <= 0) continue
    pick = i // a trailing positive weight also absorbs the u === sum edge
    if (u < w[i]) break
    u -= w[i]
  }
  if (pick < 0) return
  const pos = findSpawn(s, KINDS[pick])
  if (!pos) return
  spawnMonster(s, KINDS[pick], pos.x, pos.y, esc ? 0 : lightRadius(s))
  dir.alive[KINDS[pick]] += 1
}
