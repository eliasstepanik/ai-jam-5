// Clickable developer tools. No listeners or module state: UI cursors/timings live in the HMR resource registry.
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { clamp } from '../core/math.ts'
import { getResources } from '../assets/resources.ts'
import { debugAction, debugDepthClass, debugRunActive, setDebugValue, torchSeconds } from '../systems/debug.ts'
import type { DebugAction } from '../systems/debug.ts'
import { currentQuality } from '../render/quality.ts'
import { drawDebugWorld } from '../render/debug.ts'
import { debugLayout, contains } from './debug-layout.ts'
import { drawAiDebug } from './debug-ai.ts'
import { drawDebugNavigation } from './debug-navigation.ts'
import { FONT } from './draw.ts'
import { depthName } from './strings.ts'

export function debugAvailable(): boolean {
  const ui = getResources().debug
  ui.available ??= import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === '1')
  return ui.available
}

export function debugInput(s: State, input: Input): Input {
  const ui = getResources().debug, { w, h } = input.view
  if (input.pressed.has('F2') || input.pressed.has('Backquote')) { ui.on = !ui.on; ui.drag = 'none' }
  ui.mouseX = input.mouse.x; ui.mouseY = input.mouse.y
  const wasDragging = ui.drag !== 'none'
  const clicks = input.clicks.filter(c => {
    const l = debugLayout(s, w, h, ui.on, ui.tab)
    const control = l.controls.find(r => contains(r, c.x, c.y))
    if (control) {
      if (control.enabled) {
        const id = control.id
        if (id === 'open') { ui.on = !ui.on; ui.drag = 'none' }
        else if (id === 'tab0' || id === 'tab1' || id === 'tab2' || id === 'tab3') { ui.tab = Number(id.slice(-1)); ui.drag = 'none' }
        else if (id === 'speed' || id === 'torch') {
          ui.drag = id
          setDebugValue(s, id, (c.x - control.x - 8) / (control.w - 16))
        } else debugAction(s, id as DebugAction, input.view)
      }
      return false
    }
    return !(ui.on && contains(l.panel, c.x, c.y))
  })
  const l = debugLayout(s, w, h, ui.on, ui.tab)
  if (ui.on && ui.drag !== 'none' && input.mouse.down) {
    const track = l.controls.find(r => r.id === ui.drag)
    if (track?.enabled) setDebugValue(s, ui.drag, (input.mouse.x - track.x - 8) / (track.w - 16))
  }
  const consumed = wasDragging || ui.drag !== 'none' || clicks.length !== input.clicks.length ||
    l.controls.some(r => contains(r, input.mouse.x, input.mouse.y)) || (ui.on && contains(l.panel, input.mouse.x, input.mouse.y))
  if (!input.mouse.down || input.pressed.has('Blur')) ui.drag = 'none'
  if (!consumed) { ui.aimX = input.mouse.x; ui.aimY = input.mouse.y }
  const pressed = new Set(input.pressed)
  pressed.delete('F2'); pressed.delete('Backquote')
  return { ...input, clicks, pressed, mouse: consumed ? { x: ui.aimX, y: ui.aimY, down: false } : input.mouse }
}

export function beginDebugUpdate(s: State): void {
  if (s.debug.stats) getResources().debug.updateAt = performance.now()
}
export function endDebugUpdate(s: State): void {
  if (!s.debug.stats) return
  const ui = getResources().debug, ms = performance.now() - ui.updateAt
  ui.updateMs += (ms - ui.updateMs) / 30
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, color = '#e8dcc8'): void {
  ctx.fillStyle = color; ctx.fillText(value, x, y)
}

function stats(ctx: CanvasRenderingContext2D, s: State, h: number): void {
  const res = getResources(), p = res.perf, samples = p.frameMs.filter(v => v > 0).sort()
  const mean = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0
  const p95 = samples.length ? samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))] : 0
  const pass = (id: string): string => (p.pass[id] ?? 0).toFixed(2)
  const cpu = Object.entries(p.pass).reduce((n, [key, ms]) => n + (key === '@' ? 0 : ms), 0)
  const lines = [
    mean ? 'FPS ' + (1000 / mean).toFixed(0) + ' | frame ' + mean.toFixed(2) + ' ms | p95 ' + p95.toFixed(2) : 'FPS: warming up...',
    'CPU update ' + res.debug.updateMs.toFixed(2) + ' ms | render ' + cpu.toFixed(2) + ' ms',
    'tiles ' + pass('tiles') + ' | actors ' + pass('ents') + ' | dark ' + pass('dark') + ' | glow ' + pass('glow'),
    'Enemies ' + s.monsters.length + ' | L ' + s.monsters.filter(m => m.kind === 'lurker').length + ' S ' + s.monsters.filter(m => m.kind === 'stalker').length + ' D ' + s.monsters.filter(m => m.kind === 'devourer').length,
    'Q ' + s.settings.quality + ' -> ' + currentQuality(s).level + ' | chunks ' + (res.tiles?.chunks.size ?? 0) + '/24',
    'Torch ' + s.player.energy.toFixed(1) + '/' + s.player.energyMax + ' | ' + torchSeconds(s).toFixed(1) + 's at current burn',
    s.meta.screen + ' / ' + s.meta.phase + ' | zone ' + s.meta.zone + ' | steps ' + s.meta.steps,
    'Position ' + s.player.x.toFixed(1) + ', ' + s.player.y.toFixed(1) + ' | seed ' + (s.meta.seedText || '-'),
  ]
  const top = Math.max(8, h - lines.length * 16 - 24)
  ctx.fillStyle = 'rgba(8,10,14,0.92)'; ctx.fillRect(8, top, 425, lines.length * 16 + 16)
  ctx.font = '11px ' + FONT
  lines.forEach((line, i) => text(ctx, line, 16, top + 8 + i * 16))
}

export function drawDebug(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  if (s.debug.showPaths) drawAiDebug(ctx, s, w, h)
  drawDebugWorld(ctx, s, w, h)
  drawDebugNavigation(ctx, s, w, h)
  const ui = getResources().debug, l = debugLayout(s, w, h, ui.on, ui.tab)
  const dpr = ctx.getTransform().a
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
  ctx.font = '12px ' + FONT; ctx.textBaseline = 'top'; ctx.textAlign = 'left'
  if (s.debug.stats) stats(ctx, s, h)
  ctx.font = '12px ' + FONT
  if (ui.on) {
    ctx.fillStyle = 'rgba(12,14,19,0.96)'; ctx.fillRect(l.panel.x, l.panel.y, l.panel.w, l.panel.h)
    ctx.strokeStyle = '#8d7651'; ctx.lineWidth = 1; ctx.strokeRect(l.panel.x + 0.5, l.panel.y + 0.5, l.panel.w - 1, l.panel.h - 1)
    text(ctx, 'DEVELOPER TOOLS', l.panel.x + 12, l.panel.y + 12, '#ffd27a')
    text(ctx, debugRunActive(s) ? s.meta.screen + ' / ' + s.meta.phase : 'Start a run to enable player actions', l.panel.x + 10, l.panel.y + l.panel.h - 22, '#a5aab5')
    if (ui.tab === 1) {
      text(ctx, 'Leap skips windup and resumes enemy AI.', l.panel.x + 10, l.panel.y + 218)
      text(ctx, 'Targets nearest enemy in clear sight.', l.panel.x + 10, l.panel.y + 240)
      text(ctx, 'Spawn an enemy first if none is nearby.', l.panel.x + 10, l.panel.y + 262, '#a5aab5')
    } else if (ui.tab === 3) {
      text(ctx, 'Depth ' + debugDepthClass(s) + ' ' + depthName(debugDepthClass(s)) + (debugRunActive(s) ? ': restarts this seed' : ': next run'), l.panel.x + 150, l.panel.y + 12, '#a5aab5')
      text(ctx, 'Arrow: direct bearing, walls may block it.', l.panel.x + 10, l.panel.y + 242)
      text(ctx, 'Map: white floor, black wall; P / E / B.', l.panel.x + 10, l.panel.y + 260, '#a5aab5')
    } else if (ui.tab === 2) {
      text(ctx, 'Cyan: physical collision at ground level', l.panel.x + 10, l.panel.y + 218, '#65d9ef')
      text(ctx, 'Orange/red: hurt and swept bite volumes', l.panel.x + 10, l.panel.y + 240, '#ffb573')
      text(ctx, 'Timings are CPU estimates, not GPU time.', l.panel.x + 10, l.panel.y + 262, '#a5aab5')
    }
  }
  for (const r of l.controls) {
    const hover = r.enabled && contains(r, ui.mouseX, ui.mouseY)
    ctx.fillStyle = r.on ? '#3b3222' : hover ? '#30333b' : '#1c2028'
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeStyle = r.on || hover ? '#ffd27a' : '#505663'
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1)
    const color = !r.enabled ? '#717780' : r.on ? '#ffd27a' : '#e8dcc8'
    text(ctx, (r.on === undefined || r.id.startsWith('tab') || r.id.startsWith('depth') || r.id === 'open' ? '' : r.on ? '[x] ' : '[ ] ') + r.label, r.x + 7, r.y + 6, color)
    if (r.slider !== undefined) {
      const left = r.x + 8, trackY = r.y + 27, trackW = r.w - 16
      ctx.fillStyle = '#505663'; ctx.fillRect(left, trackY, trackW, 3)
      ctx.fillStyle = r.enabled ? '#ffb25b' : '#717780'
      ctx.fillRect(left, trackY, trackW * clamp(r.slider, 0, 1), 3)
      ctx.fillRect(left + trackW * clamp(r.slider, 0, 1) - 3, trackY - 4, 6, 11)
    }
  }
  ctx.restore()
}
