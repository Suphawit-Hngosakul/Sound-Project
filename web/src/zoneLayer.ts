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

// zones overlay ใช้ร่วมกันทุกหน้า (PLAN ข้อ 7.6)
export function makeZoneLayer(zones: Zone[], onClick?: (zoneId: string) => void) {
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
      [...hexToRgb(f.properties.color), 45] as [number, number, number, number],
    getLineColor: (f: { properties: ZoneProps }) =>
      [...hexToRgb(f.properties.color), 180] as [number, number, number, number],
    getLineWidth: 2,
    lineWidthUnits: 'pixels',
    pickable: true, // ต้องเปิดไว้เสมอ ไม่งั้น hover ไม่ติด
    autoHighlight: true,
    highlightColor: [255, 255, 255, 80],
    onClick: onClick
      ? (pick: { object?: { properties: ZoneProps } }) => {
          if (pick.object) onClick(pick.object.properties.id)
        }
      : undefined,
  })
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
