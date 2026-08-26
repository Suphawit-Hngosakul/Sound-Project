import { GeoJsonLayer } from '@deck.gl/layers'
import type { PickingInfo } from '@deck.gl/core'
import type { TFunction } from 'i18next'
import type { Zone } from './api'
import { hexToRgb } from './colors'
import type { TooltipContent } from './tooltip'

const ZONE_LAYER_ID = 'zones'

interface ZoneProps {
  id: string
  name: string
  category: string
  source: 'osm' | 'user'
  color: string
}

interface ZoneLayerOptions {
  onClick?: (zoneId: string) => void
  selectedId?: string | null
  // ปิด pick ตอนกำลังวาดโซน ไม่งั้น deck กินคลิกก่อนถึง Terra Draw
  pickable?: boolean
}

// zones overlay ใช้ร่วมกันทุกหน้า (PLAN ข้อ 7.6)
export function makeZoneLayer(zones: Zone[], opts: ZoneLayerOptions = {}) {
  const { onClick, selectedId = null, pickable = true } = opts
  return new GeoJsonLayer({
    id: ZONE_LAYER_ID,
    data: {
      type: 'FeatureCollection',
      features: zones.map((z) => ({
        type: 'Feature',
        properties: { id: z._id, name: z.name, category: z.category, source: z.source, color: z.color } as ZoneProps,
        geometry: z.geometry,
      })),
    },
    getFillColor: (f: { properties: ZoneProps }) =>
      [...hexToRgb(f.properties.color), f.properties.id === selectedId ? 110 : 45] as [number, number, number, number],
    getLineColor: (f: { properties: ZoneProps }) =>
      [...hexToRgb(f.properties.color), f.properties.id === selectedId ? 255 : 180] as [number, number, number, number],
    getLineWidth: (f: { properties: ZoneProps }) => (f.properties.id === selectedId ? 4 : 2),
    lineWidthUnits: 'pixels',
    pickable,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 80],
    onClick: onClick
      ? (pick: { object?: { properties: ZoneProps } }) => {
          if (pick.object) onClick(pick.object.properties.id)
        }
      : undefined,
    updateTriggers: { getFillColor: [selectedId], getLineColor: [selectedId], getLineWidth: [selectedId] },
  })
}

// bbox ของ geometry — ใช้ zoom ไปที่โซนที่เลือก
export function zoneBounds(zone: Zone): [[number, number], [number, number]] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  const rings = zone.geometry.type === 'Polygon' ? zone.geometry.coordinates : zone.geometry.coordinates.flat()
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng
      if (lat < minLat) minLat = lat
      if (lng > maxLng) maxLng = lng
      if (lat > maxLat) maxLat = lat
    }
  }
  return [[minLng, minLat], [maxLng, maxLat]]
}

// tooltip ตอน hover โซน — ชื่อ + ประเภท; layer อื่น (จุดวัด) คืน null ปล่อยผ่าน
export function zoneTooltip(t: TFunction) {
  return (info: PickingInfo): TooltipContent => {
    if (info.layer?.id !== ZONE_LAYER_ID || !info.object) return null
    const p = (info.object as { properties: ZoneProps }).properties
    const source = t(p.source === 'osm' ? 'zone.sourceOsm' : 'zone.sourceUser')
    return { text: `${p.name}\n${t(`zoneCategory.${p.category}`)} · ${source}`, className: 'map-tooltip' }
  }
}
