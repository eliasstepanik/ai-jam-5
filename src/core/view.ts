// L0 core: integer device zoom shared by update (aim) and render. Pure, DOM-free.
// Spec: docs/architecture-render.md §4.1, architecture-rulings.md R-018, architecture-rulings-3.md R-131.
// No T.view.heightPx and no VIEW_H = 360 (deleted by R-131).

// World px visible per device-px row group: z = max(1, round(canvasHeightDevicePx / VIEW_H_DEV)).
export const VIEW_H_DEV = 480

// Integer device px per world px for a backing store `ch` device px tall.
export const deviceZoom = (ch: number): number => Math.max(1, Math.round(ch / VIEW_H_DEV))

// Same zoom in CSS px per world px, from the CSS height `h` and the device pixel ratio (R-131).
export const viewZoomCss = (h: number, dpr: number): number => deviceZoom(Math.round(h * dpr)) / dpr
