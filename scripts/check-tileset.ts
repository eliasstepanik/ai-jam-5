// Structural integration gate for the delivered complete tileset. No render/DOM imports.
type Rect = { x: number; y: number; w: number; h: number }
type Frame = { frame: Rect; anchor: number[]; rotated: boolean; duration_ms?: number }
type Assembly = {
  inner_corner_autotile: { state_lookup: Record<string, string[]>; state_count: number }
  resource_wall_lookup: Record<string, Record<string, string[]>>
  beacon_fire_animation: { frames: string[]; fps: number; duration_ms: number }
}
export function verifyTileAssembly(value: unknown, fail: (s: string) => void): void {
  const j = value as { frames: Record<string, Frame>; assembly: Assembly }, a = j.assembly
  const requireFrame = (name: string): Frame | undefined => {
    const f = j.frames[name]
    if (!f) fail('tileset assembly references missing frame ' + name)
    return f
  }
  const rects = Object.entries(j.frames)
  for (let i = 0; i < rects.length; i++) {
    const [name, f] = rects[i]
    if (f.rotated || f.anchor?.length !== 2 || f.anchor.some(n => !Number.isInteger(n))) fail('invalid tileset anchor/rotation ' + name)
    for (let k = i + 1; k < rects.length; k++) {
      const r = f.frame, b = rects[k][1].frame
      if (r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h) fail('overlapping tileset rects ' + name + '/' + rects[k][0])
    }
  }
  const states = new Set<string>(), pad = (n: number): string => String(n).padStart(2, '0')
  for (let n = 0; n < 256; n++) {
    const edge = n & 15, diagonal = n >> 4, adjacent = [3, 6, 12, 9]
    let inner = 0
    for (let k = 0; k < 4; k++) if (diagonal & (1 << k) && !(edge & adjacent[k])) inner |= 1 << k
    const key = pad(edge) + ':' + pad(inner), names = a.inner_corner_autotile.state_lookup[key]
    states.add(key)
    if (!names || names.length !== (inner ? 3 : 1)) { fail('tileset lacks legal neighborhood ' + key); continue }
    names.forEach((name, i) => {
      const f = requireFrame(name)
      if (inner && (name !== `Wall_E${pad(edge)}_I${pad(inner)}_V${i + 1}` || f?.frame.w !== 48 || f.frame.h !== 96 || f.anchor.join() !== '8,8')) fail('invalid corner composite ' + name)
    })
  }
  if (states.size !== 47 || Object.keys(a.inner_corner_autotile.state_lookup).length !== 47) fail('tileset must cover all 47 legal corner states')
  for (const mineral of ['sodium', 'copper', 'strontium', 'resin']) {
    requireFrame('ui_raw_' + mineral)
    for (const direction of ['north', 'east', 'south', 'west']) {
      const names = a.resource_wall_lookup[mineral]?.[direction]
      if (!names || names.length !== 3) { fail('missing directional ore ' + mineral + '/' + direction); continue }
      names.forEach(name => requireFrame(name))
    }
  }
  const fire = a.beacon_fire_animation
  if (fire.frames.length !== 6 || new Set(fire.frames).size !== 6 || fire.fps !== 10 || fire.duration_ms !== 100) fail('beacon must have six 100ms frames at 10fps')
  for (const name of ['beacon_unlit', ...fire.frames]) {
    const f = requireFrame(name)
    if (f?.frame.w !== 128 || f.frame.h !== 160 || f.anchor.join() !== '64,104') fail('beacon frame/anchor mismatch ' + name)
  }
  for (const name of ['wall_cave_entrance_3wide', 'ground_heal_plant', ...[1, 2, 3].flatMap(n => ['ground_resin_blob_0' + n, 'ground_resin_big_0' + n])]) requireFrame(name)
}
