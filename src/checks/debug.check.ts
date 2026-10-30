// Developer tools regression checks: independent cheats, grounded collision recovery, actual spawns, and kill override.
// L0-L3 only; UI pointer capture, overlays, statistics and exported-build access are browser-verified.
import { entranceExit } from '../world/entrance-art.ts'
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { migrate } from '../core/migrate.ts'
import { mapColor, MAP_ZONES } from '../core/debug-map.ts'
import { fnv1a } from '../core/rng.ts'
import { T } from '../core/tuning.ts'
import { clearCaches } from '../world/caches.ts'
import { circleHitsSolid } from '../world/collide.ts'
import { debugAction, debugSpawn, debugForceLeap, setDebugValue, torchSeconds, DEBUG_TOGGLES } from '../systems/debug.ts'
import { debugTeleport, debugBearing } from '../systems/debug-navigation.ts'
import { playerHitsSolid } from '../world/player-collide.ts'
import { beaconInReach } from '../world/beacon-position.ts'
import { stepFlame } from '../systems/flame.ts'
import { damagePlayer, hurtPlayerHp, resolveParries } from '../systems/combat.ts'
import { resolveIntent } from '../systems/intent.ts'
import type { Intent } from '../systems/intent.ts'
import { stepMovement } from '../systems/movement.ts'
import { stepMining } from '../systems/mining.ts'
import { stepBeacon } from '../systems/beacon.ts'
import { lightRadius } from '../systems/light.ts'
import { stepMonsters } from '../systems/monsters.ts'
import { spawnMonster } from '../entities/monster.ts'

const ok = (v: boolean, msg: string): void => { if (!v) throw new Error('debug check: ' + msg) }
const input = { keys: new Set<string>(), pressed: new Set<string>(), mouse: { x: 256, y: 256, down: false }, clicks: [], view: { w: 512, h: 512, dpr: 1 } }

function room(): State {
  const s = init(), w = 24, h = 24
  const tiles = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) =>
    x === 0 || y === 0 || x === w - 1 || y === h - 1 || x === 12 ? '#' : '.').join('')).join('')
  Object.assign(s.world, { w, h, tiles, tilesHash: fnv1a(tiles), explored: new Array(18).fill(0), entrance: { tx: 2, ty: 2 }, beacon: { tx: 6, ty: 6 }, beaconDist: 500 })
  s.meta.screen = 'playing'; s.meta.runId = 1; s.settings.loaded = true
  s.player.x = s.player.y = 200; s.cam.x = s.cam.y = 200
  clearCaches()
  return s
}

function cheats(): void {
  const s = room(), p = s.player
  debugAction(s, 'infiniteHp'); p.energy = 50
  stepFlame(s, 1)
  ok(p.energy < 50 && p.hp === p.hpMax, 'infinite HP does not freeze torch drain')
  ok(!hurtPlayerHp(s, 'rock') && p.hp === p.hpMax, 'infinite HP blocks rocks')
  p.energy = 0
  const bite = spawnMonster(s, 'lurker', p.x + 30, p.y, 100)
  bite.ai = 'lunge'; damagePlayer(s, bite)
  ok(p.hp === p.hpMax && String(bite.ai) === 'recover', 'unlit bite cannot hurt immortal player')
  p.energy = 50; bite.ai = 'lunge'; damagePlayer(s, bite)
  ok(p.energy === 50 - T.monsters.lurker.energyHitE, 'lit bites still consume flame with infinite HP')

  debugAction(s, 'freezeTorch'); p.energy = 50; p.hurtT = 0
  stepFlame(s, 60)
  ok(p.energy === 50, 'frozen torch does not passively burn')
  const attacker = spawnMonster(s, 'stalker', p.x + 30, p.y, 100)
  attacker.ai = 'lunge'; damagePlayer(s, attacker)
  ok(p.energy === 50 && String(attacker.ai) === 'dying', 'frozen torch still defeats a biting shade without fuel loss')
  p.hurtT = 0; p.swing.active = true; p.swing.dir = 0
  const parried = spawnMonster(s, 'lurker', p.x + 32, p.y, 100)
  parried.ai = 'lunge'; parried.aiT = T.monsters.lurker.contactS + 0.08
  resolveParries(s)
  ok(String(parried.ai) === 'dying' && p.energy === 50 && p.stats.parries === 1, 'frozen torch keeps parries functional without costs')
  p.x = 368; p.y = 208
  s.veins = [{ id: 100, mineral: 'copper', tile: 6 * 24 + 12, stand: 6 * 24 + 11, pieces: 1 }]
  const it: Intent = { ...resolveIntent(s, input), moving: false, interact: true, interactEdge: true }
  stepMining(s, it, 1 / 60)
  ok(p.mining.progress > 0 && p.energy === 50, 'frozen torch permits mining without energy loss')
  s.world.beacon = { tx: 11, ty: 6 }
  stepBeacon(s, it, 1 / 60, p.energy)
  ok(p.beaconHold > 0 && p.energy === 50, 'frozen torch permits Beacon hold without energy loss')
  debugAction(s, 'extinguish'); stepFlame(s, 60)
  ok(p.energy === 0 && p.beaconHold === 0 && p.mining.targetTile === -1, 'extinguish remains out while drain is frozen')
  debugAction(s, 'refill')
  ok(p.energy === p.energyMax && s.fx.events.some(e => e.kind === 'relight'), 'refill relights a frozen torch')
  debugAction(s, 'freezeTorch'); debugAction(s, 'infiniteHp'); p.hurtT = 0
  ok(hurtPlayerHp(s, 'rock') && p.hp === p.hpMax - 1, 'HP damage resumes when immortality is off')
}

function movementAndSpawn(): void {
  const s = room(), p = s.player
  p.x = 354; p.y = 200
  const it = resolveIntent(s, { ...input, keys: new Set(['KeyD']) })
  for (let i = 0; i < 45; i++) stepMovement(s, it, 1 / 60)
  ok(p.x <= 374 + 1e-6, 'ordinary movement is blocked by the wall')
  debugAction(s, 'noclip'); p.x = 354
  for (let i = 0; i < 30; i++) stepMovement(s, it, 1 / 60)
  ok(p.x > 416 && p.vx === 4 * T.player.walkPxS, 'noclip crosses the wall at four times walk speed')
  p.x = 400
  debugAction(s, 'noclip')
  ok(!s.debug.noclip && !circleHitsSolid(s, p.x, p.y, T.player.radiusPx), 'turning noclip off in rock recovers to clear floor')
  p.x = p.y = 200
  for (const kind of ['lurker', 'stalker', 'devourer'] as const) {
    ok(debugSpawn(s, kind), 'can spawn ' + kind)
    const m = s.monsters.at(-1)!
    ok(m.kind === kind && !circleHitsSolid(s, m.x, m.y, T.monsters[kind].radiusPx), kind + ' fits its real collision radius')
  }
  ok(new Set(s.monsters.map(m => m.id)).size === 3, 'spawn ids remain unique')
  const before = lightRadius(s)
  debugAction(s, 'noFog')
  ok(lightRadius(s) === before, 'visual fog toggle leaves AI light radius unchanged')
  s.meta.screen = 'title'
  ok(!debugSpawn(s, 'lurker'), 'enemy spawning is disabled outside a run')
}

function forcedLeap(): void {
  for (const kind of ['lurker', 'stalker', 'devourer'] as const) {
    const s = room(), p = s.player
    const m = spawnMonster(s, kind, p.x + 110, p.y, 100)
    m.seen = true; m.ai = 'stunned'; m.stunned = 10; m.lungeCd = 99; m.fleeing = true; m.contactT = 0.1
    s.debug.freezeAi = true
    debugAction(s, 'forceLeap')
    ok(String(m.ai) === 'lunge' && m.aiT === 0 && m.contactT === -1 && m.vx < 0 && Math.abs(m.vy) < 1e-6, kind + ' immediately leaps toward player')
    ok(!s.debug.freezeAi && !m.stunned && !m.fleeing && !m.lungeCd, 'force leap overrides frozen AI and attack restrictions')
    ok(s.fx.events.some(e => e.kind === 'lunge'), 'forced leap emits the real attack event')
    const before = m.x
    stepMonsters(s, 1 / 60)
    ok(m.x < before, kind + ' advances through the normal attack pipeline')
  }
  const s = room(), p = s.player
  const dead = spawnMonster(s, 'lurker', p.x + 30, p.y, 100); dead.ai = 'dying'; dead.seen = true
  const hidden = spawnMonster(s, 'lurker', p.x + 50, p.y, 100); hidden.seen = false
  const blocked = spawnMonster(s, 'stalker', 500, p.y, 100); blocked.seen = true
  const far = spawnMonster(s, 'lurker', p.x + 120, p.y, 100); far.seen = true
  const near = spawnMonster(s, 'stalker', p.x, p.y + 90, 100); near.seen = true
  ok(debugForceLeap(s) && near.ai === 'lunge' && far.ai !== 'lunge' && blocked.ai !== 'lunge', 'only nearest living enemy in clear sight attacks')
  near.ai = far.ai = 'dying'; s.debug.freezeAi = true
  ok(!debugForceLeap(s) && s.debug.freezeAi, 'no suitable enemy leaves AI freeze unchanged')
  s.meta.screen = 'title'
  ok(!debugForceLeap(s), 'force leap disabled outside a run')
}

function navigation(): void {
  const s = room(), p = s.player
  s.world.exit = { tx: 3, ty: 2 }
  p.energy = 43; p.hp = 2; p.vx = 100; p.vy = 50
  p.roll.t = 0.2; p.roll.invuln = 0.2; p.swing.active = true; p.swing.buffer = 0.1
  p.mining.targetTile = 99; p.mining.progress = 1; p.beaconHold = 2
  debugAction(s, 'teleportBeacon')
  ok(!playerHitsSolid(s, p.x, p.y, T.player.radiusPx) && beaconInReach(s, T.beacon.reachPx) && s.cam.x === p.x && s.cam.y === p.y, 'Beacon teleport lands beside solid base, in reach, with centred camera')
  ok(p.hp === 2 && p.energy === 43 && !s.world.beaconLit, 'teleport preserves health/fuel and does not light Beacon')
  ok(p.vx === 0 && p.vy === 0 && !p.roll.t && !p.roll.invuln && !p.swing.active && !p.swing.buffer && !p.beaconHold && p.mining.targetTile === -1, 'teleport cancels transient movement and interactions')
  s.meta.screen = 'paused'
  debugAction(s, 'teleportEntrance', input.view)
  const doorway = entranceExit(s), ex = doorway.tx * 32 + 16, ey = doorway.ty * 32 + 16
  ok(p.x === ex && p.y === ey && s.cam.x === p.x && s.cam.y === p.y && s.meta.screen === 'paused', 'paused entrance teleport centres camera immediately')
  s.world.beacon = { tx: 12, ty: 6 }
  ok(debugTeleport(s, 'beacon') && !circleHitsSolid(s, p.x, p.y, T.player.radiusPx), 'blocked landmark falls back to clear floor')
  s.rocks = [{ id: 900, x: ex, y: ey, size: 1, tiles: [doorway.ty * s.world.w + doorway.tx], t: 2, landed: true, hit: true, shrunk: false }]
  s.world.solidSig++
  ok(debugTeleport(s, 'entrance') && !circleHitsSolid(s, p.x, p.y, T.player.radiusPx) && (p.x !== ex || p.y !== ey), 'teleport avoids a landed rock')
  const oldX = p.x
  s.meta.screen = 'title'
  ok(!debugTeleport(s, 'beacon') && p.x === oldX, 'teleport disabled outside a run')
  s.world.beacon = { tx: 6, ty: 6 }; p.x = 176; p.y = 208
  debugAction(s, 'arrowBeacon')
  let b = debugBearing(s)
  ok(s.debug.arrow && s.debug.arrowTarget === 'beacon' && b.angle === 0 && b.distance === 32, 'Beacon option enables direct east bearing')
  p.x = 208; p.y = 176; b = debugBearing(s)
  ok(b.angle === Math.PI / 2 && b.distance === 32, 'bearing tracks player movement south toward target')
  p.y = 208
  ok(debugBearing(s).distance === 0, 'arrival has zero distance')
  debugAction(s, 'arrowExit')
  b = debugBearing(s)
  ok(String(s.debug.arrowTarget) === 'exit' && b.angle === Math.atan2(80 - 208, 112 - 208), 'exit choice uses cave exit landmark')
  debugAction(s, 'minimap')
  const old = JSON.parse(JSON.stringify(s)); delete old.debug.arrow; delete old.debug.arrowTarget
  const restored = migrate(old)
  ok(!restored.debug.arrow && restored.debug.arrowTarget === 'beacon' && restored.debug.minimap, 'new navigation defaults fill without resetting map preference')
}

function mapLayers(): void {
  const s = room(), before = JSON.stringify({ world: s.world, rng: s.rng, player: s.player })
  for (const key of ['mapOres', 'mapResin', 'mapPlants', 'mapEntrance', 'mapBeacon'] as const) {
    const was = s.debug[key]; debugAction(s, key); ok(s.debug[key] !== was, key + ' toggles independently')
  }
  debugAction(s, 'mapZones'); ok(s.debug.mapMode === 'zones' && s.debug.minimap, 'zones selects one enabled map mode')
  debugAction(s, 'mapDistance'); ok(String(s.debug.mapMode) === 'distance', 'distance replaces zones')
  debugAction(s, 'mapPlain'); ok(String(s.debug.mapMode) === 'plain', 'plain terrain can be restored')
  ok(JSON.stringify({ world: s.world, rng: s.rng, player: s.player }) === before, 'map options cannot change gameplay')
  const old = JSON.parse(JSON.stringify(s)); delete old.debug.mapMode; delete old.debug.mapOres
  ok(migrate(old).debug.mapMode === 'plain' && !migrate(old).debug.mapOres && migrate(old).debug.minimap, 'HMR fills map defaults and keeps map visibility')
  for (const mode of ['plain', 'zones', 'distance'] as const) ok(mapColor(mode, true, 25, 100).join() === '0,0,0', 'walls stay black in ' + mode)
  ok(mapColor('plain', false, -1, 100).join() === '255,255,255', 'plain floor stays white')
  for (const [d, zone] of [[0, 0], [24, 0], [25, 1], [50, 2], [75, 3], [100, 3]]) ok(mapColor('zones', false, d, 100).join() === MAP_ZONES[zone].join(), 'map zones match depth boundaries')
  ok(mapColor('distance', false, 0, 100).join() === '35,90,255' && mapColor('distance', false, 100, 100).join() === '240,45,35', 'heatmap spans entrance blue to Beacon red')
  ok(mapColor('distance', false, 200, 100).join() === mapColor('distance', false, 100, 100).join(), 'branch distances clamp at Beacon heat')
  ok(mapColor('distance', false, -1, 100).join() === '45,45,55', 'unreachable floor is distinct')
}

function vizToggles(): void {
  const s = init()
  ok(s.debug.aiViz === false && s.debug.wispViz === false, 'AI behavior and wisp guide overlays default off')
  for (const id of ['aiViz', 'wispViz'] as const) {
    ok((DEBUG_TOGGLES as readonly string[]).includes(id), id + ' is a generic debug toggle')
    debugAction(s, id); ok(s.debug[id] === true, id + ' turns on')
    debugAction(s, id); ok(s.debug[id] === false, id + ' turns off')
  }
  s.debug.aiViz = true; s.debug.wispViz = true
  const old = JSON.parse(JSON.stringify(s)); delete old.debug.aiViz; delete old.debug.wispViz
  const restored = migrate(old)
  ok(restored.debug.aiViz === false && restored.debug.wispViz === false, 'hot reload fills overlay defaults off')
  ok(JSON.stringify(migrate(restored)) === JSON.stringify(restored), 'overlay migration remains idempotent')
}

export function run(): void { mapLayers();
  cheats(); movementAndSpawn(); navigation(); forcedLeap(); vizToggles()
  const s = room()
  setDebugValue(s, 'torch', 0.5)
  ok(s.player.energy === 50 && torchSeconds(s) === 100, 'torch slider controls remaining duration at current burn')
  setDebugValue(s, 'torch', NaN)
  ok(s.player.energy === 50, 'non-finite slider input cannot poison State')
  setDebugValue(s, 'torch', 2); setDebugValue(s, 'speed', 1)
  ok(s.player.energy === s.player.energyMax && s.debug.speedMul === 10, 'slider values are bounded')
  const old = JSON.parse(JSON.stringify(s)); delete old.debug.noclip; delete old.debug.speedMul
  const restored = migrate(old)
  ok(!restored.debug.noclip && restored.debug.speedMul === 4 && restored.debug.noFog === s.debug.noFog, 'hot reload fills new debug fields while preserving existing choices')
  ok(JSON.stringify(migrate(restored)) === JSON.stringify(restored), 'debug migration remains idempotent')
  s.debug.god = true; s.debug.infiniteHp = true
  debugAction(s, 'kill')
  ok(s.player.hp === 0 && s.meta.screen === 'dead' && s.result?.won === false, 'kill command bypasses all immortality and ends the run')
}
