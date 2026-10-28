import type { Monster, MonsterKind, State } from '../core/types.ts'
import { rand, randRange } from '../core/rng.ts'
import { T } from '../core/tuning.ts'

// The caller supplies lightRadius(s), keeping L2 independent of L3 light queries.
export function spawnMonster(s: State, kind: MonsterKind, x: number, y: number, lightR: number): Monster {
  const K = T.monsters[kind], id = s.meta.nextId++
  const m: Monster = {
    id, kind, x, y, vx: 0, vy: 0, hp: K.hp,
    ai: kind === 'stalker' ? 'stalk' : 'ring', aiT: 0, aiDur: 0, beat: 0,
    ringAngle: Math.atan2(y - s.player.y, x - s.player.x),
    ringRadius: lightR * K.ringFactor + K.ringMarginPx
      + K.driftAmpPx * Math.sin(2 * Math.PI * K.driftHz * s.meta.time + id),
    orbitDir: rand(s, 'gameplay') < 0.5 ? -1 : 1,
    lungeDir: 0, lungeCd: randRange(s, 'gameplay', ...K.lungeCdStartS),
    stunned: 0, seen: false, contactT: -1, stuckT: 0, behindT: 0,
    lastX: x, lastY: y, fleeing: false,
    // Issue #113 perception fields; the director sets 'unaware' for its spawns (no RNG here).
    awareness: 'hunting', detectionTimer: 0, lastKnownX: 0, lastKnownY: 0, searchT: 0,
    homeX: x, homeY: y, patrolX: 0, patrolY: 0, patrolT: 0, retreatT: 0, facing: 0, stalkT: 0, stalkAngle: 0,
  }
  s.monsters.push(m)
  return m
}
