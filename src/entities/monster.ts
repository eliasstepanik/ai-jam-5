import type { Monster, MonsterKind, State } from '../core/types.ts'
import { clamp } from '../core/math.ts'
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
  }
  s.monsters.push(m)
  return m
}

// Devourer light push, docs/architecture-monsters-ai-2.md §1 (moved here by MS-4 so systems/light.ts needs no slice-C file).
// Strongest nearby aura. Dying shades release smoothly over their death clip; never exceed the normal radius.
export function devourerMul(s: State): number {
  const p = s.player
  let strongest = 0
  for (const m of s.monsters) {
    if (m.kind !== 'devourer') continue
    const L = T.devourerLight
    const t = clamp((L.farPx - Math.hypot(m.x - p.x, m.y - p.y)) / (L.farPx - L.nearPx), 0, 1)
    const death = m.ai === 'dying' ? clamp(1 - m.aiT / T.monsters.devourer.dyingS, 0, 1) : 1
    strongest = Math.max(strongest, t * t * (3 - 2 * t) * death * death * (3 - 2 * death))
  }
  return 1 - T.devourerLight.pushMax * strongest
}
