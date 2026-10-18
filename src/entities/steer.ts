import type { Monster } from '../core/types.ts'

export function seek(mx: number, my: number, tx: number, ty: number, vmax: number, arriveK = 3): [number, number] {
  const dx = tx - mx, dy = ty - my, length = Math.hypot(dx, dy)
  if (length < 1e-6) return [0, 0]
  const speed = Math.min(vmax, length * arriveK)
  return [dx / length * speed, dy / length * speed]
}

export function blend(m: Monster, dvx: number, dvy: number, rate: number, dt: number): void {
  const k = 1 - Math.exp(-rate * dt)
  m.vx += (dvx - m.vx) * k
  m.vy += (dvy - m.vy) * k
}
