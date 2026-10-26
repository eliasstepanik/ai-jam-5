// Native metadata for the delivered dressing. Checked against cave_tileset.json at build verification.
import { hash2 } from './noise.ts'
export type DressingDef = { name: string; w: number; h: number; ax: number; ay: number; layer: 'surface' | 'actor' | 'wall'; water: boolean }
export type DressingProp = { tile: number; def: number; x: number; y: number }
export type DressingCache = { key: string; props: DressingProp[]; cells: Map<number, DressingProp> }
export const CAVE_DRESSING: readonly DressingDef[] = [
  { name: 'ground_moss_patch_01', w: 48, h: 48, ax: 24, ay: 32, layer: 'surface', water: false },
  { name: 'ground_moss_patch_02', w: 48, h: 48, ax: 24, ay: 32, layer: 'surface', water: false },
  { name: 'ground_moss_patch_03', w: 48, h: 48, ax: 24, ay: 32, layer: 'surface', water: false },
  { name: 'ground_moss_patch_04', w: 48, h: 48, ax: 24, ay: 32, layer: 'surface', water: false },
  { name: 'wall_moss_drape_01', w: 32, h: 48, ax: 16, ay: 24, layer: 'wall', water: false },
  { name: 'wall_moss_drape_02', w: 32, h: 48, ax: 16, ay: 24, layer: 'wall', water: false },
  { name: 'wall_moss_drape_03', w: 32, h: 48, ax: 16, ay: 24, layer: 'wall', water: false },
  { name: 'wall_moss_drape_04', w: 32, h: 48, ax: 16, ay: 24, layer: 'wall', water: false },
  { name: 'ground_mushroom_amber_01', w: 32, h: 48, ax: 16, ay: 36, layer: 'actor', water: false },
  { name: 'ground_mushroom_amber_02', w: 32, h: 48, ax: 16, ay: 36, layer: 'actor', water: false },
  { name: 'ground_mushroom_amber_03', w: 32, h: 48, ax: 16, ay: 36, layer: 'actor', water: false },
  { name: 'ground_mushroom_bonnet_01', w: 32, h: 48, ax: 16, ay: 36, layer: 'actor', water: false },
  { name: 'ground_mushroom_bonnet_02', w: 32, h: 48, ax: 16, ay: 36, layer: 'actor', water: false },
  { name: 'ground_mushroom_bonnet_03', w: 32, h: 48, ax: 16, ay: 36, layer: 'actor', water: false },
  { name: 'wall_mushroom_shelf_01', w: 32, h: 48, ax: 16, ay: 24, layer: 'wall', water: false },
  { name: 'wall_mushroom_shelf_02', w: 32, h: 48, ax: 16, ay: 24, layer: 'wall', water: false },
  { name: 'wall_mushroom_shelf_03', w: 32, h: 48, ax: 16, ay: 24, layer: 'wall', water: false },
  { name: 'ground_mushroom_puffball_01', w: 32, h: 40, ax: 16, ay: 30, layer: 'actor', water: false },
  { name: 'ground_mushroom_puffball_02', w: 32, h: 40, ax: 16, ay: 30, layer: 'actor', water: false },
  { name: 'ground_roots_01', w: 48, h: 48, ax: 24, ay: 32, layer: 'surface', water: false },
  { name: 'ground_roots_02', w: 48, h: 48, ax: 24, ay: 32, layer: 'surface', water: false },
  { name: 'wall_root_network_01', w: 32, h: 48, ax: 16, ay: 24, layer: 'wall', water: false },
  { name: 'wall_root_network_02', w: 32, h: 48, ax: 16, ay: 24, layer: 'wall', water: false },
  { name: 'wall_root_network_03', w: 32, h: 48, ax: 16, ay: 24, layer: 'wall', water: false },
  { name: 'ground_mineral_crust_01', w: 32, h: 40, ax: 16, ay: 30, layer: 'actor', water: false },
  { name: 'ground_mineral_crust_02', w: 32, h: 40, ax: 16, ay: 30, layer: 'actor', water: false },
  { name: 'ground_mineral_crust_03', w: 32, h: 40, ax: 16, ay: 30, layer: 'actor', water: false },
  { name: 'ground_cave_fern_01', w: 32, h: 40, ax: 16, ay: 30, layer: 'actor', water: false },
  { name: 'ground_cave_fern_02', w: 32, h: 40, ax: 16, ay: 30, layer: 'actor', water: false },
  { name: 'ground_cave_fern_03', w: 32, h: 40, ax: 16, ay: 30, layer: 'actor', water: false },
  { name: 'ground_stalagmite_cluster_01', w: 32, h: 48, ax: 16, ay: 36, layer: 'actor', water: false },
  { name: 'ground_stalagmite_cluster_02', w: 32, h: 48, ax: 16, ay: 36, layer: 'actor', water: false },
  { name: 'ground_dry_leaves_01', w: 48, h: 40, ax: 24, ay: 28, layer: 'surface', water: false },
  { name: 'ground_dry_leaves_02', w: 48, h: 40, ax: 24, ay: 28, layer: 'surface', water: false },
  { name: 'ground_fallen_branch_01', w: 48, h: 40, ax: 24, ay: 28, layer: 'actor', water: false },
  { name: 'ground_fallen_branch_02', w: 48, h: 40, ax: 24, ay: 28, layer: 'actor', water: false },
  { name: 'wall_lichen_01', w: 32, h: 48, ax: 16, ay: 24, layer: 'wall', water: false },
  { name: 'wall_lichen_02', w: 32, h: 48, ax: 16, ay: 24, layer: 'wall', water: false },
  { name: 'ground_wet_gravel_01', w: 48, h: 40, ax: 24, ay: 28, layer: 'surface', water: false },
  { name: 'ground_wet_gravel_02', w: 48, h: 40, ax: 24, ay: 28, layer: 'surface', water: false },
  { name: 'ground_water_puddle_01', w: 32, h: 32, ax: 16, ay: 20, layer: 'surface', water: true },
  { name: 'ground_water_puddle_02', w: 48, h: 32, ax: 24, ay: 20, layer: 'surface', water: true },
  { name: 'ground_water_puddle_03', w: 48, h: 48, ax: 24, ay: 30, layer: 'surface', water: true },
  { name: 'ground_water_puddle_04', w: 48, h: 48, ax: 24, ay: 30, layer: 'surface', water: true },
  { name: 'ground_water_puddle_05', w: 48, h: 48, ax: 24, ay: 30, layer: 'surface', water: true },
  { name: 'ground_water_puddle_06', w: 32, h: 40, ax: 16, ay: 26, layer: 'surface', water: true },
  { name: 'ground_water_puddle_07', w: 64, h: 48, ax: 32, ay: 30, layer: 'surface', water: true },
  { name: 'ground_water_puddle_08', w: 64, h: 48, ax: 32, ay: 30, layer: 'surface', water: true },
  { name: 'ground_water_puddle_09', w: 64, h: 64, ax: 32, ay: 40, layer: 'surface', water: true },
  { name: 'ground_water_puddle_10', w: 72, h: 48, ax: 36, ay: 30, layer: 'surface', water: true },
]
export const GROUND_DRESSING = CAVE_DRESSING.filter(d => d.layer !== 'wall')
export const WALL_DRESSING = CAVE_DRESSING.filter(d => d.layer === 'wall')
// One candidate per 3x3 block, below 1 prop per 12 floor cells, with a jittered native-pixel anchor.
export function dressingAt(tiles: string, w: number, h: number, x: number, y: number, seed: number): number {
  if (x % 3 !== 1 || y % 3 !== 1 || hash2(x, y, seed ^ 0xdda0) >= 0.55) return -1
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= h || tiles[(y + dy) * w + x + dx] === '#') return -1
  }
  const def = GROUND_DRESSING[Math.floor(hash2(x, y, seed ^ 0xdda1) * GROUND_DRESSING.length)]
  return CAVE_DRESSING.indexOf(def)
}
export const dressingWall = (x: number, y: number, seed: number): DressingDef | null =>
  hash2(x, y, seed ^ 0xdda2) < 0.14 ? WALL_DRESSING[Math.floor(hash2(x, y, seed ^ 0xdda3) * WALL_DRESSING.length)] : null
export const dressingJitter = (x: number, y: number, seed: number): [number, number] =>
  [Math.floor(hash2(x, y, seed ^ 0xdda4) * 9) - 4, Math.floor(hash2(x, y, seed ^ 0xdda5) * 9) - 4]
