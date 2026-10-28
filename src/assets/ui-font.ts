// Lazy local font loading; the FontFace survives hot swaps in the resource registry.
import url from './ui/HollowSigil-Bold.woff2?url'
import type { Resources } from './resources.ts'
export const UI_FONT_URL = url
export function loadUiFont(res: Resources): void {
  if (typeof FontFace === 'undefined' || res.ui.fontUrl === url) return
  const fonts = document.fonts as FontFaceSet & { add(face: FontFace): FontFaceSet; delete(face: FontFace): boolean }
  if (res.ui.font) fonts.delete(res.ui.font)
  const face = new FontFace('Hollow Sigil', `url("${url}")`, { weight: '700' })
  res.ui.fontUrl = url; res.ui.font = face; res.ui.fontReady = false
  void face.load().then(() => {
    if (res.ui.font !== face) return
    fonts.add(face); res.ui.fontReady = true
  }, () => { console.warn('[assets] UI font failed, using system fallback') })
}
