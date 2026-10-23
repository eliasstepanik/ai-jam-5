// L4 render: cave tileset frame lookup and blit. Pure, no DOM at import time, no module state beyond one derived constant table.
// Spec: docs/architecture-modules-render.md row `src/render/tileset.ts` (D3), architecture-render-2 §2.2, ai-jam-5-asset-formats-25d, R-179, R-186.
// The loaded atlas image is NOT loaded here: the caller (images.ts / tiles.ts) owns the decoded sheet and passes it in as `Tileset.image`.
import tilesetJson from '../assets/cave_tileset.json'
import { faceKind } from '../core/grid.ts'
import { getResources } from '../assets/resources.ts'

type FrameRec = { readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }; readonly anchor: readonly number[] }

// The loaded atlas image; frame rects come from the JSON via `tileFrame`.
export type Tileset = { image: CanvasImageSource }

// name -> [x, y, w, h, ax, ay], built once from the delivered JSON (immutable derived data, re-evaluated with the module on a hot swap).
const FRAMES = new Map<string, [number, number, number, number, number, number]>(
  Object.entries((tilesetJson as unknown as { frames: Record<string, FrameRec> }).frames).map(([name, f]) =>
    [name, [f.frame.x, f.frame.y, f.frame.w, f.frame.h, f.anchor[0] ?? 0, f.anchor[1] ?? 0]]))
// ponytail: an unknown name yields an empty rect, so `blit` draws nothing instead of throwing into the frame loop. Ceiling: a typo shows as a missing tile; a check could assert every generated name exists.
const NO_FRAME: [number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0]

const mod = (n: number, m: number): number => ((n % m) + m) % m
const pad2 = (n: number): string => (n < 10 ? '0' : '') + n

// Frame rect and anchor `[x, y, w, h, ax, ay]` in sheet pixels. The returned tuple is shared: do not mutate it.
export function tileFrame(name: string): [number, number, number, number, number, number] {
  return FRAMES.get(name) ?? NO_FRAME
}

// DEFAULT: the tileset sheet is the first external sheet (`res.images.sheets[0]`, cave_tileset.png; charatlas.ts uses index 1). Until it
// has decoded (or when images.ts does not load it yet) callers draw flat fills (tiles.ts) or the spec_boulder sprite (props.ts).
export function tilesetOf(): Tileset | null {
  const im = getResources().images, img = im.sheets[0]
  return img && im.sheetState[0] === 'ok' ? { image: img } : null
}

// Wall cap for the open-neighbour mask N1 E2 S4 W8: `cap_00` .. `cap_15` (`capName(0b0101) === 'cap_05'`).
export function capName(mask: number): string {
  return 'cap_' + pad2(mask & 15)
}

// Wall face for the cell: pillar when both side neighbours are open, left / right for one side, else `face_fill_<variant 0..3>`.
export function faceName(mask: number, wOpen: boolean, eOpen: boolean, variant: number): string {
  const k = faceKind(mask, wOpen, eOpen)
  return k === 'fill' ? 'face_fill_' + mod(variant, 4) : 'face_' + k
}

// South-facing ore frame `wall_<mineral>_01..03` (R-186); `variant` is the vein id (or 0..2), mapped as 1 + variant % 3.
export function oreName(mineral: string, variant: number): string {
  return 'wall_' + mineral + '_0' + (1 + mod(variant, 3))
}

// 24 px floor pattern frame `floor_0` .. `floor_9` (R-179); `v` comes from `floorVariant`.
export function floorName(v: number): string {
  return 'floor_' + mod(v, 10)
}

// Draw frame `name` with its anchor at (x, y): draw position = (x, y) - frame anchor (asset formats note, anchor_rule).
export function blit(c: CanvasRenderingContext2D, ts: Tileset, name: string, x: number, y: number): void {
  const [fx, fy, w, h, ax, ay] = tileFrame(name)
  c.drawImage(ts.image, fx, fy, w, h, x - ax, y - ay, w, h)
}
