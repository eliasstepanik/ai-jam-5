// Pure regressions for the reported zone fade, doorway alignment and Devourer radius pulse.
import { init } from '../core/state.ts'
import { fadePalette } from '../core/zone-palette.ts'
import { devourerMul, spawnMonster } from '../entities/monster.ts'
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
  const compressed = flameRadius(s), energy = s.player.energy
  damagePlayer(s, m)
  ok(s.player.energy === energy, 'Freeze Torch retains energy through the actual bite')
  ok(Math.abs(flameRadius(s) - compressed) < 1e-12, 'bite/death cannot instantly expand the circle')
  let previous = devourerMul(s)
  for (let i = 1; i <= 48; i++) {
    m.aiT = i / 60
    const k = devourerMul(s)
    ok(k >= previous && k <= 1, 'death release is monotonic and bounded')
    ok(k - previous < 0.012, 'no single-frame release pulse')
    previous = k
  }
  ok(previous === 1, 'radius returns to its correct unsuppressed size')
  s.world.w = 12; s.world.h = 12; s.world.tiles = '#'.repeat(48) + ('#..........#').repeat(7) + '#'.repeat(12)
  s.world.entrance = { tx: 5, ty: 6 }; s.world.exit = { ...s.world.entrance }
  const wall = entranceWall(s), exit = entranceExit(s)
  ok(wall !== null && exit.ty === wall.ty + 1 && exit.tx === wall.tx, 'exit first floor tile below doorway')
  ok(s.world.tiles[(exit.ty + 3) * 12 + exit.tx] === '.', 'spawn three tiles in front is clear')
}
