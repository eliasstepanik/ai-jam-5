// L1 data manifest. Catalog counts are procedural fallback defaults, not source-sheet limits.
export type Anim = {
  readonly n: number; readonly fps: number; readonly loop: boolean
  readonly torchTips?: readonly (readonly [number, number])[]
}
export type SpriteDef = {
  readonly w: number; readonly h: number; readonly px: number; readonly py: number
  readonly r?: number; readonly pri: 0 | 1 | 2
  readonly anims: Readonly<Record<string, Anim>>
}

// Source rows: north first. Angle selection remains e,se,s,sw,w,nw,n,ne in render.
export const SHEET_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
export type Direction = typeof SHEET_DIRECTIONS[number]
export const ACTOR_FRAME = 64
export const ACTOR_SHEET_HEIGHT = ACTOR_FRAME * SHEET_DIRECTIONS.length
const anim = (n: number, fps = 0, loop = false): Anim => ({ n, fps, loop })
const player = { idle: anim(4, 4, true), walk: anim(4, 10, true), swing: anim(4, 20),
  roll: anim(4, 16), hurt: anim(2, 12), death: anim(6, 8) }
const shade = { idle: anim(4, 8, true), telegraph: anim(2, 6), lunge: anim(3, 16), death: anim(6, 12) }
const devourer = { idle: anim(4, 6, true), telegraph_a: anim(2, 6), telegraph_b: anim(2, 8), lunge: anim(3, 12), death: anim(8, 10) }
const eyes = { idle: anim(1), telegraph: anim(1), blink: anim(3, 12) }

// ponytail: reference tips describe the procedural east-facing stick, then its eight poses.
// Delivered art with a moving stick supplies measured per-frame tips through sheetAnimations.
const referenceTips: Record<Direction, readonly [number, number]> = {
  n: [24, 8], ne: [43, 9], e: [56, 24], se: [55, 43],
  s: [40, 56], sw: [21, 55], w: [8, 40], nw: [9, 21],
}

function directions(actions: Readonly<Record<string, Anim>>, torch = false): Record<string, Anim> {
  const out: Record<string, Anim> = {}
  for (const [action, a] of Object.entries(actions)) for (const d of SHEET_DIRECTIONS) {
    out[action + '-' + d] = torch ? { ...a, torchTips: Array.from({ length: a.n }, () => referenceTips[d]) } : { ...a }
  }
  return out
}
const actor = (anims: Record<string, Anim>, pri: 0 | 1, r?: number): SpriteDef =>
  ({ w: 64, h: 64, px: 32, py: 32, pri, ...(r === undefined ? {} : { r }), anims })
const sprite = (w: number, h: number, px: number, py: number, pri: 0 | 1 | 2,
  anims: Record<string, Anim>, r?: number): SpriteDef =>
  ({ w, h, px, py, pri, ...(r === undefined ? {} : { r }), anims })
const tile = (n: number, pri: 0 | 1 | 2): SpriteDef => sprite(32, 32, 0, 0, pri, { v: anim(n) })
const vein = (): SpriteDef => sprite(32, 32, 16, 16, 0, { full: anim(1), mining: anim(3, 6, true) })
const mineral = (): SpriteDef => sprite(16, 16, 8, 8, 0, { idle: anim(1) }, 7)

export const SPRITES = {
  player_body: actor(directions(player), 0, 10),
  'player_body-torch': actor(directions(player, true), 0, 10),
  mon_lurker: actor(directions(shade), 0, 9), mon_lurker_eyes: actor(directions(eyes), 0),
  mon_stalker: actor(directions(shade), 1, 14), mon_stalker_eyes: actor(directions(eyes), 1),
  mon_devourer: actor(directions(devourer), 1, 30), mon_devourer_eyes: actor(directions(eyes), 1),
  tile_z1_floor: tile(4, 0), tile_z1_wall: tile(16, 0), tile_z1_inner: tile(4, 1),
  tile_z2_floor: tile(4, 1), tile_z2_wall: tile(16, 1), tile_z2_inner: tile(4, 2),
  tile_z3_floor: tile(4, 1), tile_z3_wall: tile(16, 1), tile_z3_inner: tile(4, 2),
  tile_z4_floor: tile(4, 1), tile_z4_wall: tile(16, 1), tile_z4_inner: tile(4, 2),
  spec_entrance: sprite(64, 64, 32, 32, 0, { idle: anim(1) }, 24),
  spec_beacon: sprite(64, 64, 32, 32, 0, { unlit: anim(1), charging: anim(4, 8, true), lit: anim(6, 10, true) }, 22),
  'spec_vein-sodium': vein(), 'spec_vein-copper': vein(), 'spec_vein-strontium': vein(),
  spec_chamber: tile(3, 2),
  spec_boulder: sprite(32, 32, 16, 16, 1, { v: anim(3) }, 15),
  spec_crater: sprite(48, 48, 24, 24, 1, { idle: anim(1) }),
  fx_dust: sprite(32, 32, 16, 16, 2, { puff: anim(5, 15) }),
  'item_resin-small': sprite(16, 16, 8, 8, 0, { idle: anim(4, 6, true) }, 8),
  'item_resin-large': sprite(24, 24, 12, 12, 1, { idle: anim(4, 6, true) }, 11),
  item_plant: sprite(24, 24, 12, 12, 0, { idle: anim(4, 4, true) }, 10),
  'item_mineral-sodium': mineral(), 'item_mineral-copper': mineral(), 'item_mineral-strontium': mineral(),
  prop_stalagmite: sprite(32, 32, 16, 16, 2, { v: anim(4) }), // R-054: decor never blocks.
  prop_bones: sprite(32, 32, 16, 16, 2, { v: anim(2) }),
  prop_roots: tile(2, 2), prop_mushroom: sprite(16, 16, 8, 8, 2, { v: anim(3) }), prop_puddle: tile(2, 2),
  'ui_hp-pip': sprite(12, 12, 6, 6, 0, { v: anim(3) }), ui_slot: sprite(24, 24, 12, 12, 0, { v: anim(2) }),
  ui_depth: sprite(12, 12, 6, 6, 1, { idle: anim(1) }),
  'ui_exit-arrow': sprite(24, 24, 12, 12, 1, { idle: anim(1) }), ui_keycap: sprite(16, 16, 8, 8, 1, { idle: anim(1) }),
} as const satisfies Record<string, SpriteDef>
export type SpriteId = keyof typeof SPRITES
export type ActorId = Extract<SpriteId, `player_${string}` | `mon_${string}`>
export const SCREENS = { keyart: 'title-keyart', logo: 'logo', helpParry: 'help-parry', helpGoal: 'help-goal' } as const

// One sheet per action, with eight equal rows and no empty trailing columns.
export function sheetFrameCount(width: number, height: number): number {
  if (!Number.isSafeInteger(width) || width <= 0 || width % ACTOR_FRAME !== 0 || height !== ACTOR_SHEET_HEIGHT) {
    throw new RangeError('Actor sheet must have positive width divisible by 64 and height 512')
  }
  return width / ACTOR_FRAME
}

export function sheetFrameRect(width: number, height: number, direction: Direction, frame: number): readonly [number, number, number, number] {
  const n = sheetFrameCount(width, height), row = SHEET_DIRECTIONS.indexOf(direction)
  if (row < 0 || !Number.isInteger(frame) || frame < 0 || frame >= n) throw new RangeError('Actor sheet frame is out of range')
  return [frame * ACTOR_FRAME, row * ACTOR_FRAME, ACTOR_FRAME, ACTOR_FRAME]
}

export function sheetAnimations(id: ActorId, action: string, width: number, height: number,
  tips?: Partial<Record<Direction, readonly (readonly [number, number])[]>>): Record<string, Anim> {
  const n = sheetFrameCount(width, height), out: Record<string, Anim> = {}, torch = id === 'player_body-torch'
  if (tips && !torch) throw new Error('Only the torch player set accepts torch tips')
  for (const d of SHEET_DIRECTIONS) {
    const key = action + '-' + d, base = SPRITES[id].anims[key]
    if (!base) throw new Error('Unknown actor animation: ' + id + ' ' + action)
    if (torch) {
      const anchors = tips?.[d] ?? Array.from({ length: n }, () => referenceTips[d])
      if (anchors.length !== n || anchors.some(p => p.length !== 2 || !p.every(v => Number.isFinite(v) && v >= 0 && v < ACTOR_FRAME))) {
        throw new RangeError('Torch tips must provide one in-frame position per source frame')
      }
      out[key] = { n, fps: base.fps, loop: base.loop, torchTips: anchors }
    } else out[key] = { n, fps: base.fps, loop: base.loop }
  }
  return out
}
