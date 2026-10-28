// L0 core: the tuning VALUES (shape: tuning-types.ts). Spec: docs/architecture-tuning.md §2-§7, tuning-2.md §1-§7,
// scale-and-economy-2/-3 (economy overrides), rulings R-056/R-061/R-074/R-146/R-147, architecture-rocks.md §1-§4.
// Read T at the point of use, never copy it into State (except player max values, R-146). Nobody assigns into T.
import type { Tuning, Z4 } from './tuning-types.ts'

export type { Tuning } from './tuning-types.ts'

export const T = {
  player: { radiusPx: 10, walkPxS: 120, accelPxS2: 900, frictionPxS2: 1100, facingStart: Math.PI / 2, hpMax: 5 },
  flame: {
    energyMax: 100, burnPerS: [0.5, 0.7, 1.0, 1.4], // burn: scale-and-economy-2 §2 (binding)
    radiusMinPx: 40, radiusMaxPx: 170, radiusOutPx: 22,
    curveExp: 0.5, flickerAmp: 0.03, flickerLowAmp: 0.1, flickerLowBelowE: 25,
    flickerHzA: 7.3, flickerHzB: 11.1, flameHitInvulnS: 0.4,
  },
  resin: { smallE: 25, largeE: 50 },
  plant: { healHp: 1 },
  pickup: { radiusPx: 14 },
  mining: { holdS: 2.0, costPerS: 3.0, reachPx: 40, tickS: 0.5 },
  beacon: {
    holdS: 5.0, costPerS: 4.0, minStartE: 40, minEnergyE: 1, reachPx: 36,
    flashS: 1.2, shakeS: 1.0, shakePx: 8, // R-147
  },
  minerals: {
    cap: 3,
    table: {
      none: {
        radiusMul: 1.0, burnMul: 1.0, attractMul: 1.0, perfectMul: 1.0, lossMul: 1.0, flickerMul: 1.0,
        core: '#fff4d6', mantle: '#ff8a1e', deep: '#c2410c', spark: '#5ab0ff',
      },
      sodium: {
        radiusMul: 1.5, burnMul: 2.0, attractMul: 1.6, perfectMul: 1.6, lossMul: 0.6, flickerMul: 1.2,
        core: '#ffffff', mantle: '#ffe14a', deep: '#f5b700', spark: '#6a5cff',
      },
      copper: {
        radiusMul: 1.0, burnMul: 1.0, attractMul: 1.0, perfectMul: 1.0, lossMul: 1.0, flickerMul: 0.8,
        core: '#e8fff9', mantle: '#1fd6b8', deep: '#0e8f9c', spark: '#ff5c7a',
      },
      strontium: {
        radiusMul: 0.7, burnMul: 1.0, attractMul: 0.5, perfectMul: 1.0, lossMul: 1.0, flickerMul: 0.9,
        core: '#ffe0e0', mantle: '#e0182d', deep: '#8a0a1e', spark: '#3dffb0',
      },
    },
  },
  swing: { arcDeg: 120, reachPx: 56, activeS: 0.15, cooldownS: 0.5, bufferS: 0.1 },
  parry: {
    perfectS: 0.055, earlyMaxS: 0.18, lateMaxS: 0.12,
    lossMinFrac: 0.15, lossMaxFrac: 0.8, lossExp: 1.5, minSpanS: 0.02, goodSplit: 0.5,
    hitstopS: 0.06, flareS: 0.35,
  },
  roll: { durationS: 0.3, speedPxS: 420, invulnS: 0.3, cooldownS: 1.0 },
  hurt: { hpInvulnS: 0.8, flashS: 0.25 },
  monsters: {
    lurker: {
      radiusPx: 9, hp: 1,
      ringSpeedPxS: 70, chaseSpeedPxS: 95, steerPerS: 6,
      ringFactor: 1.0, ringMarginPx: 14, orbitRadS: 0.35,
      driftAmpPx: 12, driftHz: 0.25,
      lungeChancePerS: [0.03, 0.04, 0.05, 0.06],
      patienceS: [6.0, 5.5, 5.0, 4.5], // s eligible before a forced windup; 0 = kind not spawned in that zone
      telegraphS: 0.55, beats: 1, lungeRangePx: 260, contactS: 0.2,
      biteSlackPx: 4, lungeOverrunS: 0.25,
      recoverS: 0.8, lungeCdS: [3, 5], lungeCdStartS: [2, 4],
      energyHitE: 12, dyingS: 0.5,
      escapeStrikePx: 140, escapeLeadS: 0.15, escapeLungeCdS: [0.8, 1.6],
    },
    stalker: {
      radiusPx: 14, hp: 1,
      ringSpeedPxS: 85, chaseSpeedPxS: 130, steerPerS: 5,
      ringFactor: 1.1, ringMarginPx: 20, orbitRadS: 0.6,
      driftAmpPx: 10, driftHz: 0.2,
      lungeChancePerS: [0, 0.5, 0.6, 0.7],
      patienceS: [0, 4.0, 3.5, 3.0], // counts only while the behind gate holds
      telegraphS: 0.55, beats: 1, lungeRangePx: 280, contactS: 0.24,
      biteSlackPx: 4, lungeOverrunS: 0.3,
      recoverS: 1.2, lungeCdS: [2.5, 4], lungeCdStartS: [3, 5],
      energyHitE: 20, dyingS: 0.5,
      escapeStrikePx: 160, escapeLeadS: 0.2, escapeLungeCdS: [1.0, 1.8],
    },
    devourer: {
      radiusPx: 30, hp: 1,
      ringSpeedPxS: 35, chaseSpeedPxS: 45, steerPerS: 2,
      ringFactor: 0.85, ringMarginPx: 30, orbitRadS: 0.15,
      driftAmpPx: 6, driftHz: 0.1,
      lungeChancePerS: [0, 0, 0.25, 0.3],
      patienceS: [0, 0, 5.0, 4.5],
      telegraphS: 0.8, beats: 2, lungeRangePx: 150, contactS: 0.3,
      biteSlackPx: 6, lungeOverrunS: 0.3,
      recoverS: 1.5, lungeCdS: [4, 6], lungeCdStartS: [3, 5],
      energyHitE: 35, dyingS: 0.8,
      escapeStrikePx: 130, escapeLeadS: 0.1, escapeLungeCdS: [2, 3],
    },
  },
  devourerLight: { pushMax: 0.35, nearPx: 80, farPx: 260 },
  director: {
    monstersMax: 24, maxAlive: [3, 5, 6, 7], spawnIntervalS: [4, 3.5, 3, 2.5], // scale-and-economy-3 §2.1
    weights: {
      lurker: [1.0, 0.6, 0.45, 0.35],
      stalker: [0, 0.4, 0.4, 0.35],
      devourer: [0, 0, 0.15, 0.3],
    },
    devourerMax: 1, spawnGapPx: [135, 280], spawnTries: 48, // floor 135 = light radius 170 + gap keeps full-flame descent spawns outside nearRadius 300; ceiling 280 keeps first spawn early
    despawnPx: 560, flameOutSpawnMul: 1.5, attackSlots: [1, 1, 2, 2], firstSpawnS: 3,
    nearCap: 2, // max monsters allowed inside nearRadius of the player (count)
    nearRadius: 300, // px, distance from player that counts as "near"
    calmS: 6, // s, calm-down window after a retreat before spawning near again
  },
  ai: {
    separationPx: 8, separationPxS: 60, stuckFrac: 0.3, stuckNudgeS: 0.5,
    stuckRelocateS: 2.5, fleeMul: 1.4, eyeRangeExtraPx: 220, darkLungeMul: 1.0,
    flameOutLungeMul: 2.5, stalkerBehindDeg: 110, stalkerArcPx: 0, bonkS: 0.25,
    recoverBackPx: 40, stalkerRetreatPx: 60, // R-074
    viewRange: 260, // px, sight range (> max ring)
    viewHalfAngle: 1.2, // rad, sight cone half angle (~69 deg)
    noticeT: 0.6, // s, detection fill time
    noticeLitMarginPx: 80, // px, lit player noticed within lightRadius + this (line of sight, cone ignored)
    suspectMaxS: 2.0, // s, max time suspicious before hunting
    hearRadius: 90, // px, hearing radius
    hearSpeed: 60, // px/s, player speed needed to be heard
    loseT: 1.0, // s, hunting without sensing before searching
    searchT: 6, // s, total search budget (walk + wait)
    patrolRadius: 160, // px, patrol range around home
    patrolSpeedMul: 0.5, // x K.ringSpeedPxS while patrolling
    patrolPauseT: 1.5, // s, pause at each patrol point
    retreatT: 5, // s, retreat duration
    retreatSpeedMul: 1, // x K.ringSpeedPxS while retreating
    flameRetreat: 80, // flame energy (0-100) above which near monsters retreat
    stalkCommitT: 0.8, // s, stalker commits to a chosen angle
    flowWindow: 40, // tiles, Chebyshev half-width of the flow field window
    flowStuckT: 0.25, // s, stuck time before flow-field fallback (< stuckNudgeS)
  },
  escape: {
    sprintMul: 2.0, accelPxS2: 1800, maxAlive: 10, spawnIntervalS: 0.9, // playtest-tuning-1 §4 (supersedes economy-3 §2.1)
    spawnGapPx: [220, 340], despawnPx: 700,
    spawnAheadTiles: [8, 14], spawnAheadP: 0.75, // playtest-tuning-1 §4: 75% of escape spawns block the exit route 8-14 tiles ahead
    rockWarnS: 0.9, rocksMax: 260, firstRockS: 1.5, firstSpawnS: 1.0, // rocksMax 260: playtest-tuning-1 §4 (supersedes economy-3 §3); firstSpawnS: R-147
    quakeShakePx: 2, winRadiusTiles: 1,
    frictionMul: 2, attackSlots: 3, chaseMul: 1.3, interceptS: 0.3, recoverS: 0.4, // R-074
  },
  rocks: {
    rateStart: 1.0, rateEnd: 2.4, rampS: 60, minIntervalS: 0.3, retryS: 0.25, // playtest-tuning-1 §4 (supersedes economy-3 §3)
    pendingMax: 6, p2Start: 0.25, p2End: 0.5, damageHp: 1,
    lookahead: 36, routeModeP: 0.9, lateralTiles: 1, exitClearTiles: 5,
    beaconClearTiles: 6, playerGapPx: 16, detourMaxTiles: 12, detourMaxFrac: 0.5,
    bfsTestsMax: 5,
  },
  hud: { exitLookTiles: 4 }, // R-061
  cave: { pocketDepth: 10, fallbackPocketDepth: 5 }, // R-163
  cam: { lerpPerS: 8, shakeMaxPx: 12, shakeDecayS: 0.35 },
  shake: {
    flameHit: { s: 0.25, px: 5 },
    hpHit: { s: 0.35, px: 8 },
    rockLand: { s: 0.3, px: 6 },
    parryPerfect: { s: 0.12, px: 3 },
  },
  score: { depthPts: 100, winPts: 1000, timeCapS: 600, mineralPts: 25, hpPts: 50 },
} satisfies Tuning

export const zt = (v: Z4, zone: number): number => v[Math.min(4, Math.max(1, zone)) - 1]
export const deg = (d: number): number => (d * Math.PI) / 180
