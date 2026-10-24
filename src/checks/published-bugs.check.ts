// Published bug regressions (#79, #120, #124). Render/menu pixels are exercised in the browser.
import { init } from '../core/state.ts'
import { fnv1a } from '../core/rng.ts'
import { WALK_STRIDE_PX } from '../core/gait.ts'
import { migrate } from '../core/migrate.ts'
import { clearCaches } from '../world/caches.ts'
import { generateCave } from '../world/generate.ts'
import { resolveIntent } from '../systems/intent.ts'
import { stepMovement } from '../systems/movement.ts'
import type { Input } from '../main.ts'

const ok = (v: boolean, why: string): void => { if (!v) throw new Error('published bugs: ' + why) }
const input = (keys: string[], x = 10, y = 10): Input => ({ keys: new Set(keys), pressed: new Set(), mouse: { x, y, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 } })

function facing(): void {
  const s = init(); s.player.x = s.cam.x = 300; s.player.y = s.cam.y = 300
  for (const [keys, angle] of [[['KeyD'], 0], [['KeyS'], Math.PI / 2], [['KeyA'], Math.PI], [['KeyW'], -Math.PI / 2], [['KeyD', 'KeyW'], -Math.PI / 4]] as const) {
    resolveIntent(s, input([...keys], 1, 1))
    ok(Math.abs(s.player.facing - angle) < 1e-9, 'movement faces travel while mouse points elsewhere')
    resolveIntent(s, input([...keys], 600, 300))
    ok(Math.abs(s.player.facing - angle) < 1e-9, 'moving mouse does not turn a walking player')
  }
  resolveIntent(s, input([], 600, 180))
  ok(s.player.facing === 0, 'standing descent still permits mouse aim')
  s.meta.phase = 'escape'; s.player.facing = 1
  resolveIntent(s, input([], 600, 180))
  ok(s.player.facing === 1, 'idle escape retains facing')
}

function gait(): void {
  const s = init(), w = 12, tiles = Array.from({ length: 12 }, (_, y) => y === 0 || y === 11 ? '#'.repeat(w) : '#..........#').join('')
  Object.assign(s.world, { w, h: 12, tiles, tilesHash: fnv1a(tiles) }); clearCaches()
  s.player.x = s.player.y = 200; s.debug.noclip = true
  for (let i = 0; i < 60; i++) {
    const x = s.player.x, phase = s.player.gaitPhase
    stepMovement(s, resolveIntent(s, input(['KeyD'])), 1 / 60)
    const distance = s.player.x - x
    ok(Math.abs(s.player.gaitSpeed - distance * 60) < 1e-8, 'animation speed uses real distance including map clamping')
    if (distance === 0) ok(s.player.gaitPhase === phase && s.player.gaitSpeed === 0, 'stationary noclip at map edge has no running-in-place animation')
  }
  const t = init(); Object.assign(t.world, s.world); t.player.x = t.player.y = 200
  t.debug.noclip = true; t.debug.speedMul = 1
  let walked = 0
  for (let i = 0; i < 30; i++) { const x = t.player.x; stepMovement(t, resolveIntent(t, input(['KeyD'])), 1 / 60); walked += t.player.x - x }
  ok(Math.abs(t.player.gaitPhase - walked / WALK_STRIDE_PX % 1) < 1e-8, 'normal walking phase matches distance divided by stride')
  const old = JSON.parse(JSON.stringify(t)); delete old.player.gaitSpeed
  ok(migrate(old).player.gaitSpeed === 0 && migrate(old).player.gaitPhase === t.player.gaitPhase, 'HMR fills measured speed without resetting animation phase')
}

function ore(): void {
  for (const depthClass of [1, 2, 3, 4]) for (const seed of [1, 7, 53]) {
    const cave = generateCave(seed, { depthClass })
    ok(cave.veins.length >= 8, 'ore quotas retained for every depth class')
    for (const vein of cave.veins) {
      ok(cave.tiles[vein.tile] === '#', 'ore is attached to a solid wall')
      ok(vein.stand === vein.tile + 320 && cave.tiles[vein.stand] !== '#', 'every ore has a visible south face and usable floor stand')
    }
  }
}

export function run(): void { facing(); gait(); ore() }
