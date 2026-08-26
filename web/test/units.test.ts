// unit test ของ logic ล้วนฝั่ง web — ไม่ต้องมี DB ไม่ต้องมี browser
import { filterParams, formatLocalTime, minutesToHHMM, setStartDate } from '../src/api'
import type { StatBlock } from '../src/api'
import { colorScale, cssGradient, hexToRgb, METRIC_RANGE, NULL_COLOR } from '../src/colors'
import { hourlyAvg, summarize } from '../src/stats'
import { localMinutesOf } from '../src/tracks'
import { zoneBounds } from '../src/zoneLayer'

let pass = 0, fail = 0
const check = (name: string, ok: boolean, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`) }
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// --- filterParams: ค่า default ต้องไม่ถูกส่งไป (ไม่งั้น query ยาวเปล่าๆ) ---
check('filter ว่าง = ไม่ส่ง param', eq(filterParams({ date: null, dateEnd: null, timeStart: 0, timeEnd: 1439 }), {}))
check('วันเดียว', eq(filterParams({ date: '2025-12-17', dateEnd: null, timeStart: 0, timeEnd: 1439 }), { date: '2025-12-17' }))
check('dateEnd เท่ากับ date = ไม่ส่ง dateEnd', eq(filterParams({ date: '2025-12-17', dateEnd: '2025-12-17', timeStart: 0, timeEnd: 1439 }), { date: '2025-12-17' }))
check('ช่วงวัน', eq(filterParams({ date: '2025-12-17', dateEnd: '2025-12-20', timeStart: 0, timeEnd: 1439 }), { date: '2025-12-17', dateEnd: '2025-12-20' }))
check('ช่วงเวลา', eq(filterParams({ date: null, dateEnd: null, timeStart: 540, timeEnd: 720 }), { timeStart: '540', timeEnd: '720' }))
check('dateEnd ไม่มี date = ไม่ส่ง (server ตอบ 400)', eq(filterParams({ date: null, dateEnd: '2025-12-20', timeStart: 0, timeEnd: 1439 }), {}))

// --- setStartDate: กันช่วงวันกลับหัว ---
const range = { date: '2025-12-17', dateEnd: '2025-12-20', timeStart: 0, timeEnd: 1439 }
check('เลือกวันเริ่มก่อนวันจบ = วันจบคงเดิม', eq(setStartDate(range, '2025-12-18'), { ...range, date: '2025-12-18' }))
check('เลือกวันเริ่มเลยวันจบ = ดันวันจบตาม', eq(setStartDate(range, '2025-12-25'), { ...range, date: '2025-12-25', dateEnd: '2025-12-25' }))
check('เลือกวันเริ่มเท่าวันจบ = ไม่เปลี่ยนวันจบ', eq(setStartDate(range, '2025-12-20'), { ...range, date: '2025-12-20' }))
check('โหมดวันเดียว (ไม่มี dateEnd) ไม่พัง', eq(setStartDate({ ...range, dateEnd: null }, '2025-12-25'), { ...range, date: '2025-12-25', dateEnd: null }))
check('setStartDate ไม่แก้ของเดิม', range.date === '2025-12-17' && range.dateEnd === '2025-12-20')

// --- เวลาท้องถิ่น: ห้ามใช้ timezone ของเครื่องผู้ใช้ ---
const utcNoon = '2025-12-17T12:00:00Z'
check('เวลาไทย +7', formatLocalTime(utcNoon, 420) === '2025-12-17 19:00:00', formatLocalTime(utcNoon, 420))
check('เวลา Osaka +9', formatLocalTime(utcNoon, 540) === '2025-12-17 21:00:00', formatLocalTime(utcNoon, 540))
check('ข้ามวันได้', formatLocalTime('2025-12-17T20:00:00Z', 540) === '2025-12-18 05:00:00', formatLocalTime('2025-12-17T20:00:00Z', 540))
check('รับ epoch ms ได้', formatLocalTime(Date.parse(utcNoon), 420) === '2025-12-17 19:00:00')

check('minutesToHHMM 0', minutesToHHMM(0) === '00:00')
check('minutesToHHMM 540', minutesToHHMM(540) === '09:00')
check('minutesToHHMM 1439', minutesToHHMM(1439) === '23:59')

// --- localMinutesOf ต้องตรงกับที่ server เก็บ ---
check('localMinutes เที่ยง UTC ที่ไทย = 19:00', localMinutesOf(Date.parse(utcNoon), 420) === 19 * 60)
check('localMinutes ที่ Osaka = 21:00', localMinutesOf(Date.parse(utcNoon), 540) === 21 * 60)
check('localMinutes ห่อรอบวันไม่ติดลบ', localMinutesOf(Date.parse('2025-12-17T00:30:00Z'), 540) === 9 * 60 + 30)
const wrap = localMinutesOf(Date.parse('2025-12-17T16:00:00Z'), 540)
check('localMinutes ข้ามเที่ยงคืนแล้ววนกลับ 0', wrap === 1 * 60, String(wrap))

// --- color scale ---
check('ต่ำสุด = สีแรก', eq(colorScale(0, 0, 100), [68, 1, 84]))
check('สูงสุด = สีสุดท้าย', eq(colorScale(100, 0, 100), [253, 231, 37]))
check('เกินช่วงถูก clamp', eq(colorScale(999, 0, 100), colorScale(100, 0, 100)) && eq(colorScale(-999, 0, 100), colorScale(0, 0, 100)))
check('min = max ไม่พัง', Array.isArray(colorScale(5, 5, 5)) && colorScale(5, 5, 5).length === 3)
check('ทุกค่า RGB อยู่ใน 0-255', [0, 25, 50, 75, 100].every((v) => colorScale(v, 0, 100).every((c) => c >= 0 && c <= 255)))
check('NULL_COLOR เป็นเทา', NULL_COLOR[0] === NULL_COLOR[1] && NULL_COLOR[1] === NULL_COLOR[2])
check('METRIC_RANGE ครบ 5 metric และ min < max', Object.values(METRIC_RANGE).length === 5 && Object.values(METRIC_RANGE).every(([a, b]) => a < b))
check('cssGradient เป็น linear-gradient', cssGradient().startsWith('linear-gradient(to right,'))

check('hexToRgb', eq(hexToRgb('#409eff'), [64, 158, 255]))
check('hexToRgb ขาว/ดำ', eq(hexToRgb('#ffffff'), [255, 255, 255]) && eq(hexToRgb('#000000'), [0, 0, 0]))

// --- zoneBounds ---
const poly = { _id: 'z', name: 'z', category: 'park', color: '#67c23a', source: 'osm' as const,
  geometry: { type: 'Polygon' as const, coordinates: [[[100.5, 13.8], [100.7, 13.8], [100.7, 13.9], [100.5, 13.9], [100.5, 13.8]]] } }
check('zoneBounds Polygon', eq(zoneBounds(poly), [[100.5, 13.8], [100.7, 13.9]]))
const multi = { ...poly, geometry: { type: 'MultiPolygon' as const, coordinates: [
  [[[100.5, 13.8], [100.6, 13.8], [100.6, 13.85], [100.5, 13.8]]],
  [[[100.9, 14.0], [101.0, 14.0], [101.0, 14.1], [100.9, 14.0]]]] } }
check('zoneBounds MultiPolygon ครอบทุกก้อน', eq(zoneBounds(multi), [[100.5, 13.8], [101.0, 14.1]]))

// --- summarize: ค่าเฉลี่ยต้องถ่วงน้ำหนัก ไม่ใช่เฉลี่ยของค่าเฉลี่ย ---
const blocks: StatBlock[] = [
  { key: 8, count: 100, withCoords: 90, metrics: { sound_db: { min: 40, avg: 50, max: 60, count: 100 } } },
  { key: 9, count: 300, withCoords: 300, metrics: { sound_db: { min: 30, avg: 70, max: 90, count: 300 } } },
]
const s = summarize(blocks)
check('summarize count', s.count === 400 && s.withCoords === 390)
check('summarize min/max', s.metrics.sound_db!.min === 30 && s.metrics.sound_db!.max === 90)
check('summarize avg ถ่วงน้ำหนัก = 65 ไม่ใช่ 60', s.metrics.sound_db!.avg === 65, String(s.metrics.sound_db!.avg))
check('summarize ไม่แก้ข้อมูลต้นทาง', blocks[0].metrics.sound_db!.avg === 50 && blocks[0].metrics.sound_db!.count === 100)
check('summarize ว่าง', eq(summarize([]), { key: null, count: 0, withCoords: 0, metrics: {} }))
const mixed = summarize([blocks[0], { key: 10, count: 5, withCoords: 5, metrics: { temp_c: { min: 20, avg: 25, max: 30, count: 5 } } }])
check('summarize metric ที่โผล่บางชั่วโมง', mixed.metrics.temp_c!.count === 5 && mixed.metrics.sound_db!.count === 100)

// --- hourlyAvg ---
const series = hourlyAvg(blocks, 'sound_db')
check('hourlyAvg ยาว 24 ช่อง', series.length === 24)
check('hourlyAvg วางค่าถูกชั่วโมง', series[8] === 50 && series[9] === 70)
check('hourlyAvg ชั่วโมงที่ไม่มีข้อมูลเป็น null ไม่ใช่ 0', series[0] === null && series[23] === null)
check('hourlyAvg metric ที่ไม่มี = null ล้วน', hourlyAvg(blocks, 'lux').every((v) => v === null))

console.log(`\n${pass} ผ่าน / ${fail} ไม่ผ่าน`)
process.exit(fail ? 1 : 0)
