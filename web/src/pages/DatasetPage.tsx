import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ScatterplotLayer } from '@deck.gl/layers'
import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import type { Layer } from '@deck.gl/core'
import MapView from '../components/MapView'
import TimeFilter from '../components/TimeFilter'
import PointPopup from '../components/PointPopup'
import type { DatasetInfo, Metric, PointRow, TimeFilterState, Zone } from '../api'
import { api, COL, filterParams } from '../api'
import { colorScale, cssGradient, METRIC_RANGE, NULL_COLOR } from '../colors'
import { makeZoneLayer, zoneTooltip } from '../zoneLayer'

interface LayerToggles {
  points: boolean
  heatmap: boolean
  zones: boolean
  interpolated: boolean // แสดงจุดพิกัดประมาณด้วยไหม
}

export default function DatasetPage({ datasets }: { datasets: DatasetInfo[] }) {
  const { name } = useParams()
  const { t } = useTranslation()
  const info = datasets.find((d) => d.dataset === name)

  const [filter, setFilter] = useState<TimeFilterState>({ date: null, dateEnd: null, timeStart: 0, timeEnd: 1439 })
  const [toggles, setToggles] = useState<LayerToggles>({ points: true, heatmap: false, zones: true, interpolated: true })
  const [metric, setMetric] = useState<Metric>('sound_db')
  const [rows, setRows] = useState<PointRow[]>([])
  const [truncated, setTruncated] = useState(false)
  const [zones, setZones] = useState<Zone[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const layers = useMemo(() => {
    const out: Layer[] = []
    if (toggles.zones && zones.length) out.push(makeZoneLayer(zones))
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
    return out
  }, [visibleRows, toggles, zones, mIdx, minV, maxV, metric])

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
          {(['points', 'heatmap', 'zones', 'interpolated'] as (keyof LayerToggles)[]).map((k) => (
            <label key={k} className="check">
              <input type="checkbox" checked={toggles[k]} onChange={(e) => setToggles({ ...toggles, [k]: e.target.checked })} />
              {t(`layer.${k}`)}
            </label>
          ))}
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
