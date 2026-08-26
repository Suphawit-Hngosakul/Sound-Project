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

export interface Zone {
  _id: string
  name: string
  category: string
  color: string
  source: 'osm' | 'user'
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

export interface StatBlock {
  key: string | number | null
  count: number
  withCoords: number
  metrics: Partial<Record<Metric, { min: number; avg: number; max: number; count: number }>>
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

export const api = {
  datasets: () => get<DatasetInfo[]>('/api/datasets'),
  points: (params: Record<string, string>) => get<PointsResponse>('/api/points', params),
  pointDetail: (id: string) => get<PointDetail>(`/api/points/${id}`),
  tracks: (params: Record<string, string>) => get<TrackSeg[]>('/api/tracks', params),
  stats: (params: Record<string, string>) => get<StatBlock | StatBlock[]>('/api/stats', params),
  zones: (params?: Record<string, string>) => get<Zone[]>('/api/zones', params),
  zoneStats: (params: Record<string, string>) => get<unknown[]>('/api/zones/stats', params),
  createZone: (body: unknown) =>
    fetch('/api/zones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()),
  updateZone: (id: string, body: unknown) =>
    fetch(`/api/zones/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()),
  deleteZone: (id: string) => fetch(`/api/zones/${id}`, { method: 'DELETE' }).then((r) => r.json()),
}

export const DATASET_COLORS: Record<string, string> = {
  Walking: '#e6194b',
  OMU: '#4363d8',
  Ayutthaya: '#f58231',
  SiteInPuey: '#3cb44b',
  BirdIoTMic: '#911eb4',
}

// แสดงเวลาท้องถิ่นของ dataset (OMU = UTC+9 ที่เหลือ +7) — ห้ามใช้ timezone เครื่องผู้ใช้
export function formatLocalTime(isoOrMs: string | number, tzOffsetMin: number): string {
  const d = new Date(new Date(isoOrMs).getTime() + tzOffsetMin * 60000)
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

export function minutesToHHMM(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}
