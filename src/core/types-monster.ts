// L0 core: monster TYPES only, split out of types.ts to keep that file under the 300-line cap.
// Type-only import back from types.ts (a type-only cycle is legal); no runtime code, no value exports.
// Same rules as types.ts: JSON-only state, all-string unions, and a new field also needs its default in
// spawnMonster and in DEFAULT_MONSTER (migrate.ts).
import type { MonsterKind } from './types.ts'

export type MonsterAi = 'ring' | 'stalk' | 'windup' | 'lunge' | 'recover' | 'stunned' | 'dying'
export type Awareness = 'unaware' | 'suspicious' | 'hunting' | 'searching'
export type Monster = {
  id: number
  kind: MonsterKind
  x: number; y: number // world px, centre
  vx: number; vy: number // px/s
  hp: number // int, 1 for all kinds
  ai: MonsterAi
  aiT: number // s ELAPSED in the current ai state
  aiDur: number // s planned length of the state (0 = open-ended)
  beat: number // int, 0-based beat INDEX during windup (R-130)
  ringAngle: number // rad
  ringRadius: number // px, current preferred distance from the player
  orbitDir: number // +1 or -1
  lungeDir: number // rad, locked at lunge start (R-069)
  lungeCd: number // s until this shade may start another windup
  stunned: number // s of stun left
  seen: boolean // inside the light this step
  contactT: number // s, lunge time of the bite latch; -1 = none
  stuckT: number // s blocked by a wall
  behindT: number // s a stalker has spent behind the player
  lastX: number; lastY: number // px, position at the previous step (swept bite test, R-066)
  fleeing: boolean // latched between trigger and exit of the light
  // Issue #113 smarter monsters. Required: DEFAULT_MONSTER (migrate.ts) and spawnMonster (entities/monster.ts) carry them.
  awareness: Awareness // perception state; default 'hunting' (old behaviour)
  detectionTimer: number // s, one perception meter: unaware/suspicious = fill 0..noticeT; hunting = s left before losing track (0..loseT)
  lastKnownX: number // px, where the player was last sensed
  lastKnownY: number // px
  searchT: number // s of the search budget used while 'searching'
  homeX: number // px, spawn position, patrol anchor
  homeY: number // px
  patrolX: number // px, current patrol target
  patrolY: number // px
  patrolT: number // s; >0 pausing, <0 walk budget left (counts up to 0), 0 = pick next point
  retreatT: number // s of retreat left (flame is strong)
  facing: number // rad, view-cone direction
  stalkT: number // s, stalk-commit timer
  stalkAngle: number // rad, committed stalk approach angle
  suspectT: number // s spent suspicious (bounded by T.ai.suspectMaxS)
  patience: number // s of eligibility since the last windup (forces a windup at T.monsters[kind].patienceS)
}
