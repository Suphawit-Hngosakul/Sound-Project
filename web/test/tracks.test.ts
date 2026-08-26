// unit test ของ tracks.ts — สร้าง segment สังเคราะห์เอง ไม่ต้องพึ่ง API
import type { TrackSeg } from '../src/api'
import { buildTimeline, localMinutesOf, markersAt, realToTimeline, timelineToReal, toLines, trimSegments } from '../src/tracks'

let pass = 0, fail = 0
const check = (name: string, ok: boolean, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`) }

const TZ = 420
// สร้าง segment: เริ่มเวลาท้องถิ่น startMin ของวัน เดินทีละ 1 วินาที n จุด
function seg(id: string, dayIso: string, startMin: number, n: number, valueAt: (i: number) => number | null = (i) => 50 + i): TrackSeg {
  const base = Date.parse(dayIso + 'T00:00:00Z') - TZ * 60000 + startMin * 60000
  const times = Array.from({ length: n }, (_, i) => base + i * 1000)
  return {
    id, dataset: 'Walking', device: 'd1', localDate: dayIso,
    startTime: new Date(times[0]).toISOString(), endTime: new Date(times[n - 1]).toISOString(), pointCount: n,
    geometry: { type: 'LineString', coordinates: Array.from({ length: n }, (_, i) => [100 + i * 0.001, 13 + i * 0.001] as [number, number]) },
    times,
    values: { sound_db: Array.from({ length: n }, (_, i) => valueAt(i)), temp_c: [], humidity_pct: [], lux: [], uv_index: [] },
  }
}

// --- trimSegments ---
const s1 = seg('a', '2025-12-17', 600, 120) // 10:00 น. 120 วินาที
const all = trimSegments([s1], 'sound_db', TZ, 0, 1439)
check('ไม่กรองเวลา = ครบทุก vertex', all.length === 1 && all[0].verts.length === 120)
check('ค่า metric ติดมากับ vertex', all[0].verts[0].v === 50 && all[0].verts[10].v === 60)
check('เวลาท้องถิ่นตรง 10:00', localMinutesOf(all[0].verts[0].t, TZ) === 600)

const outside = trimSegments([s1], 'sound_db', TZ, 700, 800)
check('อยู่นอกหน้าต่างเวลา = ไม่เหลือท่อน', outside.length === 0)

// segment คร่อมขอบหน้าต่าง 10:00-10:02 -> เอาเฉพาะ 10:01 เป็นต้นไป
const partial = trimSegments([s1], 'sound_db', TZ, 601, 1439)
check('ตัดเฉพาะส่วนที่อยู่ในช่วง', partial.length === 1 && partial[0].verts.length === 60, `${partial[0]?.verts.length} vertex`)
check('vertex ที่เหลืออยู่ในช่วงทั้งหมด', partial[0].verts.every((v) => localMinutesOf(v.t, TZ) >= 601))

// ออกนอกช่วงแล้วกลับเข้ามา -> ต้องแตกเป็นสองท่อน ไม่ลากเส้นข้ามช่วงที่ถูกกรองออก
const morning = seg('m', '2025-12-17', 540, 60)
const noon = seg('n', '2025-12-17', 720, 60)
const both = trimSegments([morning, noon], 'sound_db', TZ, 0, 1439)
check('สอง segment = สองท่อน', both.length === 2)

// --- metric ที่ dataset ไม่มี ---
const noMetric = trimSegments([s1], 'temp_c', TZ, 0, 1439)
check('metric ที่ไม่มีค่า = vertex ครบแต่ค่าเป็น null', noMetric[0].verts.length === 120 && noMetric[0].verts.every((v) => v.v === null))

// --- toLines ---
const tl = buildTimeline(both)!
const lines = toLines(both, tl)
check('จำนวนเส้น = ผลรวม (vertex-1) ต่อท่อน', lines.length === 59 * 2, String(lines.length))
check('เส้นเชื่อมเฉพาะภายในท่อนเดียวกัน', lines.every((l) => l.a[0] !== l.b[0] || l.a[1] !== l.b[1]))
const ps = lines.map((l) => l.p)
check('ค่า filter อยู่ในช่วง timeline', Math.min(...ps) >= 0 && Math.max(...ps) <= tl.total)
const f32 = new Float32Array(ps)
check('ค่า filter รอด float32 (ห้ามใช้ epoch ms)', ps.every((p, i) => Math.abs(p - f32[i]) < 1))
const epochF32 = new Float32Array(both[0].verts.map((v) => v.t))
check('เทียบให้เห็น: epoch ms ผ่าน float32 เพี้ยนเป็นวินาที', Math.max(...both[0].verts.map((v, i) => Math.abs(v.t - epochF32[i]))) > 1000)

// --- timeline ข้ามช่องว่าง ---
check('timeline ตัดช่องว่างระหว่างเช้ากับเที่ยงออก', tl.total === 59_000 * 2, `${tl.total} ms`)
check('timeline มีสองช่วง ไม่ทับกัน', tl.spans.length === 2 && tl.spans[0][1] < tl.spans[1][0])
const samples = Array.from({ length: 25 }, (_, i) => (tl.total * i) / 24)
check('ทุกตำแหน่งบน timeline มีจุดวิ่ง', samples.every((p) => markersAt(both, timelineToReal(tl, p)).length > 0))
check('timelineToReal เดินหน้าอย่างเดียว', samples.every((p, i) => i === 0 || timelineToReal(tl, p) >= timelineToReal(tl, samples[i - 1])))
check('round-trip progress', samples.every((p) => Math.abs(realToTimeline(tl, timelineToReal(tl, p)) - p) < 1))
check('เวลาที่ตกในช่องว่างถูกดันไปต้นช่วงถัดไป', realToTimeline(tl, tl.spans[0][1] + 60_000) === tl.spans[0][1] - tl.spans[0][0])
check('clamp สองฝั่ง', timelineToReal(tl, -1) === tl.spans[0][0] && timelineToReal(tl, tl.total + 1) === tl.spans[1][1])
check('timeline ของท่อนสั้นเกิน (1 vertex) = null', buildTimeline([{ id: 'x', verts: [{ lng: 100, lat: 13, t: 1, v: 1 }] }]) === null)
check('timeline ของว่าง = null', buildTimeline([]) === null)

// --- markersAt ---
const r = tl.spans[0]
check('ก่อนเริ่ม = ไม่มีจุด', markersAt(both, r[0] - 1000).length === 0)
check('หลังจบทั้งหมด = ไม่มีจุด', markersAt(both, tl.spans[1][1] + 1000).length === 0)
const mid = markersAt(both, (r[0] + r[1]) / 2)
check('กลางท่อนแรกมีจุดเดียว (อีกท่อนยังไม่เริ่ม)', mid.length === 1)
check('จุดวิ่งอยู่ในกรอบข้อมูล', mid[0].pos[0] >= 100 && mid[0].pos[0] <= 100.12 && mid[0].pos[1] >= 13 && mid[0].pos[1] <= 13.12)
const p1 = markersAt(both, r[0] + 10_000)[0].pos
const p2 = markersAt(both, r[0] + 40_000)[0].pos
check('จุดวิ่งเดินหน้าตามเวลา', p2[0] > p1[0] && p2[1] > p1[1])
check('interpolate ระหว่าง vertex (ไม่กระโดดทีละจุด)', markersAt(both, r[0] + 1500)[0].pos[0] !== markersAt(both, r[0] + 1000)[0].pos[0])

console.log(`\n${pass} ผ่าน / ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
