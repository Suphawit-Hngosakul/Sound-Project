import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers'
import type { Layer } from '@deck.gl/core'
import MapView from '../components/MapView'
import type { DatasetInfo, PointRow, TrackSeg, Zone } from '../api'
import { api, COL, DATASET_COLORS } from '../api'
import { hexToRgb } from '../colors'
import { makeZoneLayer } from '../zoneLayer'

// dataset เดินเก็บใช้ tracks (precompute แล้ว เบากว่ามาก) — dataset อยู่กับที่ใช้จุดตรงๆ
const STATIONARY_LIMIT = '3000'

export default function OverviewPage({ datasets }: { datasets: DatasetInfo[] }) {
  const { t } = useTranslation()
  const [tracks, setTracks] = useState<TrackSeg[]>([])
  const [pointsByDataset, setPointsByDataset] = useState<Record<string, PointRow[]>>({})
  const [zones, setZones] = useState<Zone[]>([])
  const [showZones, setShowZones] = useState(true)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const stationary = datasets.filter((d) => !d.moving || d.trackCount === 0)
    setLoading(true)
    Promise.all([
      api.tracks({}),
      Promise.all(
        stationary.map((d) =>
          api.points({ dataset: d.dataset, limit: STATIONARY_LIMIT }).then((r) => [d.dataset, r.rows] as const)
        )
      ),
    ])
      .then(([tr, pts]) => {
        setTracks(tr)
        setPointsByDataset(Object.fromEntries(pts))
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [datasets])

  useEffect(() => {
    api.zones().then(setZones).catch(() => setZones([]))
  }, [])

  const toggleDataset = (name: string) => {
    const next = new Set(hidden)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setHidden(next)
  }

  const visibleTracks = useMemo(() => tracks.filter((s) => !hidden.has(s.dataset)), [tracks, hidden])
  const visiblePoints = useMemo(
    () =>
      Object.entries(pointsByDataset)
        .filter(([name]) => !hidden.has(name))
        .flatMap(([name, rows]) => rows.map((r) => ({ name, r }))),
    [pointsByDataset, hidden]
  )

  // fit แผนที่ครั้งแรกที่ข้อมูลมา — ครอบทุก dataset
  const bounds = useMemo(() => {
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
    const add = (lng: number, lat: number) => {
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    }
    for (const s of tracks) for (const [lng, lat] of s.geometry.coordinates) add(lng, lat)
    for (const rows of Object.values(pointsByDataset))
      for (const r of rows) add(r[COL.lng] as number, r[COL.lat] as number)
    if (!Number.isFinite(minLng)) return null
    return [[minLng, minLat], [maxLng, maxLat]] as [[number, number], [number, number]]
  }, [tracks, pointsByDataset])

  const layers = useMemo(() => {
    const out: Layer[] = []
    if (showZones && zones.length) out.push(makeZoneLayer(zones))
    if (visibleTracks.length) {
      out.push(
        new PathLayer({
          id: 'overview-tracks',
          data: visibleTracks,
          getPath: (s: TrackSeg) => s.geometry.coordinates,
          getColor: (s: TrackSeg) => hexToRgb(DATASET_COLORS[s.dataset] ?? '#888888'),
          getWidth: 3,
          widthUnits: 'pixels',
          widthMinPixels: 2,
          pickable: false,
        })
      )
    }
    if (visiblePoints.length) {
      out.push(
        new ScatterplotLayer({
          id: 'overview-points',
          data: visiblePoints,
          getPosition: (d: { r: PointRow }) => [d.r[COL.lng] as number, d.r[COL.lat] as number],
          getFillColor: (d: { name: string }) =>
            [...hexToRgb(DATASET_COLORS[d.name] ?? '#888888'), 200] as [number, number, number, number],
          getRadius: 5,
          radiusMinPixels: 3,
          radiusMaxPixels: 8,
          pickable: false,
        })
      )
    }
    return out
  }, [visibleTracks, visiblePoints, zones, showZones])

  return (
    <div className="overview-layout">
      <div className="map-wrap">
        <MapView layers={layers} bounds={bounds} fitKey="overview" />
        <div className="map-legend">
          <div className="panel-title">{t('overview.title')}</div>
          {datasets.map((d) => (
            <label key={d.dataset} className="check">
              <input type="checkbox" checked={!hidden.has(d.dataset)} onChange={() => toggleDataset(d.dataset)} />
              <span className="swatch" style={{ background: DATASET_COLORS[d.dataset] }} />
              {d.dataset}
            </label>
          ))}
          <label className="check">
            <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
            {t('layer.zones')}
          </label>
          {loading && <div className="dim small">{t('loading')}</div>}
          {error && <div className="error small">{error}</div>}
        </div>
      </div>

      <section className="cards">
        {datasets.map((d) => (
          <article className="card" key={d.dataset}>
            <header className="card-head">
              <span className="swatch" style={{ background: DATASET_COLORS[d.dataset] }} />
              <h3>{d.dataset}</h3>
              <span className="tag">{d.moving ? t('overview.moving') : t('overview.stationary')}</span>
            </header>
            <div className="card-figure">
              {d.count.toLocaleString()} <small>{t('overview.points')}</small>
            </div>
            <dl className="card-kv">
              <dt>{t('overview.withCoords')}</dt>
              <dd>{d.withCoords.toLocaleString()}</dd>
              <dt>{t('overview.interpolated')}</dt>
              <dd>{d.interpolated.toLocaleString()}</dd>
              <dt>{t('overview.days')}</dt>
              <dd>
                {d.dates.length} <span className="dim small">({d.dateRange[0]} – {d.dateRange[1]})</span>
              </dd>
              <dt>{t('overview.devices')}</dt>
              <dd>{d.devices.length}</dd>
              {d.moving && (
                <>
                  <dt>{t('overview.tracks')}</dt>
                  <dd>{d.trackCount}</dd>
                </>
              )}
              <dt>{t('overview.metrics')}</dt>
              <dd className="metric-list">{d.metrics.map((m) => t(`metric.${m}`)).join(' · ')}</dd>
            </dl>
            <Link className="btn" to={`/dataset/${encodeURIComponent(d.dataset)}`}>
              {t('overview.openDataset')}
            </Link>
          </article>
        ))}
      </section>
    </div>
  )
}
