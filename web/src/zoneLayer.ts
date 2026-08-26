import { GeoJsonLayer } from '@deck.gl/layers'
import type { Zone } from './api'
import { hexToRgb } from './colors'

// zones overlay ใช้ร่วมกันทุกหน้า (PLAN ข้อ 7.6)
export function makeZoneLayer(zones: Zone[], onClick?: (zoneId: string) => void) {
  return new GeoJsonLayer({
    id: 'zones',
    data: {
      type: 'FeatureCollection',
      features: zones.map((z) => ({
        type: 'Feature',
        properties: { id: z._id, color: z.color, name: z.name },
        geometry: z.geometry,
      })),
    },
    getFillColor: (f: { properties: { color: string } }) =>
      [...hexToRgb(f.properties.color), 45] as [number, number, number, number],
    getLineColor: (f: { properties: { color: string } }) =>
      [...hexToRgb(f.properties.color), 180] as [number, number, number, number],
    getLineWidth: 2,
    lineWidthUnits: 'pixels',
    pickable: Boolean(onClick),
    onClick: onClick
      ? (pick: { object?: { properties: { id: string } } }) => {
          if (pick.object) onClick(pick.object.properties.id)
        }
      : undefined,
  })
}
