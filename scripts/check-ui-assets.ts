// Structural gate for the delivered UI pack; no browser/runtime dependency.
import { readFileSync, readdirSync } from 'node:fs'
const root = new URL('../src/assets/ui/', import.meta.url)
const read = (name: string): Buffer => readFileSync(new URL(name, root))
const meta = JSON.parse(read('ui.json').toString())
const pngs = readdirSync(root).filter(n => n.endsWith('.png'))
let bytes = 0
for (const name of pngs) {
  const p = read(name); bytes += p.length
  if (p.subarray(1, 4).toString() !== 'PNG' || p.readUInt32BE(16) !== 128 || p.readUInt32BE(20) !== 64) throw Error('UI atlas dimensions: ' + name)
}
for (const theme of ['stone', 'ember', 'spectral', 'normal', 'copper', 'sodium', 'strontium', 'menu']) {
  if (!pngs.includes('ui-' + theme + '.png')) throw Error('Missing UI theme: ' + theme)
}
for (const name of ['panel_9slice', 'selection_9slice', 'heart_full', 'heart_empty', 'heart_lost', 'torch_0', 'torch_1', 'torch_2', 'meter_fill_tile', 'meter_tip', 'selection_pointer']) {
  const [x, y, w, h] = meta.sprites[name]?.rect ?? []
  if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 128 || y + h > 64) throw Error('UI source rect: ' + name)
}
if (meta.sprites.panel_9slice.slice_margins.join() !== '5,5,5,5') throw Error('UI nine-slice margins changed')
const font = read('HollowSigil-Bold.woff2')
if (font.subarray(0, 4).toString() !== 'wOF2' || bytes + font.length > 40000) throw Error('UI font format or bundle budget')
if (!read('LICENSE.txt').toString().includes('CC0')) throw Error('Missing UI provenance')
console.log('check-ui-assets ok (' + pngs.length + ' themes, ' + (bytes + font.length) + ' bytes)')
