// Developer-only map and direct destination indicator. Cached terrain lives in the resource registry.
import { beaconTile } from '../world/beacon-position.ts'
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { getResources } from '../assets/resources.ts'
import { getSolid } from '../world/caches.ts'
import { debugBearing } from '../systems/debug-navigation.ts'
import { makeView, screenXf, toScreen } from '../render/view.ts'
import type { View } from '../render/view.ts'
import { PLAYER_FOOT } from '../render/entities-player.ts'
import { hudLayout } from './layout.ts'
import { FONT } from './draw.ts'

function terrain(s: State): HTMLCanvasElement {
  const res = getResources().debug, { w, h, tilesHash, solidSig } = s.world
  const key = `${s.meta.runId}:${tilesHash}:${w}x${h}:${solidSig}`
  if (res.map?.key === key) return res.map.canvas
  const canvas = res.map?.canvas ?? document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(w, h), solid = getSolid(s)
  for (let i = 0; i < solid.length; i++) {
    const c = solid[i] ? 0 : 255
    pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = c
    pixels.data[i * 4 + 3] = 255
  }
  ctx.putImageData(pixels, 0, 0)
  res.map = { key, canvas }
  return canvas
}

function minimap(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const l = hudLayout(w, h, s), { world } = s
  const x = Math.round(Math.max(l.pips.at(-1)!.x + 12 * l.u, l.flame.x + l.flame.w) + 16 * l.u)
  const y = Math.round(l.pips[0].y - 12 * l.u)
  const width = Math.min(Math.max(128, 192 * l.u), w - x - 16)
  const scale = Math.min(width / world.w, (h - y - 36) / world.h)
  if (scale <= 0) return
  const mw = Math.round(world.w * scale), mh = Math.round(world.h * scale)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#191c22'; ctx.fillRect(x - 3, y - 3, mw + 6, mh + 24)
  ctx.drawImage(terrain(s), x, y, mw, mh)
  const marker = (tx: number, ty: number, color: string): void => {
    const px = x + tx / world.w * mw, py = y + ty / world.h * mh
    ctx.fillStyle = '#000'; ctx.fillRect(Math.round(px) - 3, Math.round(py) - 3, 6, 6)
    ctx.fillStyle = color; ctx.fillRect(Math.round(px) - 2, Math.round(py) - 2, 4, 4)
  }
  marker(world.entrance.tx + 0.5, world.entrance.ty + 0.5, '#70eda7')
  const beacon = beaconTile(s)
  marker(beacon.tx + 0.5, beacon.ty + 0.5, '#ffd27a')
  marker(s.player.x / TILE, s.player.y / TILE, '#65d9ef')
  ctx.font = '10px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  for (const [label, color, dx] of [['P', '#65d9ef', 0], ['E', '#70eda7', 22], ['B', '#ffd27a', 44]] as const) {
    ctx.fillStyle = color; ctx.fillText(label, x + dx, y + mh + 5)
  }
}

function arrow(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const p = s.player, [x, y] = toScreen(v, p.x, p.y - PLAYER_FOOT)
  const bearing = debugBearing(s, p.x, p.y - PLAYER_FOOT), at = debugBearing(s).distance <= TILE / 2
  const color = s.debug.arrowTarget === 'beacon' ? '#ffd27a' : '#70eda7'
  if (!at) {
    const radius = 44
    ctx.save(); ctx.translate(x + Math.cos(bearing.angle) * radius, y + Math.sin(bearing.angle) * radius)
    ctx.rotate(bearing.angle)
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-7, -7); ctx.lineTo(-3, 0); ctx.lineTo(-7, 7); ctx.closePath()
    ctx.lineWidth = 3; ctx.strokeStyle = '#101015'; ctx.stroke()
    ctx.fillStyle = color; ctx.fill(); ctx.restore()
  }
  const label = (at ? 'AT ' : '') + (s.debug.arrowTarget === 'beacon' ? 'BEACON' : 'EXIT') +
    (at ? '' : ' ' + Math.ceil(debugBearing(s).distance / TILE) + 't')
  ctx.font = '10px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.lineWidth = 3; ctx.strokeStyle = '#101015'; ctx.strokeText(label, x, y + 56)
  ctx.fillStyle = color; ctx.fillText(label, x, y + 56)
}

export function drawDebugNavigation(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  if (!s.world.tiles || s.meta.screen === 'title' || s.meta.screen === 'help' || (!s.debug.minimap && !s.debug.arrow)) return
  const v = makeView(ctx, s, w, h)
  ctx.save(); screenXf(ctx, v)
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'
  if (s.debug.minimap) minimap(ctx, s, w, h)
  if (s.debug.arrow) arrow(ctx, s, v)
  ctx.restore()
}
