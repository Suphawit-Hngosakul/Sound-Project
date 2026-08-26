import { useEffect, useRef } from 'react'
import { Map as MapLibreMap, NavigationControl, type MapOptions } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { MapboxOverlay } from '@deck.gl/mapbox'
import type { Layer } from '@deck.gl/core'

// แผนที่ฐาน OSM raster (ไม่ใช้ API key) + deck.gl overlay
const OSM_STYLE: MapOptions['style'] = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
}

interface Props {
  layers: Layer[]
  bounds: [[number, number], [number, number]] | null
  // fit ครั้งแรกที่ข้อมูลมา แล้ว fit ใหม่เมื่อ fitKey เปลี่ยน (สลับ dataset)
  // — ไม่ fit ตอนเปลี่ยน filter เพราะ bounds คำนวณใหม่ทุกครั้งที่ข้อมูลมา
  fitKey?: string
}

export default function MapView({ layers, bounds, fitKey = '' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const fittedKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current!,
      style: OSM_STYLE,
      center: [100.6, 14.07],
      zoom: 9,
    })
    map.addControl(new NavigationControl(), 'top-right')
    const overlay = new MapboxOverlay({ layers: [] })
    map.addControl(overlay)
    mapRef.current = map
    overlayRef.current = overlay
    return () => {
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [])

  useEffect(() => {
    overlayRef.current?.setProps({ layers })
  }, [layers])

  useEffect(() => {
    if (bounds && mapRef.current && fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 })
    }
  }, [bounds, fitKey])

  return <div ref={containerRef} className="map-container" />
}
