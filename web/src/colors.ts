import type { Metric } from './api'

// color scale ต่อ metric — ไล่จากเย็นไปร้อน (สไตล์ viridis/inferno ย่อ)
type RGB = [number, number, number]

const STOPS: RGB[] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
]

export function colorScale(value: number, min: number, max: number): RGB {
  if (max <= min) return STOPS[2]
  const t = Math.min(1, Math.max(0, (value - min) / (max - min)))
  const f = t * (STOPS.length - 1)
  const i = Math.min(STOPS.length - 2, Math.floor(f))
  const u = f - i
  const a = STOPS[i]
  const b = STOPS[i + 1]
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u].map(Math.round) as RGB
}

export const NULL_COLOR: RGB = [160, 160, 160]

// ช่วงค่า default ต่อ metric (ใช้เมื่อข้อมูลชุดเล็กจน min=max)
export const METRIC_RANGE: Record<Metric, [number, number]> = {
  sound_db: [30, 100],
  temp_c: [20, 45],
  humidity_pct: [20, 100],
  lux: [0, 55000],
  uv_index: [0, 13],
}

export function cssGradient(): string {
  const pct = (i: number) => (i / (STOPS.length - 1)) * 100
  return `linear-gradient(to right, ${STOPS.map((s, i) => `rgb(${s.join(',')}) ${pct(i)}%`).join(', ')})`
}

export function hexToRgb(hex: string): RGB {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}
