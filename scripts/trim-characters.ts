// Trim art/characters-source.json to the deployed src/assets/characters.json (OD-D6).
// Spec: docs/architecture-modules-ui-assets-2.md (trim-characters), docs/notes/ai-jam-5-asset-formats-25d.md.
// Rewrites the JSON ONLY; characters.png is used as delivered. Not wired into check.
// Run from the repo root: node scripts/trim-characters.ts
import { readFileSync, writeFileSync } from 'node:fs'

const SRC = 'art/characters-source.json'
const OUT = 'src/assets/characters.json'

type Rect = { x: number; y: number; w: number; h: number }
type Pt = { x: number; y: number }
type Json = Record<string, any>

const fail = (msg: string): never => {
  console.error(`trim-characters FAIL: ${msg}`)
  process.exit(1)
}

const src: Json = JSON.parse(readFileSync(SRC, 'utf8'))
if (src.format !== 'gamejam-character-atlas-v1') fail(`unexpected format ${src.format}`)

const panel: Rect = src.palette_panel_rect
const inside = (r: Rect, w: number, h: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

let frames = 0
const animations = src.animations.map((a: Json) => {
  const directions: Json = {}
  for (const dir of src.direction_order as string[]) {
    const list: Json[] | undefined = a.directions[dir]
    if (!list || list.length !== a.frame_count_per_direction) fail(`${a.id}: bad direction ${dir}`)
    directions[dir] = list!.map((f: Json) => {
      const r: Rect = f.rect
      const anchor: Pt = f.anchor
      if (r.w !== 64 || r.h !== 64) fail(`${a.id}/${dir}/${f.index}: rect not 64x64`)
      if (!inside(r, src.size.w, src.size.h) || overlaps(r, panel)) fail(`${a.id}/${dir}/${f.index}: rect out of bounds`)
      if (anchor.x !== 32 || anchor.y !== 32) fail(`${a.id}/${dir}/${f.index}: pivot not 32,32`)
      frames++
      const out: Json = { index: f.index, rect: r, anchor, duration_ms: f.duration_ms }
      if (f.flame_center_anchor) out.flame_center_anchor = f.flame_center_anchor
      return out
    })
  }
  const meta: Json = a.source_metadata ?? {}
  const out: Json = {
    id: a.id,
    character: a.character,
    animation: a.animation,
    rect: a.rect,
    frame_count_per_direction: a.frame_count_per_direction,
    fps: a.fps,
    loop: a.loop,
    palette_id: a.palette_id,
  }
  for (const k of ['torch_lit', 'torch_release_frame', 'hold_last_frame']) if (k in meta) out[k] = meta[k]
  out.directions = directions
  return out
})
if (frames !== src.counts.frames || frames !== 1232) fail(`frame count ${frames}`)

const out = {
  format: src.format,
  image: src.image,
  size: src.size,
  frame_size: src.frame_size,
  direction_order: src.direction_order,
  counts: src.counts,
  palette_panel_rect: panel,
  palettes: src.palettes.map((p: Json) => ({
    id: p.id,
    entries: p.entries.map((e: Json) => ({ index: e.index, name: e.name, role: e.role, hex: e.hex, rgb: e.rgb })),
  })),
  animations,
}

// ponytail: compact JSON, fixed key order from the literals above; deterministic and idempotent. Add indentation only if diffs must be human-read.
writeFileSync(OUT, JSON.stringify(out) + '\n')
console.log(`trim-characters ok: ${frames} frames, ${animations.length} animations -> ${OUT}`)
