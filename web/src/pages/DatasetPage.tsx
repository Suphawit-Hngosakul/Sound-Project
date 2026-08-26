import { useEffect, useMemo, useRef, useState } from 'react'
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
import { api, COL, filterParams } from '../api'
import { colorScale, cssGradient, METRIC_RANGE, NULL_COLOR } from '../colors'
import { makeZoneLayer, zoneTooltip } from '../zoneLayer'
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
  const [metric, setMetric] = useState<Metric>('sound_db')
  const [rows, setRows] = useState<PointRow[]>([])
  const [truncated, setTruncated] = useState(false)
  const [zones, setZones] = useState<Zone[]>([])
  const [segments, setSegments] = useState<TrackSeg[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // replay — time เป็น epoch ms, เดินด้วย requestAnimationFrame คูณ speed
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)
  const [time, setTime] = useState(0)
  const timeRef = useRef(0)

  // metric default = ตัวแรกที่ dataset มี
  useEffect(() => {
    if (info && !info.metrics.includes(metric)) setMetric(info.metrics[0] ?? 'sound_db')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info])

  useEffect(() => {
    if (!name) return
    setLoading(true)
    setError(null)
    api
      .points({ dataset: name, ...filterParams(filter) })
      .then((r) => {
        setRows(r.rows)
        setTruncated(r.truncated)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [name, filter])

  useEffect(() => {
    api.zones().then(setZones).catch(() => setZones([]))
  }, [])

  // tracks กรองได้แค่ระดับวัน — ช่วงเวลาในวันตัด vertex เองฝั่งนี้
  useEffect(() => {
    if (!name || !info?.moving) {
      setSegments([])
      return
    }
    const p: Record<string, string> = { dataset: name }
    if (filter.date) {
      p.date = filter.date
      if (filter.dateEnd && filter.dateEnd !== filter.date) p.dateEnd = filter.dateEnd
    }
    api.tracks(p).then(setSegments).catch(() => setSegments([]))
  }, [name, info?.moving, filter.date, filter.dateEnd])

  const visibleRows = useMemo(
    () => (toggles.interpolated ? rows : rows.filter((r) => r[COL.interp] === 0)),
    [rows, toggles.interpolated]
  )

  const mIdx = COL[metric]
  const [minV, maxV] = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    for (const r of visibleRows) {
      const v = r[mIdx] as number | null
      if (v !== null) {
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    if (!Number.isFinite(lo) || lo === hi) return METRIC_RANGE[metric]
    return [lo, hi]
  }, [visibleRows, mIdx, metric])

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
    () => (info ? trimSegments(segments, metric, info.tzOffsetMin, filter.timeStart, filter.timeEnd) : []),
    [segments, metric, info, filter.timeStart, filter.timeEnd]
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

  const layers = useMemo(() => {
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
          updateTriggers: { getColor: [metric, minV, maxV, replayOn] },
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
            updateTriggers: { getColor: [metric, minV, maxV] },
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
      out.push(
        new ScatterplotLayer({
          id: 'points',
          data: visibleRows,
          getPosition: (r: PointRow) => [r[COL.lng] as number, r[COL.lat] as number],
          getFillColor: (r: PointRow) => {
            const v = r[mIdx] as number | null
            const c = v === null ? NULL_COLOR : colorScale(v, minV, maxV)
            return [...c, r[COL.interp] === 1 ? 90 : 200] as [number, number, number, number]
          },
          radiusMinPixels: 2.5,
          radiusMaxPixels: 6,
          getRadius: 4,
          pickable: true,
          onClick: (pick: { object?: PointRow }) => {
            if (pick.object) setSelected(pick.object[COL.id] as string)
          },
          updateTriggers: { getFillColor: [metric, minV, maxV] },
        })
      )
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
          updateTriggers: { getFillColor: [metric, minV, maxV] },
        })
      )
    }
    return out
  }, [visibleRows, toggles, zones, mIdx, minV, maxV, metric, lines, replayOn, timeline, time, markers])

  const tooltip = useMemo(() => zoneTooltip(t), [t])

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
            {t('layer.colorBy')}
          </div>
          <select value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            {info.metrics.map((m) => (
              <option key={m} value={m}>
                {t(`metric.${m}`)}
              </option>
            ))}
          </select>
          <div className="legend">
            <div className="legend-bar" style={{ background: cssGradient() }} />
            <div className="legend-labels">
              <span>{minV.toFixed(1)}</span>
              <span>{maxV.toFixed(1)}</span>
            </div>
          </div>
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
