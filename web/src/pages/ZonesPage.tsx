import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { TerraDraw, TerraDrawCircleMode, TerraDrawPolygonMode, TerraDrawRectangleMode } from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import type { Layer } from '@deck.gl/core'
import MapView from '../components/MapView'
import TimeFilter from '../components/TimeFilter'
import ZoneForm from '../components/ZoneForm'
import ZoneStatsTable from '../components/ZoneStatsTable'
import type { DatasetInfo, TimeFilterState, Zone, ZoneInput, ZoneStat } from '../api'
import { api, filterParams } from '../api'
import { makeZoneLayer, zoneBounds, zoneTooltip } from '../zoneLayer'

type DrawMode = 'polygon' | 'rectangle' | 'circle'
const DRAW_MODES: DrawMode[] = ['polygon', 'rectangle', 'circle']

type Draft = { geometry: GeoJSON.Polygon } | Zone

export default function ZonesPage({ datasets }: { datasets: DatasetInfo[] }) {
  const { t } = useTranslation()
  const [zones, setZones] = useState<Zone[]>([])
  const [stats, setStats] = useState<ZoneStat[]>([])
  const [statsLoading, setStatsLoading] = useState(false)
  const [filter, setFilter] = useState<TimeFilterState>({ date: null, dateEnd: null, timeStart: 0, timeEnd: 1439 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drawMode, setDrawMode] = useState<DrawMode | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null) // โซนที่เพิ่งวาด หรือโซนที่กำลังแก้
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const drawRef = useRef<TerraDraw | null>(null)

  // วันที่มีข้อมูลจริงของทุก dataset รวมกัน — zone stats กินได้ทุกชุด
  const dates = useMemo(() => [...new Set(datasets.flatMap((d) => d.dates))].sort(), [datasets])

  const loadZones = useCallback(() => {
    api.zones({ all: '1' }).then(setZones).catch((e) => setError(String(e)))
  }, [])

  useEffect(loadZones, [loadZones])

  useEffect(() => {
    setStatsLoading(true)
    api
      .zoneStats(filterParams(filter))
      .then(setStats)
      .catch(() => setStats([]))
      .finally(() => setStatsLoading(false))
  }, [filter])

  // Terra Draw ต่อกับ maplibre โดยตรง (วาดเป็น layer ของแผนที่ ไม่ใช่ deck)
  const handleMapReady = useCallback((map: MapLibreMap) => {
    mapRef.current = map
    const draw = new TerraDraw({
      adapter: new TerraDrawMapLibreGLAdapter({ map }),
      modes: [new TerraDrawPolygonMode(), new TerraDrawRectangleMode(), new TerraDrawCircleMode()],
    })
    draw.start()
    draw.setMode('static')
    draw.on('finish', (id) => {
      const f = draw.getSnapshot().find((x) => x.id === id)
      if (f?.geometry.type === 'Polygon') setDraft({ geometry: f.geometry as GeoJSON.Polygon })
      draw.setMode('static')
      setDrawMode(null)
    })
    drawRef.current = draw
  }, [])

  useEffect(() => () => drawRef.current?.stop(), [])

  const startDraw = (m: DrawMode) => {
    const draw = drawRef.current
    if (!draw) return
    draw.clear()
    setDraft(null)
    setError(null)
    if (drawMode === m) {
      draw.setMode('static')
      setDrawMode(null)
    } else {
      draw.setMode(m)
      setDrawMode(m)
    }
  }

  // เปิดฟอร์มแก้โซนเดิม — ทิ้งรูปที่วาดค้างไว้ก่อน ไม่งั้นค้างบนแผนที่
  const startEdit = (z: Zone) => {
    drawRef.current?.clear()
    drawRef.current?.setMode('static')
    setDrawMode(null)
    setError(null)
    setDraft(z)
    setSelectedId(z._id)
  }

  const cancelDraft = () => {
    drawRef.current?.clear()
    drawRef.current?.setMode('static')
    setDrawMode(null)
    setDraft(null)
  }

  const saveDraft = async (input: ZoneInput) => {
    setError(null)
    const existing = draft && '_id' in draft ? draft : null
    if (existing) await api.updateZone(existing._id, input)
    else await api.createZone({ ...input, geometry: (draft as { geometry: GeoJSON.Polygon }).geometry })
    cancelDraft()
    loadZones()
  }

  const removeZone = async (z: Zone) => {
    if (!window.confirm(t('zonesPage.confirmDelete', { name: z.name }))) return
    try {
      await api.deleteZone(z._id)
      if (selectedId === z._id) setSelectedId(null)
      if (draft && '_id' in draft && draft._id === z._id) setDraft(null)
      loadZones()
    } catch (e) {
      setError(String(e))
    }
  }

  const selectZone = (id: string) => {
    setSelectedId(id)
    const z = zones.find((x) => x._id === id)
    if (z && mapRef.current) mapRef.current.fitBounds(zoneBounds(z), { padding: 80, maxZoom: 16, duration: 600 })
  }

  const statById = useMemo(() => new Map(stats.map((s) => [String(s.zoneId), s])), [stats])
  const selected = zones.find((z) => z._id === selectedId) ?? null

  const layers = useMemo<Layer[]>(
    () => (zones.length ? [makeZoneLayer(zones, { onClick: selectZone, selectedId, pickable: !drawMode })] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zones, selectedId, drawMode]
  )
  const tooltip = useMemo(() => zoneTooltip(t), [t])

  return (
    <div className="dataset-layout">
      <aside className="sidebar">
        <h2>{t('zonesPage.title')}</h2>
        <div className="dim small">{t('zonesPage.count', { n: zones.length })}</div>

        <TimeFilter dates={dates} value={filter} onChange={setFilter} />

        <div className="panel">
          <div className="panel-title">{t('zonesPage.draw')}</div>
          <div className="seg">
            {DRAW_MODES.map((m) => (
              <button key={m} className={drawMode === m ? 'seg-btn active' : 'seg-btn'} onClick={() => startDraw(m)}>
                {t(`zonesPage.mode.${m}`)}
              </button>
            ))}
          </div>
          <div className="dim small">{drawMode ? t(`zonesPage.hint.${drawMode}`) : t('zonesPage.drawHint')}</div>
        </div>

        {draft && <ZoneForm draft={draft} onSave={saveDraft} onCancel={cancelDraft} />}
        {error && <div className="error small">{error}</div>}

        <div className="panel">
          <div className="panel-title">{t('zonesPage.list')}</div>
          {!zones.length && <div className="dim small">{t('zonesPage.empty')}</div>}
          <ul className="zone-list">
            {zones.map((z) => {
              const s = statById.get(z._id)
              return (
                <li key={z._id} className={z._id === selectedId ? 'zone-row selected' : 'zone-row'}>
                  <button className="zone-main" onClick={() => selectZone(z._id)}>
                    <span className="swatch" style={{ background: z.color }} />
                    <span className="zone-name">{z.name}</span>
                    {/* ประเภท จำนวนจุด และที่มา รวมเป็นบรรทัดเดียว — แยกคอลัมน์แล้วไปชนกับปุ่มแก้/ลบ */}
                    <span className="zone-meta">
                      {[
                        t(`zoneCategory.${z.category}`),
                        s ? t('zonesPage.points', { n: s.count.toLocaleString() }) : null,
                        z.source === 'user' ? t('zone.sourceUser') : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                  <div className="zone-actions">
                    <button className="link-btn" onClick={() => startEdit(z)}>
                      {t('zonesPage.edit')}
                    </button>
                    <button className="link-btn danger" onClick={() => removeZone(z)}>
                      {t('zonesPage.delete')}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {selected && (
          <ZoneStatsTable zone={selected} stat={statById.get(selected._id) ?? null} loading={statsLoading} />
        )}
      </aside>

      <div className="map-wrap">
        <MapView layers={layers} bounds={null} fitKey="zones" getTooltip={tooltip} onMapReady={handleMapReady} />
      </div>
    </div>
  )
}
