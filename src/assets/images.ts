// L4 assets: atlas + screen loading, per-frame rect resolution, tint cache and drawSprite.
// Spec: docs/architecture-assets-pipeline.md §5-§8, architecture-render-3 §5, architecture-modules-ui-assets row `images.ts`, R-019, R-154/R-155.
// Every cache lives in getResources().images (hot-swap safe). Nothing here throws into update/render; missing art falls back to PLACEHOLDERS.
import atlas from './atlas.json'
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
const SCREEN_URLS = import.meta.glob('./art/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const SCREEN_KEYS = Object.keys(SCREENS) as (keyof typeof SCREENS)[]
const LOAD_TIMEOUT_MS = 10000
const TINT_CAP = 64

// ponytail: URL-derived flag read once per module evaluation (re-read on every hot swap, not game state). Ceiling: a `?ph=` change needs a reload.
let forced: boolean | null = null
function forcePlaceholders(): boolean {
  forced ??= typeof location !== 'undefined' && new URLSearchParams(location.search).get('ph') === '1'
  return forced
}

const pad2 = (i: number): string => (i < 10 ? '0' : '') + i
const isActor = (id: SpriteId): boolean => id.startsWith('player_') || id.startsWith('mon_')

// Pipeline §6. Rebuilt whenever an atlas sheet settles. A rect is only usable when its sheet decoded; a failed sheet leaves null (placeholder).
function rebuildRects(res: Resources): void {
  const im = res.images, frames = ATLAS.frames
  const get = (id: string, a: string, i: number): Rect | undefined => {
    const r = frames[id + '_' + a + '_' + pad2(i)]
    return r && im.sheetState[r[0]] === 'ok' && im.sheets[r[0]] ? r : undefined
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
  const a = quantAngle(rot), c = Math.cos(a) * scale * z, sn = Math.sin(a) * scale * z
  ctx.setTransform(c, sn, -sn, c, b.e + sx * z, b.f + sy * z)
  ctx.globalAlpha = alpha
  const r = forcePlaceholders() ? null : resolved(id, anim, frame)
  const img = r ? sheetImage(r[0]) : null
  const key = id + '|' + anim + '|' + frame + '|' + tint
  if (r && img) {
    if (tint) {
      const t = tintCached(key, r[3], r[4], g => g.drawImage(img, r[1], r[2], r[3], r[4], 0, 0, r[3], r[4]), tint)
      if (t) ctx.drawImage(t, -d.px, -d.py)
    } else ctx.drawImage(img, r[1], r[2], r[3], r[4], -d.px, -d.py, r[3], r[4])
  } else if (tint) {
    // No atlas rect to tint: bake the placeholder once at 1x (it is static, t = 0), then recolour that. Ceiling: soft when zoomed in.
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

// Pipeline §8: sheets in parallel, then the four screens one at a time. Idempotent; call from the render host once.
export function startPreload(res: Resources): void {
  const im = res.images
  if (im.started) return
  im.started = true
  im.total = ATLAS.sheets.length + SCREEN_KEYS.length
  im.loaded = 0
  im.sheets = ATLAS.sheets.map(() => null)
  im.sheetState = ATLAS.sheets.map(() => 'loading')
  const settle = (): void => { im.loaded += 1; im.gen += 1 }
  const sheetJobs = ATLAS.sheets.map(async (s, i) => {
    const img = await loadImage(SHEET_URLS['./' + s.image])
    im.sheets[i] = img
    im.sheetState[i] = img ? 'ok' : 'failed'
    if (!img) console.warn('[assets] ' + s.image.replace(/\.png$/, '') + ' failed, using placeholders')
    rebuildRects(res)
    settle()
  })
  void (async () => {
    await Promise.all(sheetJobs)
    for (const k of SCREEN_KEYS) {
      im.screens[k] = await loadImage(SCREEN_URLS['./art/' + SCREENS[k] + '.png'])
      settle()
    }
  })()
}
