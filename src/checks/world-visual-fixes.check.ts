// Pure regressions for the reported zone fade, doorway alignment and Devourer radius pulse.
import { init } from '../core/state.ts'
import { fadePalette } from '../core/zone-palette.ts'
import { spawnMonster } from '../entities/monster.ts'
import { damagePlayer } from '../systems/combat.ts'
import { flameRadius } from '../systems/light.ts'
import { entranceExit, entranceWall } from '../world/entrance-art.ts'
const ok = (c: boolean, why: string): void => { if (!c) throw new Error('world visuals: ' + why) }
export function run(): void {
  const rgb = [1, 1, 1], half = [1, 1, 1]
  fadePalette(rgb, 2, 1); fadePalette(half, 2, 0.5); fadePalette(half, 2, 0.5)
  ok(rgb.every((c, i) => Math.abs(c - half[i]) < 1e-12), 'palette fade independent of timestep')
  ok(rgb[0] > 0.83 && rgb[0] < 1, 'zone entry eases without an instant colour step')
  const before = rgb[0]; fadePalette(rgb, 1, 1 / 60)
  ok(rgb[0] > before && rgb[0] < 1, 'reversing zones continues smoothly from current colour')
  const s = init(); s.debug.freezeTorch = true
  const m = spawnMonster(s, 'devourer', 60, 0, flameRadius(s))
  const initialRadius = flameRadius(s), energy = s.player.energy
  damagePlayer(s, m)
  ok(s.player.energy === energy, 'Freeze Torch retains energy through the actual bite')
  ok(Math.abs(flameRadius(s) - initialRadius) < 1e-12, 'bite/death cannot instantly expand the circle')
  const previous = flameRadius(s)
  for (let i = 1; i <= 48; i++) {
    m.aiT = i / 60
    const k = flameRadius(s)
    ok(k === previous, 'hit and death never grow the radius')

  }
  s.monsters = []
  ok(flameRadius(s) === previous, 'removing the dead attacker cannot grow the radius')
  const hit = init(), base = flameRadius(hit)
  const attacker = spawnMonster(hit, 'devourer', 60, 0, base)
  damagePlayer(hit, attacker)
  ok(hit.player.energy < hit.player.energyMax && flameRadius(hit) < base, 'normal hit only drains fuel and shrinks radius')
  for (const distance of [20, 80, 120, 200, 300]) {
    attacker.x = hit.player.x + distance
    ok(flameRadius(hit) < base, 'enemy position/death cannot add radius')
  }
  s.world.w = 12; s.world.h = 12; s.world.tiles = '#'.repeat(48) + ('#..........#').repeat(7) + '#'.repeat(12)
  s.world.entrance = { tx: 5, ty: 6 }; s.world.exit = { ...s.world.entrance }
  const wall = entranceWall(s), exit = entranceExit(s)
  ok(wall !== null && exit.ty === wall.ty + 1 && exit.tx === wall.tx, 'exit first floor tile below doorway')
  ok(s.world.tiles[(exit.ty + 3) * 12 + exit.tx] === '.', 'spawn three tiles in front is clear')
}
