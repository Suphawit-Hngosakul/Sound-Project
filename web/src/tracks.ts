import type { Metric, TrackSeg } from './api'

export interface Vertex {
  lng: number
  lat: number
  t: number // epoch ms
  v: number | null // ค่า metric ที่เลือก
}

export interface TrimmedSeg {
  id: string
  verts: Vertex[]
}

export interface LineDatum {
  a: [number, number]
  b: [number, number]
  v: number | null
  // ตำแหน่งของปลายทางบน timeline (ms) — ใช้ filter ตอน replay
  // เก็บเป็น progress ไม่ใช่ epoch ms เพราะ DataFilterExtension ส่งค่าเข้า GPU เป็น float32
  // (epoch ms ~1.7e12 เหลือความละเอียดแค่ระดับ 2 นาที ส่วน progress ~1e7 ละเอียดระดับ 2 ms)
  p: number
}

// นาทีในวันตามเวลาท้องถิ่นของ dataset (เทียบ localMinutes ฝั่ง server)
export function localMinutesOf(t: number, tzOffsetMin: number): number {
  const shifted = t + tzOffsetMin * 60000
  return Math.floor((((shifted % 86400000) + 86400000) % 86400000) / 60000)
}

// ตัด vertex ที่อยู่นอกช่วงเวลาในวัน — segment เดียวอาจแตกเป็นหลายท่อน
// (API ส่ง segment เต็มมา แล้วให้ frontend ตัดเอง — ดู TASKS Phase 2)
export function trimSegments(
  segs: TrackSeg[],
  metric: Metric,
  tzOffsetMin: number,
  timeStart: number,
  timeEnd: number
): TrimmedSeg[] {
  const out: TrimmedSeg[] = []
  const whole = timeStart <= 0 && timeEnd >= 1439
  for (const seg of segs) {
    const vals = seg.values?.[metric] ?? []
    let run: Vertex[] = []
    let part = 0
    const flush = () => {
      if (run.length) out.push({ id: `${seg.id}#${part++}`, verts: run })
      run = []
    }
    for (let i = 0; i < seg.geometry.coordinates.length; i++) {
      const t = seg.times[i]
      if (!whole) {
        const lm = localMinutesOf(t, tzOffsetMin)
        if (lm < timeStart || lm > timeEnd) {
          flush()
          continue
        }
      }
      const [lng, lat] = seg.geometry.coordinates[i]
      run.push({ lng, lat, t, v: vals[i] ?? null })
    }
    flush()
  }
  return out
}

// LineLayer วาดทีละคู่ vertex — ได้เส้นไล่สีตามค่า metric ต่อช่วง (PathLayer สีต่อเส้นได้อันเดียว)
export function toLines(segs: TrimmedSeg[], tl: Timeline | null): LineDatum[] {
  const out: LineDatum[] = []
  for (const s of segs) {
    for (let i = 0; i + 1 < s.verts.length; i++) {
      const a = s.verts[i]
      const b = s.verts[i + 1]
      out.push({
        a: [a.lng, a.lat],
        b: [b.lng, b.lat],
        v: b.v ?? a.v,
        p: tl ? realToTimeline(tl, b.t) : 0,
      })
    }
  }
  return out
}

export interface Timeline {
  spans: [number, number][] // ช่วงที่มีการเดินจริง เรียงตามเวลา ไม่ทับกัน
  total: number // ผลรวมความยาวช่วง (ms)
}

// Walking เก็บ 14 วัน แต่เดินจริงวันละไม่กี่สิบนาที — ถ้า replay ไล่ตามเวลาดิบ
// จะนิ่งเปล่าเกือบตลอด เลยต่อเฉพาะช่วงที่มีข้อมูลเข้าด้วยกันเป็น timeline เดียว
export function buildTimeline(segs: TrimmedSeg[]): Timeline | null {
  const raw: [number, number][] = []
  for (const s of segs) {
    if (s.verts.length < 2) continue
    raw.push([s.verts[0].t, s.verts[s.verts.length - 1].t])
  }
  if (!raw.length) return null
  raw.sort((a, b) => a[0] - b[0])
  const spans: [number, number][] = [raw[0]]
  for (const [a, b] of raw.slice(1)) {
    const last = spans[spans.length - 1]
    if (a <= last[1]) last[1] = Math.max(last[1], b)
    else spans.push([a, b])
  }
  const total = spans.reduce((sum, [a, b]) => sum + (b - a), 0)
  return total > 0 ? { spans, total } : null
}

// progress (0..total) -> เวลาจริง epoch ms
export function timelineToReal(tl: Timeline, progress: number): number {
  let left = Math.min(Math.max(progress, 0), tl.total)
  for (const [a, b] of tl.spans) {
    const dur = b - a
    if (left <= dur) return a + left
    left -= dur
  }
  return tl.spans[tl.spans.length - 1][1]
}

// เวลาจริง epoch ms -> progress (0..total); เวลาที่ตกในช่องว่างปัดไปต้นช่วงถัดไป
export function realToTimeline(tl: Timeline, t: number): number {
  let acc = 0
  for (const [a, b] of tl.spans) {
    if (t < a) return acc
    if (t <= b) return acc + (t - a)
    acc += b - a
  }
  return tl.total
}

export interface Marker {
  pos: [number, number]
  v: number | null
}

// ตำแหน่งจุดวิ่ง ณ เวลา t — interpolate ระหว่าง vertex; segment ที่ยังไม่เริ่ม/จบแล้วข้ามไป
export function markersAt(segs: TrimmedSeg[], t: number): Marker[] {
  const out: Marker[] = []
  for (const s of segs) {
    const v = s.verts
    if (v.length < 2 || t < v[0].t || t > v[v.length - 1].t) continue
    let lo = 0
    let hi = v.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (v[mid].t <= t) lo = mid
      else hi = mid
    }
    const a = v[lo]
    const b = v[hi]
    const span = b.t - a.t
    const f = span > 0 ? (t - a.t) / span : 0
    out.push({ pos: [a.lng + (b.lng - a.lng) * f, a.lat + (b.lat - a.lat) * f], v: a.v ?? b.v })
  }
  return out
}
