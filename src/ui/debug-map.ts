// Developer minimap: cached terrain colors, live resources/landmarks, always-visible purple player.
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { mapColor, MAP_ZONES } from '../core/debug-map.ts'
import { getResources } from '../assets/resources.ts'
import { getSolid, getDepthField } from '../world/caches.ts'
import { beaconTile } from '../world/beacon-position.ts'
import { hudLayout } from './layout.ts'
import { FONT } from './draw.ts'

export const MAP_MARKERS = { player: '#c85af0', entrance: '#66ddff', exit: '#ffffff', beacon: '#6699ff',
  copper: '#27cc68', sodium: '#ffe34b', strontium: '#ff4545', resin: '#ff9c32', plant: '#a7f15c' } as const

function terrain(s: State): HTMLCanvasElement {
  const res = getResources().debug, { w, h, tilesHash, solidSig, beaconDist } = s.world, mode = s.debug.mapMode
  const key = `layers-v1:${s.meta.runId}:${tilesHash}:${w}x${h}:${solidSig}:${mode}:${beaconDist}`
  if (res.map?.key === key) return res.map.canvas
  const canvas = res.map?.canvas ?? document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!, pixels = ctx.createImageData(w, h), solid = getSolid(s)
  const distances = mode === 'plain' ? null : getDepthField(s)
  for (let i = 0; i < solid.length; i++) {
    const rgb = mapColor(mode, !!solid[i], distances?.[i] ?? -1, beaconDist)
    pixels.data[i * 4] = rgb[0]; pixels.data[i * 4 + 1] = rgb[1]; pixels.data[i * 4 + 2] = rgb[2]
    pixels.data[i * 4 + 3] = 255
  }
  ctx.putImageData(pixels, 0, 0)
  res.map = { key, canvas }
  return canvas
}

export function drawMinimap(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const l = hudLayout(w, h, s), { world, debug: d } = s
  const x = Math.round(Math.max(l.pips.at(-1)!.x + 12 * l.u, l.flame.x + l.flame.w) + 16 * l.u)
  const y = Math.round(l.pips[0].y - 12 * l.u)
  const width = Math.min(Math.max(128, 192 * l.u), w - x - 16)
  const scale = Math.min(width / world.w, (h - y - 66) / world.h)
  if (scale <= 0) return
  const mw = Math.round(world.w * scale), mh = Math.round(world.h * scale)
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#191c22'; ctx.fillRect(x - 3, y - 3, mw + 6, mh + 57)
  ctx.drawImage(terrain(s), x, y, mw, mh)
  const marker = (tx: number, ty: number, color: string, shape = 'square'): void => {
    const px = Math.round(x + tx / world.w * mw), py = Math.round(y + ty / world.h * mh)
    if (shape === 'ring') {
      // Entry and exit can share a tile: retain the entrance color inside the exit's white outline.
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.strokeRect(px - 2.5, py - 2.5, 5, 5)
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(px - 2.5, py - 2.5, 5, 5)
      return
    }
    ctx.fillStyle = '#000'; ctx.fillRect(px - 3, py - 3, 7, 7)
    ctx.fillStyle = color
    if (shape === 'cross') { ctx.fillRect(px - 2, py, 5, 1); ctx.fillRect(px, py - 2, 1, 5) }
    else ctx.fillRect(px - 2, py - 2, 5, 5)
  }
  const entries: [string, string][] = [['P', MAP_MARKERS.player]]
  if (d.mapOres) {
    for (const v of s.veins) marker(v.tile % world.w + 0.5, Math.floor(v.tile / world.w) + 0.5, MAP_MARKERS[v.mineral])
    entries.push(['Cu', MAP_MARKERS.copper], ['Na', MAP_MARKERS.sodium], ['Sr', MAP_MARKERS.strontium])
  }
  for (const p of s.pickups) {
    if (p.kind === 'resin' && d.mapResin) marker(p.x / TILE, p.y / TILE, MAP_MARKERS.resin)
    if (p.kind === 'plant' && d.mapPlants) marker(p.x / TILE, p.y / TILE, MAP_MARKERS.plant, 'cross')
  }
  if (d.mapResin) entries.push(['R', MAP_MARKERS.resin])
  if (d.mapPlants) entries.push(['H', MAP_MARKERS.plant])
  if (d.mapEntrance) { marker(world.entrance.tx + 0.5, world.entrance.ty + 0.5, MAP_MARKERS.entrance); entries.push(['E', MAP_MARKERS.entrance]) }
  if (d.mapExit) { marker(world.exit.tx + 0.5, world.exit.ty + 0.5, MAP_MARKERS.exit, 'ring'); entries.push(['X', MAP_MARKERS.exit]) }
  if (d.mapBeacon) {
    const b = beaconTile(s); marker(b.tx + 0.5, b.ty + 0.5, MAP_MARKERS.beacon); entries.push(['B', MAP_MARKERS.beacon])
  }
  marker(s.player.x / TILE, s.player.y / TILE, MAP_MARKERS.player)
  ctx.font = '10px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  let lx = x, ly = y + mh + 5
  for (const [label, color] of entries) {
    const space = ctx.measureText(label).width + 10
    if (lx + space > x + mw) { lx = x; ly += 12 }
    ctx.fillStyle = color; ctx.fillText(label, lx, ly); lx += space
  }
  const captionY = y + mh + 34
  if (d.mapMode === 'zones') {
    MAP_ZONES.forEach((rgb, i) => { ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.fillText('Z' + (i + 1), x + i * mw / 4, captionY) })
  } else {
    ctx.fillStyle = '#a5aab5'
    ctx.fillText(d.mapMode === 'distance' ? `Path: 0t -> ${world.beaconDist}t` : 'Floor / wall', x, captionY)
  }
}
