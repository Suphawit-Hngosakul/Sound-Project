// API client — ทุก endpoint ผ่าน vite proxy -> localhost:3001

export const METRICS = ['sound_db', 'temp_c', 'humidity_pct', 'lux', 'uv_index'] as const
export type Metric = (typeof METRICS)[number]

export interface DatasetInfo {
  dataset: string
  count: number
  withCoords: number
  interpolated: number
  dateRange: [string, string]
  dates: string[]
  devices: string[]
  metrics: Metric[]
  moving: boolean
  trackCount: number
  tzOffsetMin: number
}

// index ของ rows จาก /api/points (ตรงกับ columns ฝั่ง server)
export const COL = { id: 0, lng: 1, lat: 2, t: 3, localMinutes: 4, sound_db: 5, temp_c: 6, humidity_pct: 7, lux: 8, uv_index: 9, interp: 10 } as const
export type PointRow = [string, number, number, number, number, number | null, number | null, number | null, number | null, number | null, 0 | 1]

export interface PointsResponse {
  columns: string[]
  rows: PointRow[]
  truncated: boolean
}

export interface TrackSeg {
  id: string
  dataset: string
  device: string
  localDate: string
  startTime: string
  endTime: string
  pointCount: number
  geometry: { type: 'LineString'; coordinates: [number, number][] }
  times: number[]
  values: Record<Metric, (number | null)[]>
}

// ต้องตรงกับ CATEGORIES ฝั่ง server (routes/zones.js)
export const ZONE_CATEGORIES = ['worship', 'tourism', 'park', 'residential', 'commercial', 'university', 'other'] as const
export type ZoneCategory = (typeof ZONE_CATEGORIES)[number]

// สีเริ่มต้นต่อประเภท — ชุดเดียวกับที่ pipeline ใช้กับโซน OSM
export const CATEGORY_COLOR: Record<ZoneCategory, string> = {
  worship: '#e6a23c',
  tourism: '#f56c6c',
  park: '#67c23a',
  residential: '#909399',
  commercial: '#409eff',
  university: '#9b59b6',
  other: '#409eff',
}

export interface Zone {
  _id: string
  name: string
  category: string
  color: string
  source: 'osm' | 'user'
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

export interface ZoneInput {
  name: string
  category: ZoneCategory
  color: string
  geometry?: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

export interface ZoneStat {
  zoneId: string
  name: string
  category: string
  color: string
  source: 'osm' | 'user'
  count: number
  metrics: Partial<Record<Metric, { min: number; avg: number; max: number; count: number }>>
}

export interface StatBlock {
  key: string | number | null
  count: number
  withCoords: number
  metrics: Partial<Record<Metric, { min: number; avg: number; max: number; count: number }>>
}

export interface Histogram {
  metric: Metric
  min: number | null
  max: number | null
  binWidth: number
  total: number
  bins: { from: number; to: number; count: number }[]
}

export interface PointDetail {
  _id: string
  dataset: string
  device: string | null
  timestamp: string
  localDate: string
  localMinutes: number
  latitude: number | null
  longitude: number | null
  alt_m: number | null
  sound_db: number | null
  temp_c: number | null
  humidity_pct: number | null
  lux: number | null
  uv_index: number | null
  satellites: number | null
  gps_valid: boolean
  gps_interpolated: boolean
}

export interface TimeFilterState {
  date: string | null // null = ทุกวัน
  dateEnd: string | null
  timeStart: number // นาทีในวัน
  timeEnd: number
}

export function filterParams(f: TimeFilterState): Record<string, string> {
  const p: Record<string, string> = {}
  if (f.date) {
    p.date = f.date
    if (f.dateEnd && f.dateEnd !== f.date) p.dateEnd = f.dateEnd
  }
  if (f.timeStart > 0) p.timeStart = String(f.timeStart)
  if (f.timeEnd < 1439) p.timeEnd = String(f.timeEnd)
  return p
}

async function get<T>(url: string, params?: Record<string, string>): Promise<T> {
  const qs = params && Object.keys(params).length ? '?' + new URLSearchParams(params) : ''
  const res = await fetch(url + qs)
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
  return res.json()
}

// เขียนข้อมูล — ต้องโยน error ข้อความจาก server ออกมา (validate ชื่อ/ประเภท/geometry อยู่ฝั่งนั้น)
async function send<T>(url: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
  return data as T
}

export const api = {
  datasets: () => get<DatasetInfo[]>('/api/datasets'),
  points: (params: Record<string, string>) => get<PointsResponse>('/api/points', params),
  pointDetail: (id: string) => get<PointDetail>(`/api/points/${id}`),
  tracks: (params: Record<string, string>) => get<TrackSeg[]>('/api/tracks', params),
  stats: (params: Record<string, string>) => get<StatBlock | StatBlock[]>('/api/stats', params),
  statsBy: (params: Record<string, string>) => get<StatBlock[]>('/api/stats', params),
  histogram: (params: Record<string, string>) => get<Histogram>('/api/stats/histogram', params),
  zones: (params?: Record<string, string>) => get<Zone[]>('/api/zones', params),
  zoneStats: (params: Record<string, string>) => get<ZoneStat[]>('/api/zones/stats', params),
  createZone: (body: ZoneInput) => send<Zone>('/api/zones', 'POST', body),
  updateZone: (id: string, body: Partial<ZoneInput>) => send<Zone>(`/api/zones/${id}`, 'PUT', body),
  deleteZone: (id: string) => send<{ ok: true }>(`/api/zones/${id}`, 'DELETE'),
}

// สีประจำ dataset — ผ่าน validator ของ dataviz skill ทั้งโหมดสว่างและมืด
// (CVD ΔE ต่ำสุดของคู่ติดกัน 9.1 light / 8.4 dark, normal-vision 19.6 / 19.3)
// ชุดเดิม (#e6194b/#4363d8/...) ตกเกณฑ์ CVD คู่เขียว-ส้ม ΔE 6.2 เลยเปลี่ยน
export const DATASET_COLORS: Record<string, string> = {
  Walking: '#2a78d6',
  OMU: '#eb6834',
  Ayutthaya: '#1baf7a',
  SiteInPuey: '#eda100',
  BirdIoTMic: '#e87ba4',
}

// สเต็ปเดียวกันที่ปรับให้อ่านออกบนพื้นมืด (ไม่ใช่การพลิกสีอัตโนมัติ)
export const DATASET_COLORS_DARK: Record<string, string> = {
  Walking: '#3987e5',
  OMU: '#d95926',
  Ayutthaya: '#199e70',
  SiteInPuey: '#c98500',
  BirdIoTMic: '#d55181',
}

// แสดงเวลาท้องถิ่นของ dataset (OMU = UTC+9 ที่เหลือ +7) — ห้ามใช้ timezone เครื่องผู้ใช้
export function formatLocalTime(isoOrMs: string | number, tzOffsetMin: number): string {
  const d = new Date(new Date(isoOrMs).getTime() + tzOffsetMin * 60000)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export function minutesToHHMM(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
