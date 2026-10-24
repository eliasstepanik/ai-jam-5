// L0 core: depth class names and the class tag shown next to the normalised depth (issue #119). Pure: no state, no DOM, no clock.
// The 0..40 depth metric is class-blind by spec (score.ts DEPTH_MAX), so the HUD, the end screen and the title Best line
// show the class name and the real path length to the Beacon (tiles) next to it. Check: src/checks/depth-label.check.ts.

// Depth class names for classes 1..4 (R-164): DEPTH_NAMES[cls - 1]. Re-exported by src/ui/strings.ts.
export const DEPTH_NAMES = ['Shallow', 'Short', 'Standard', 'Deep'] as const

// Name for a depth class; anything that is not a finite number ('random', undefined, NaN) reads as Standard (class 3)
export const depthName = (c: number | 'random' | undefined): string =>
  typeof c === 'number' && Number.isFinite(c) ? DEPTH_NAMES[Math.min(4, Math.max(1, Math.round(c))) - 1] : DEPTH_NAMES[2]

// `Shallow · 262 tiles`: class name plus the Beacon path length in tiles (State.world.beaconDist).
// A beaconDist that is not a positive finite number (no world yet) leaves the name alone.
export const depthTag = (cls: number | 'random' | undefined, beaconDist: number): string =>
  Number.isFinite(beaconDist) && beaconDist > 0 ? `${depthName(cls)} · ${Math.round(beaconDist)} tiles` : depthName(cls)
