import type { Metric, StatBlock } from './api'
import { METRICS } from './api'

// รวม series รายชั่วโมงกลับเป็นสรุปก้อนเดียว — ค่าเฉลี่ยถ่วงน้ำหนักด้วยจำนวนจุดของแต่ละชั่วโมง
// (ได้ผลเท่ากับเรียก /api/stats แบบไม่ groupBy โดยไม่ต้องยิงเพิ่มอีก 5 ครั้ง)
export function summarize(blocks: StatBlock[]): StatBlock {
  const out: StatBlock = { key: null, count: 0, withCoords: 0, metrics: {} }
  for (const b of blocks) {
    out.count += b.count
    out.withCoords += b.withCoords
    for (const m of METRICS) {
      const s = b.metrics[m]
      if (!s) continue
      const cur = out.metrics[m]
      if (!cur) out.metrics[m] = { ...s }
      else {
        cur.min = Math.min(cur.min, s.min)
        cur.max = Math.max(cur.max, s.max)
        cur.avg = (cur.avg * cur.count + s.avg * s.count) / (cur.count + s.count)
        cur.count += s.count
      }
    }
  }
  return out
}

// series ค่าเฉลี่ยรายชั่วโมง 0–23 (ชั่วโมงที่ไม่มีข้อมูล = null ไม่ใช่ 0)
export function hourlyAvg(blocks: StatBlock[], metric: Metric): (number | null)[] {
  const byHour = new Map(blocks.map((b) => [Number(b.key), b]))
  return Array.from({ length: 24 }, (_, h) => byHour.get(h)?.metrics[metric]?.avg ?? null)
}
