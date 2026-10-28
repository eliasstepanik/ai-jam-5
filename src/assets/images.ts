// L4 assets: atlas + screen loading, per-frame rect resolution, tint cache and drawSprite.
// Spec: docs/architecture-assets-pipeline.md §5-§8, architecture-render-3 §5, architecture-modules-ui-assets row `images.ts`, R-019, R-154/R-155.
// Every cache lives in getResources().images (hot-swap safe). Nothing here throws into update/render; missing art falls back to PLACEHOLDERS.
import { UI_THEMES } from './ui-data.ts'
import { loadUiFont, UI_FONT_URL } from './ui-font.ts'
import atlas from './atlas.json'
import characterMeta from './characters.json'
import tilesetMeta from './cave_tileset.json'
import { quantAngle } from '../core/noise.ts'
import { PLACEHOLDERS } from './placeholders-ui.ts'
import { getResources } from './resources.ts'
import type { Resources } from './resources.ts'
import { SCREENS, SPRITES } from './sprites.ts'
import type { SpriteId } from './sprites.ts'

type AtlasFile = {
  readonly version: number; readonly hash: string
  readonly sheets: readonly { readonly image: string; readonly w: number; readonly h: number }[]
  readonly frames: Readonly<Record<string, readonly number[]>>
}
type Rect = readonly number[] // [sheet, x, y, w, h]

const ATLAS = atlas as AtlasFile
// Missing files are not errors: an empty glob just means placeholders (pipeline §5).
const SHEET_URLS = import.meta.glob('./atlas-*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
// Pipeline §5: the two delivered sheets. Slot order is a contract: 0 = cave_tileset.png (render/tiles.ts), 1 = characters.png (render/charatlas.ts).
const EXTERNAL = ['cave_tileset.png', 'characters.png', ...UI_THEMES.map(t => 'ui/ui-' + t + '.png')] as const
const SHEETS = import.meta.glob(['./cave_tileset.png', './characters.png', './ui/ui-*.png'], { eager: true, query: '?url', import: 'default' }) as Record<string, string>
// Hand-packed legacy sheets (atlas.json `sheets`, empty at the pivot) follow the external slots so they never collide with 0/1. ponytail: the legacy atlas.json path stays for the old actor eye sheets (mon_*_eyes) and UI art; remove it once those sheets are replaced.
const LEGACY_BASE = EXTERNAL.length
const SCREEN_URLS = import.meta.glob('./art/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const SCREEN_KEYS = Object.keys(SCREENS) as (keyof typeof SCREENS)[]
const LOAD_TIMEOUT_MS = 10000
const TINT_CAP = 64

// ponytail: URL-derived flag read once per module evaluation (re-read on every hot swap, not game state). Ceiling: a `?ph=` change needs a reload.
let forced: boolean | null = null
export function forcePlaceholders(): boolean {
  forced ??= typeof location !== 'undefined' && new URLSearchParams(location.search).get('ph') === '1'
  return forced
}

const pad2 = (i: number): string => (i < 10 ? '0' : '') + i
const isActor = (id: SpriteId): boolean => id.startsWith('player_') || id.startsWith('mon_')

// Pipeline §6. Rebuilt whenever a legacy atlas sheet settles. A rect is only usable when its sheet decoded; a failed sheet leaves null (placeholder).
// Rects returned by `get` carry the shifted slot (LEGACY_BASE + atlas sheet index).
function rebuildRects(res: Resources): void {
  const im = res.images, frames = ATLAS.frames
  const get = (id: string, a: string, i: number): Rect | undefined => {
    const r = frames[id + '_' + a + '_' + pad2(i)]
    const slot = r ? LEGACY_BASE + r[0] : -1
    return r && im.sheetState[slot] === 'ok' && im.sheets[slot] ? [slot, r[1], r[2], r[3], r[4]] : undefined
  }
  for (const c of im.tints.values()) c.width = c.height = 0
  im.tints.clear(); im.rects.clear()
  for (const id of Object.keys(SPRITES) as SpriteId[]) {
    const player = id.startsWith('player_'), actor = isActor(id)
    for (const [a, def] of Object.entries(SPRITES[id].anims)) {
      // Missing animation: actors fall back inside their own set (never across torch/no-torch), others to idle_00 or v_00.
      const dir = a.slice(a.lastIndexOf('-') + 1)
      const idle = actor ? get(id, 'idle-' + dir, 0) ?? (player ? get(id, 'idle-e', 0) : undefined)
        : get(id, 'idle', 0) ?? get(id, 'v', 0)
      let prev: Rect | undefined // Missing frame: previous available frame of the same animation.
      // Delivered sheets may hold more frames than the catalog default; keep probing while art exists.
      for (let i = 0; i < def.n || get(id, a, i); i++) {
        const r = get(id, a, i) ?? prev ?? idle
        prev = r
        im.rects.set(id + '|' + a + '|' + i, r ?? null)
      }
    }
  }
}

function resolved(id: SpriteId, anim: string, frame: number): Rect | null {
  const rects = getResources().images.rects, k = id + '|' + anim + '|'
  for (let f = frame < 0 ? 0 : Math.floor(frame); f >= 0; f--) {
    const r = rects.get(k + f)
    if (r !== undefined) return r
  }
  return null
}

function sheetImage(i: number): HTMLImageElement | null {
  return getResources().images.sheets[i] ?? null
}

// Cache a recoloured copy (source-atop keeps the alpha silhouette). LRU: a hit re-inserts, overflow evicts the oldest and frees its pixels.
function tintCached(key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void, hex: string): HTMLCanvasElement | null {
  const tints = getResources().images.tints
  let c = tints.get(key)
  if (c) { tints.delete(key); tints.set(key, c); return c }
  c = document.createElement('canvas')
  c.width = w; c.height = h
  const g = c.getContext('2d')
  if (!g) return null
  paint(g)
  g.globalCompositeOperation = 'source-atop'
  g.fillStyle = hex
  g.fillRect(0, 0, w, h)
  tints.set(key, c)
  if (tints.size > TINT_CAP) {
    const oldest = tints.keys().next().value as string
    const old = tints.get(oldest)
    if (old) old.width = old.height = 0
    tints.delete(oldest)
  }
  return c
}

export function drawSprite(ctx: CanvasRenderingContext2D, id: SpriteId, anim: string, frame: number,
  x: number, y: number, rot = 0, scale = 1, alpha = 1, tint: string | null = null): void {
  const d = SPRITES[id]
  // ponytail: getTransform allocates a DOMMatrix per call (~120 per frame). Upgrade: pass View (v.z, v.ox, v.oy) in if a profile shows GC.
  const b = ctx.getTransform(), z = b.a
  const sx = Math.round(x * z) / z, sy = Math.round(y * z) / z // snap to the device grid (render §4.3)
  const r = forcePlaceholders() ? null : resolved(id, anim, frame)
  const img = r ? sheetImage(r[0]) : null
  // Placeholders are authored in world units: scale applies to atlas art only (callers pass 0.5/0.75/1.5 for 64 px sources).
  const a = quantAngle(rot), k = r && img ? scale : 1, c = Math.cos(a) * k * z, sn = Math.sin(a) * k * z
  ctx.setTransform(c, sn, -sn, c, b.e + sx * z, b.f + sy * z)
  ctx.globalAlpha = alpha
  const key = id + '|' + anim + '|' + frame + '|' + tint
  if (r && img) {
    if (tint) {
      const t = tintCached(key, r[3], r[4], g => g.drawImage(img, r[1], r[2], r[3], r[4], 0, 0, r[3], r[4]), tint)
      if (t) ctx.drawImage(t, -d.px, -d.py)
    } else ctx.drawImage(img, r[1], r[2], r[3], r[4], -d.px, -d.py, r[3], r[4])
  } else if (tint) {
    // No atlas rect to tint: bake the placeholder once at 1x world units (it is static, t = 0; drawn unscaled above), then recolour that. Ceiling: soft when zoomed in.
    const t = tintCached(key + '|ph', d.w, d.h, g => {
      g.translate(d.px, d.py)
      PLACEHOLDERS[id](g, anim, frame, 0)
    }, tint)
    if (t) ctx.drawImage(t, -d.px, -d.py)
  } else PLACEHOLDERS[id](ctx, anim, frame, 0)
  ctx.setTransform(b)
  ctx.globalAlpha = 1
}

// True when authored art resolves for the id's first animation (the fallback chain already covers the other poses).
export function spriteReady(id: SpriteId): boolean {
  if (forcePlaceholders()) return false
  const first = Object.keys(SPRITES[id].anims)[0]
  return first !== undefined && resolved(id, first, 0) !== null
}

// Frame index for time t (seconds since the animation started). Loop wraps, once clamps to the last frame.
export function frameAt(id: SpriteId, anim: string, t: number): number {
  const a = SPRITES[id].anims[anim]
  if (!a || a.fps <= 0 || !(t > 0)) return 0
  const rects = getResources().images.rects, k = id + '|' + anim + '|'
  let n = a.n
  while (rects.has(k + n)) n++ // delivered art may extend the catalog count
  if (n <= 1) return 0
  const i = Math.floor(t * a.fps)
  return a.loop ? i % n : Math.min(i, n - 1)
}

// Resolves with the decoded image, or null on a load error, decode error, missing url or timeout. Never rejects.
function loadImage(url: string | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null)
  const img = new Image()
  let timer = 0
  const timeout = new Promise<null>(resolve => { timer = window.setTimeout(() => resolve(null), LOAD_TIMEOUT_MS) })
  img.src = url
  return Promise.race([img.decode().then(() => img, () => null), timeout]).finally(() => window.clearTimeout(timer))
}

// Pipeline §8: sheets in parallel, then screens one at a time. Per-frame calls return immediately while the atlas hash is unchanged.
// Slots 0/1 are the external sheets (tileset, characters), legacy atlas sheets follow. A failure sets 'failed' + one warning, never throws.
export function startPreload(res: Resources): void {
  loadUiFont(res)
  const im = res.images
  const sourceKey = tilesetMeta.meta.png_sha256 + ':' + characterMeta.png_sha256 + ':' + SHEETS['./characters.png'] + ':' + Object.values(SCREEN_URLS).join('|') + ':' + Object.values(SHEETS).join('|') + ':' + UI_FONT_URL
  if (im.started && im.sourceKey === sourceKey) return
  im.sourceKey = sourceKey
  im.gen += 1 // invalidate old coordinates immediately; the loading slots use safe placeholders
  im.rects.clear()
  im.started = true
  const slots = LEGACY_BASE + ATLAS.sheets.length
  im.total = slots + SCREEN_KEYS.length
  im.loaded = 0
  im.sheets = Array.from({ length: slots }, () => null)
  im.sheetState = Array.from({ length: slots }, () => 'loading')
  const sheets = im.sheets // discard asynchronous results from an atlas superseded during hot reload
  const settle = (): void => { im.loaded += 1; im.gen += 1 }
  const sheetJob = async (slot: number, file: string, url: string | undefined, legacy: boolean): Promise<void> => {
    const img = await loadImage(url)
    if (im.sheets !== sheets) return
    im.sheets[slot] = img
    im.sheetState[slot] = img ? 'ok' : 'failed'
    if (!img) console.warn('[assets] ' + file + ' failed, using placeholders')
    if (legacy) rebuildRects(res)
    settle()
  }
  const sheetJobs = [
    ...EXTERNAL.map((f, i) => sheetJob(i, f, SHEETS['./' + f], false)),
    ...ATLAS.sheets.map((s, i) => sheetJob(LEGACY_BASE + i, s.image.replace(/\.png$/, ''), SHEET_URLS['./' + s.image], true)),
  ]
  void (async () => {
    await Promise.all(sheetJobs)
    for (const k of SCREEN_KEYS) {
      const img = await loadImage(SCREEN_URLS['./art/' + SCREENS[k] + '.png'])
      if (im.sheets !== sheets) return
      im.screens[k] = img
      settle()
    }
  })()
}
