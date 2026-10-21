// L0 core: the shape of the tuning object T (values live in tuning.ts). Types only, no runtime code.
// Spec: docs/architecture-tuning.md §1.1 (shape), architecture-modules-core.md §3.5 (split, C7/R-033).
// Applied rulings: R-056 (T.escape.rockIntervalS deleted, T.rocks added), R-131 (T.view / heightPx deleted),
// R-146 (T.player.hpMax), R-147 (T.escape.firstSpawnS), R-061 (T.hud.exitLookTiles),
// R-074 (T.escape.{frictionMul,attackSlots,chaseMul,interceptS,recoverS}, T.ai.{recoverBackPx,stalkerRetreatPx}),
// R-163 (T.cave.{pocketDepth,fallbackPocketDepth}).
import type { MonsterKind, FlameKind } from './types.ts'

export type Z4 = [number, number, number, number] // per zone 1..4, index zone-1

export type MonsterTune = {
  radiusPx: number; hp: number
  ringSpeedPxS: number; chaseSpeedPxS: number; steerPerS: number
  ringFactor: number; ringMarginPx: number; orbitRadS: number
  driftAmpPx: number; driftHz: number
  lungeChancePerS: Z4 // base hazard rate while eligible (lurker/devourer); stalker uses it while behind
  telegraphS: number // total windup (devourer: both beats)
  beats: number // 1 = single telegraph, 2 = devourer two-beat
  lungeRangePx: number // windup may start only if distance to player <= this
  contactS: number // planned lunge time to reach the player = PERFECT_AT[kind]
  biteSlackPx: number; lungeOverrunS: number
  recoverS: number; lungeCdS: [number, number]; lungeCdStartS: [number, number]
  energyHitE: number // flame energy removed by a hit while lit
  dyingS: number
  escapeStrikePx: number; escapeLeadS: number; escapeLungeCdS: [number, number]
}

export type MineralTune = {
  radiusMul: number; burnMul: number; attractMul: number
  perfectMul: number; lossMul: number; flickerMul: number
  core: string; mantle: string; deep: string; spark: string // hex colours
}

export type Tuning = {
  player: { radiusPx: number; walkPxS: number; accelPxS2: number; frictionPxS2: number; facingStart: number; hpMax: number }
  flame: {
    energyMax: number; burnPerS: Z4; radiusMinPx: number; radiusMaxPx: number; radiusOutPx: number
    curveExp: number; flickerAmp: number; flickerLowAmp: number; flickerLowBelowE: number
    flickerHzA: number; flickerHzB: number; flameHitInvulnS: number
  }
  resin: { smallE: number; largeE: number }
  plant: { healHp: number }
  pickup: { radiusPx: number }
  mining: { holdS: number; costPerS: number; reachPx: number; tickS: number }
  beacon: { holdS: number; costPerS: number; minStartE: number; minEnergyE: number; reachPx: number; flashS: number; shakeS: number; shakePx: number }
  minerals: { cap: number; table: Record<FlameKind, MineralTune> }
  swing: { arcDeg: number; reachPx: number; activeS: number; cooldownS: number; bufferS: number }
  parry: {
    perfectS: number; earlyMaxS: number; lateMaxS: number
    lossMinFrac: number; lossMaxFrac: number; lossExp: number; minSpanS: number; goodSplit: number
    hitstopS: number; flareS: number
  }
  roll: { durationS: number; speedPxS: number; invulnS: number; cooldownS: number }
  hurt: { hpInvulnS: number; flashS: number }
  monsters: Record<MonsterKind, MonsterTune>
  devourerLight: { pushMax: number; nearPx: number; farPx: number }
  director: {
    monstersMax: number; maxAlive: Z4; spawnIntervalS: Z4; weights: Record<MonsterKind, Z4>
    devourerMax: number; spawnGapPx: [number, number]; spawnTries: number
    despawnPx: number; flameOutSpawnMul: number; attackSlots: Z4; firstSpawnS: number
  }
  ai: {
    separationPx: number; separationPxS: number; stuckFrac: number; stuckNudgeS: number
    stuckRelocateS: number; fleeMul: number; eyeRangeExtraPx: number; darkLungeMul: number
    flameOutLungeMul: number; stalkerBehindDeg: number; stalkerArcPx: number; bonkS: number
    recoverBackPx: number; stalkerRetreatPx: number
  }
  escape: {
    sprintMul: number; accelPxS2: number; maxAlive: number; spawnIntervalS: number
    spawnGapPx: [number, number]; despawnPx: number
    rockWarnS: number; rocksMax: number; firstRockS: number; firstSpawnS: number
    quakeShakePx: number; winRadiusTiles: number
    frictionMul: number; attackSlots: number; chaseMul: number; interceptS: number; recoverS: number
  }
  rocks: {
    rateStart: number; rateEnd: number; rampS: number; minIntervalS: number; retryS: number
    pendingMax: number; p2Start: number; p2End: number; damageHp: number
    lookahead: number; routeModeP: number; lateralTiles: number; exitClearTiles: number
    beaconClearTiles: number; playerGapPx: number; detourMaxTiles: number; detourMaxFrac: number
    bfsTestsMax: number
  }
  hud: { exitLookTiles: number }
  cave: { pocketDepth: number; fallbackPocketDepth: number }
  cam: { lerpPerS: number; shakeMaxPx: number; shakeDecayS: number }
  shake: Record<'flameHit' | 'hpHit' | 'rockLand' | 'parryPerfect', { s: number; px: number }>
  score: { depthPts: number; winPts: number; timeCapS: number; mineralPts: number; hpPts: number }
}
