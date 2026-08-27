import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LineLayer, ScatterplotLayer } from '@deck.gl/layers'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import { DataFilterExtension } from '@deck.gl/extensions'
import type { Layer } from '@deck.gl/core'
import MapView from '../components/MapView'
import TimeFilter from '../components/TimeFilter'
import PointPopup from '../components/PointPopup'
import ReplayControls from '../components/ReplayControls'
import type { DatasetInfo, Metric, PointRow, TimeFilterState, TrackSeg, Zone } from '../api'
import { api, COL, DATASET_COLORS, filterParams } from '../api'
import { colorScale, cssGradient, hexToRgb, METRIC_RANGE, NULL_COLOR } from '../colors'
import { makeZoneLayer, zoneTooltip } from '../zoneLayer'
import { firstTooltip, POINTS_LAYER_ID, pointTooltip } from '../tooltip'
import type { LineDatum } from '../tracks'
import { buildTimeline, markersAt, timelineToReal, toLines, trimSegments } from '../tracks'

interface LayerToggles {
  points: boolean
  heatmap: boolean
  tracks: boolean
  replay: boolean
  zones: boolean
  interpolated: boolean // แสดงจุดพิกัดประมาณด้วยไหม
}

const TRAIL_FILTER = new DataFilterExtension({ filterSize: 1 })

// array ว่างตัวเดิมเสมอ — สร้างใหม่ทุก render จะทำให้ useMemo ที่พึ่งมันคิดใหม่ตลอด
const NO_ROWS: PointRow[] = []
const NO_SEGMENTS: TrackSeg[] = []

// วงของค่าที่สอง สาม ... เริ่มนอกวงทึบ (รัศมีสูงสุด 6px) แล้วไล่ออกทีละวง
const RING_LAYER_PREFIX = 'points-ring-'
const RING_RADIUS_PX = 8
const RING_GAP_PX = 3.5

// สัญลักษณ์ใน legend ต้องหน้าตาเหมือนที่เห็นบนแผนที่ — วงทึบตัวแรก วงกลวงไล่ใหญ่ขึ้นตัวถัดไป
function glyphStyle(i: number): CSSProperties {
  const size = i === 0 ? 9 : 9 + i * 3
  return i === 0
    ? { width: size, height: size, borderRadius: '50%', background: 'var(--text)' }
    : { width: size, height: size, borderRadius: '50%', border: '1.5px solid var(--text)' }
}

export default function DatasetPage({ datasets }: { datasets: DatasetInfo[] }) {
  const { name } = useParams()
  const { t } = useTranslation()
  const info = datasets.find((d) => d.dataset === name)

  const [filter, setFilter] = useState<TimeFilterState>({ date: null, dateEnd: null, timeStart: 0, timeEnd: 1439 })
  const [toggles, setToggles] = useState<LayerToggles>({
    points: true,
    heatmap: false,
    tracks: true,
    replay: false,
    zones: true,
    interpolated: true,
  })
  // แต่ละค่าที่วัดเป็น layer ของตัวเอง เปิดพร้อมกันได้ ลำดับในนี้ = ลำดับวงบนแผนที่
  const [activeMetrics, setActiveMetrics] = useState<Metric[]>([])
  // ผูกชื่อชุดข้อมูลไว้กับข้อมูลเสมอ แล้วค่อยคัดตอน render
  // ถ้าเก็บแยกกันแล้วล้างด้วย useEffect จะไม่ทัน — effect ของลูก (MapView) ทำงานก่อน effect ของแม่
  // MapView เลย fit ไปที่ bounds ของชุดเดิม แล้วปักธงว่า fit ให้ชุดใหม่แล้ว พอข้อมูลจริงมาก็ไม่ขยับอีก
  const [pointData, setPointData] = useState<{ dataset: string; rows: PointRow[]; truncated: boolean }>({
    dataset: '',
    rows: NO_ROWS,
    truncated: false,
  })
  const [trackData, setTrackData] = useState<{ dataset: string; segments: TrackSeg[] }>({
    dataset: '',
    segments: NO_SEGMENTS,
  })
  const rows = pointData.dataset === name ? pointData.rows : NO_ROWS
  const truncated = pointData.dataset === name && pointData.truncated
  const segments = trackData.dataset === name ? trackData.segments : NO_SEGMENTS
  const [zones, setZones] = useState<Zone[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<PointRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // replay — time เป็น epoch ms, เดินด้วย requestAnimationFrame คูณ speed
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)
  const [time, setTime] = useState(0)
  const timeRef = useRef(0)

  // สลับ dataset แล้วเก็บค่าที่เลือกไว้เท่าที่ชุดใหม่มีจริง ไม่เหลือเลยค่อยเปิดตัวแรกให้
  useEffect(() => {
    if (!info) return
    setActiveMetrics((cur) => {
      const keep = cur.filter((m) => info.metrics.includes(m))
      return keep.length ? keep : info.metrics.slice(0, 1)
    })
  }, [info])

  // เปลี่ยนชุดข้อมูลแล้วต้องปิดแผงรายละเอียด ไม่งั้นค้างอยู่กับจุดของชุดก่อนหน้า
  useEffect(() => {
    setSelected(null)
    setHovered(null)
  }, [name])

  useEffect(() => {
    if (!name) return
    setLoading(true)
    setError(null)
    api
      .points({ dataset: name, ...filterParams(filter) })
      .then((r) => setPointData({ dataset: name, rows: r.rows, truncated: r.truncated }))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [name, filter])

  useEffect(() => {
    api.zones().then(setZones).catch(() => setZones([]))
  }, [])

  // tracks กรองได้แค่ระดับวัน — ช่วงเวลาในวันตัด vertex เองฝั่งนี้
  useEffect(() => {
    if (!name || !info?.moving) {
      setTrackData({ dataset: name ?? '', segments: NO_SEGMENTS })
      return
    }
    const p: Record<string, string> = { dataset: name }
    if (filter.date) {
      p.date = filter.date
      if (filter.dateEnd && filter.dateEnd !== filter.date) p.dateEnd = filter.dateEnd
    }
    api
      .tracks(p)
      .then((segs) => setTrackData({ dataset: name, segments: segs }))
      .catch(() => setTrackData({ dataset: name, segments: NO_SEGMENTS }))
  }, [name, info?.moving, filter.date, filter.dateEnd])

  const visibleRows = useMemo(
    () => (toggles.interpolated ? rows : rows.filter((r) => r[COL.interp] === 0)),
    [rows, toggles.interpolated]
  )

  // ค่าแรกที่เปิดอยู่คือตัวหลัก — เส้นทาง heatmap และหมุด replay ไล่สีตามตัวนี้
  const primary: Metric = activeMetrics[0] ?? info?.metrics[0] ?? 'sound_db'
  const mIdx = COL[primary]

  // ช่วง min/max แยกต่อ metric — คนละหน่วยกัน ใช้ช่วงร่วมกันไม่ได้
  const ranges = useMemo(() => {
    const out = {} as Record<Metric, [number, number]>
    for (const m of new Set([primary, ...activeMetrics])) {
      const idx = COL[m]
      let lo = Infinity
      let hi = -Infinity
      for (const r of visibleRows) {
        const v = r[idx] as number | null
        if (v !== null) {
          if (v < lo) lo = v
          if (v > hi) hi = v
        }
      }
      out[m] = !Number.isFinite(lo) || lo === hi ? METRIC_RANGE[m] : [lo, hi]
    }
    return out
  }, [visibleRows, activeMetrics, primary])
  const [minV, maxV] = ranges[primary] ?? METRIC_RANGE[primary]

  const bounds = useMemo(() => {
    if (!rows.length) return null
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    for (const r of rows) {
      const lng = r[COL.lng] as number
      const lat = r[COL.lat] as number
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    }
    return [[minLng, minLat], [maxLng, maxLat]] as [[number, number], [number, number]]
  }, [rows])

  const trimmed = useMemo(
    () => (info ? trimSegments(segments, primary, info.tzOffsetMin, filter.timeStart, filter.timeEnd) : []),
    [segments, primary, info, filter.timeStart, filter.timeEnd]
  )
  const timeline = useMemo(() => buildTimeline(trimmed), [trimmed])
  const lines = useMemo(() => toLines(trimmed, timeline), [trimmed, timeline])

  // ช่วงเวลาเปลี่ยน (filter/dataset) = เริ่ม replay ใหม่ตั้งแต่ต้น
  useEffect(() => {
    timeRef.current = 0
    setTime(0)
    setPlaying(false)
  }, [timeline])

  useEffect(() => {
    if (!playing || !timeline) return
    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = now - last
      last = now
      const next = timeRef.current + dt * speed
      if (next >= timeline.total) {
        timeRef.current = timeline.total
        setTime(timeline.total)
        setPlaying(false)
        return
      }
      timeRef.current = next
      setTime(next)
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, timeline])

  // ติ๊กเปิด/ปิดค่าที่วัด — ต่อท้ายเสมอ ลำดับที่เลือกจึงเป็นลำดับวงจากในออกนอก
  const toggleMetric = (m: Metric) =>
    setActiveMetrics((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))

  const seek = (p: number) => {
    timeRef.current = p
    setTime(p)
  }

  const playPause = () => {
    if (!timeline) return
    // กดเล่นตอนอยู่ท้ายสุด = วนกลับไปเริ่มใหม่
    if (!playing && timeRef.current >= timeline.total) seek(0)
    setPlaying((p) => !p)
  }

  const replayOn = toggles.replay && Boolean(timeline)
  // time = progress บน timeline ที่ตัดช่องว่างออกแล้ว — ต้องแปลงกลับเป็นเวลาจริงก่อนใช้วาด
  const realTime = useMemo(() => (timeline ? timelineToReal(timeline, time) : 0), [timeline, time])
  const markers = useMemo(() => (replayOn ? markersAt(trimmed, realTime) : []), [replayOn, trimmed, realTime])

  const baseLayers = useMemo(() => {
    const out: Layer[] = []
    if (toggles.zones && zones.length) out.push(makeZoneLayer(zones))
    if (toggles.tracks && lines.length) {
      const lineColor = (d: LineDatum, alpha: number) =>
        [...(d.v === null ? NULL_COLOR : colorScale(d.v, minV, maxV)), alpha] as [number, number, number, number]
      // ตอน replay เส้นทั้งเส้นจาง แล้ววาดทับเฉพาะช่วงที่ผ่านไปแล้วให้เข้ม
      out.push(
        new LineLayer({
          id: 'tracks',
          data: lines,
          getSourcePosition: (d: LineDatum) => d.a,
          getTargetPosition: (d: LineDatum) => d.b,
          getColor: (d: LineDatum) => lineColor(d, replayOn ? 45 : 210),
          getWidth: 3,
          widthUnits: 'pixels',
          widthMinPixels: 2,
          updateTriggers: { getColor: [primary, minV, maxV, replayOn] },
        })
      )
      if (replayOn && timeline) {
        out.push(
          new LineLayer({
            id: 'tracks-trail',
            data: lines,
            getSourcePosition: (d: LineDatum) => d.a,
            getTargetPosition: (d: LineDatum) => d.b,
            getColor: (d: LineDatum) => lineColor(d, 235),
            getWidth: 4,
            widthUnits: 'pixels',
            widthMinPixels: 2,
            // filter บน GPU — เลื่อน filterRange ทุกเฟรมถูกกว่าคำนวณ data ใหม่
            getFilterValue: (d: LineDatum) => d.p,
            filterRange: [-1, time],
            extensions: [TRAIL_FILTER],
            updateTriggers: { getColor: [primary, minV, maxV] },
          })
        )
      }
    }
    if (toggles.heatmap) {
      const heatRows = visibleRows.filter((r) => r[mIdx] !== null)
      out.push(
        new HeatmapLayer({
          id: 'heatmap',
          data: heatRows,
          getPosition: (r: PointRow) => [r[COL.lng] as number, r[COL.lat] as number],
          getWeight: (r: PointRow) => (r[mIdx] as number) - minV + 1,
          radiusPixels: 40,
        })
      )
    }
    if (toggles.points) {
      const position = (r: PointRow) => [r[COL.lng] as number, r[COL.lat] as number] as [number, number]
      const pick = {
        pickable: true,
        onClick: (info2: { object?: PointRow }) => {
          if (info2.object) setSelected(info2.object[COL.id] as string)
        },
        onHover: (info2: { object?: PointRow }) => setHovered(info2.object ?? null),
      }
      if (!activeMetrics.length) {
        // ไม่ได้เปิดค่าไหนเลย = ดูแค่ตำแหน่ง ใช้สีประจำชุดข้อมูล
        out.push(
          new ScatterplotLayer({
            id: POINTS_LAYER_ID,
            data: visibleRows,
            getPosition: position,
            getFillColor: (r: PointRow) =>
              [...hexToRgb(DATASET_COLORS[info?.dataset ?? ''] ?? '#888888'), r[COL.interp] === 1 ? 90 : 200] as [number, number, number, number],
            radiusMinPixels: 2.5,
            radiusMaxPixels: 6,
            getRadius: 4,
            ...pick,
            updateTriggers: { getFillColor: [info?.dataset] },
          })
        )
      } else {
        // เปิดหลายค่าพร้อมกัน = วงซ้อนกันที่จุดเดียว ตัวแรกเป็นวงทึบ ที่เหลือเป็นวงรอบนอกไล่ออก
        // ตำแหน่งเดียวกันหมด ต่างกันแค่รัศมี (บอกว่าเป็นค่าไหน) กับสี (บอกว่าค่าเท่าไร)
        activeMetrics.forEach((m, i) => {
          const idx = COL[m]
          const [lo, hi] = ranges[m] ?? METRIC_RANGE[m]
          const rgba = (r: PointRow) => {
            const v = r[idx] as number | null
            const c = v === null ? NULL_COLOR : colorScale(v, lo, hi)
            return [...c, r[COL.interp] === 1 ? 90 : 220] as [number, number, number, number]
          }
          out.push(
            i === 0
              ? new ScatterplotLayer({
                  id: POINTS_LAYER_ID,
                  data: visibleRows,
                  getPosition: position,
                  getFillColor: rgba,
                  radiusMinPixels: 2.5,
                  radiusMaxPixels: 6,
                  getRadius: 4,
                  ...pick,
                  updateTriggers: { getFillColor: [m, lo, hi] },
                })
              : new ScatterplotLayer({
                  id: `${RING_LAYER_PREFIX}${m}`,
                  data: visibleRows,
                  getPosition: position,
                  filled: false,
                  stroked: true,
                  getLineColor: rgba,
                  getLineWidth: 1.6,
                  lineWidthUnits: 'pixels',
                  getRadius: RING_RADIUS_PX + (i - 1) * RING_GAP_PX,
                  radiusUnits: 'pixels',
                  pickable: false, // ให้วงทึบตรงกลางรับ hover/click ตัวเดียว ไม่งั้นซ้อนกันหลายชั้น
                  updateTriggers: { getLineColor: [m, lo, hi], getRadius: [i] },
                })
          )
        })
      }
    }
    if (replayOn && markers.length) {
      out.push(
        new ScatterplotLayer({
          id: 'replay-marker',
          data: markers,
          getPosition: (m: { pos: [number, number] }) => m.pos,
          getFillColor: (m: { v: number | null }) =>
            [...(m.v === null ? NULL_COLOR : colorScale(m.v, minV, maxV)), 255] as [number, number, number, number],
          getLineColor: [255, 255, 255, 230],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          stroked: true,
          radiusMinPixels: 7,
          radiusMaxPixels: 12,
          getRadius: 9,
          updateTriggers: { getFillColor: [primary, minV, maxV] },
        })
      )
    }
    return out
  }, [visibleRows, toggles, zones, mIdx, minV, maxV, primary, activeMetrics, ranges, info?.dataset, lines, replayOn, timeline, time, markers])

  const selectedRow = useMemo(
    () => (selected ? visibleRows.find((r) => r[COL.id] === selected) ?? null : null),
    [visibleRows, selected]
  )

  // วงเน้นจุดที่ hover / จุดที่เปิดรายละเอียดอยู่ — จุดวัดกว้างแค่ 4px ท่ามกลางหมื่นจุด
  // ถ้าไม่มีวงล้อม คลิกแล้วไม่มีทางรู้ว่าแผงข้างๆ พูดถึงจุดไหน
  // แยก memo จาก baseLayers เพราะ hover ยิงถี่มาก ไม่ควรลากให้ layer หนักๆ สร้างใหม่ทุกครั้ง
  const focusLayers = useMemo(() => {
    const rings: { pos: [number, number]; r: number }[] = []
    const posOf = (r: PointRow) => [r[COL.lng] as number, r[COL.lat] as number] as [number, number]
    // จุดที่เลือก = วงซ้อนสองชั้น / จุดที่ hover = วงเดียว แยกออกจากกันได้แม้ทับกันอยู่
    if (selectedRow) rings.push({ pos: posOf(selectedRow), r: 14 }, { pos: posOf(selectedRow), r: 8 })
    if (hovered && hovered[COL.id] !== selected) rings.push({ pos: posOf(hovered), r: 10 })
    if (!rings.length) return []
    const ring = (id: string, color: [number, number, number, number], width: number, grow: number) =>
      new ScatterplotLayer({
        id,
        data: rings,
        getPosition: (d: { pos: [number, number] }) => d.pos,
        getRadius: (d: { r: number }) => d.r + grow,
        radiusUnits: 'pixels',
        stroked: true,
        filled: false,
        getLineColor: color,
        getLineWidth: width,
        lineWidthUnits: 'pixels',
        pickable: false,
        updateTriggers: { getRadius: [rings] },
      })
    // วงดำจางรองข้างล่างก่อน แล้วค่อยวงขาวทับ — อ่านออกทั้งบนแผนที่ถนนและภาพดาวเทียม
    return [ring('point-focus-halo', [0, 0, 0, 130], 6, 0.5), ring('point-focus', [255, 255, 255, 245], 2.5, 0)]
  }, [hovered, selectedRow, selected])

  const layers = useMemo(() => [...baseLayers, ...focusLayers], [baseLayers, focusLayers])

  const tooltip = useMemo(
    () =>
      firstTooltip(
        pointTooltip(t, { metrics: activeMetrics, tzOffsetMin: info?.tzOffsetMin ?? 420, selectedId: selected }),
        zoneTooltip(t)
      ),
    [t, activeMetrics, info?.tzOffsetMin, selected]
  )

  if (!info) return <div className="page-pad error">{t('notFound')}</div>

  return (
    <div className="dataset-layout">
      <aside className="sidebar">
        <h2>{info.dataset}</h2>
        <div className="dim small">
          {info.count.toLocaleString()} {t('overview.points')} · {info.withCoords.toLocaleString()} {t('overview.withCoords')}
        </div>

        <TimeFilter dates={info.dates} value={filter} onChange={setFilter} />

        <div className="panel">
          <div className="panel-title">{t('layer.title')}</div>
          {(['points', 'heatmap', 'tracks', 'replay', 'zones', 'interpolated'] as (keyof LayerToggles)[]).map((k) => {
            // เส้นทาง/replay มีเฉพาะ dataset เดินเก็บ
            if ((k === 'tracks' || k === 'replay') && !info.moving) return null
            return (
              <label key={k} className="check">
                <input type="checkbox" checked={toggles[k]} onChange={(e) => setToggles({ ...toggles, [k]: e.target.checked })} />
                {t(`layer.${k}`)}
              </label>
            )
          })}
          <div className="panel-title" style={{ marginTop: 10 }}>
            {t('layer.measurements')}
          </div>
          <div className="dim small">{t('layer.measurementsHint')}</div>
          {info.metrics.map((m) => (
            <label key={m} className="check">
              <input type="checkbox" checked={activeMetrics.includes(m)} onChange={() => toggleMetric(m)} />
              {t(`metric.${m}`)}
            </label>
          ))}
          {!activeMetrics.length && <div className="dim small">{t('layer.noMetricSelected')}</div>}
          {activeMetrics.map((m, i) => {
            const [lo, hi] = ranges[m] ?? METRIC_RANGE[m]
            return (
              <div className="legend" key={m}>
                <div className="legend-head">
                  <span className="metric-glyph" style={glyphStyle(i)} />
                  {t(`metric.${m}`)}
                </div>
                <div className="legend-bar" style={{ background: cssGradient() }} />
                <div className="legend-labels">
                  <span>{lo.toFixed(1)}</span>
                  <span>{hi.toFixed(1)}</span>
                </div>
              </div>
            )
          })}
        </div>

        {toggles.replay && info.moving && (
          <ReplayControls
            total={timeline?.total ?? null}
            progress={time}
            realTime={realTime}
            playing={playing}
            speed={speed}
            tzOffsetMin={info.tzOffsetMin}
            onPlayPause={playPause}
            onSeek={seek}
            onSpeed={setSpeed}
          />
        )}

        {loading && <div className="dim">{t('loading')}</div>}
        {error && <div className="error">{error}</div>}
        {!loading && !rows.length && <div className="dim">{t('map.noData')}</div>}
        {truncated && <div className="warn">{t('map.truncated')}</div>}
      </aside>

      <div className="map-wrap">
        <MapView layers={layers} bounds={bounds} fitKey={info.dataset} getTooltip={tooltip} />
        {selected && <PointPopup pointId={selected} tzOffsetMin={info.tzOffsetMin} onClose={() => setSelected(null)} />}
      </div>
    </div>
  )
}
