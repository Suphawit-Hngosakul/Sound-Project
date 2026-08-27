import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, type MapOptions } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '../maplibreWorker' // ต้อง import ก่อนสร้าง Map — ตั้ง URL ของ worker ให้ถูก
import { MapboxOverlay } from '@deck.gl/mapbox'
import type { Layer, PickingInfo } from '@deck.gl/core'
import { useTranslation } from 'react-i18next'
import type { TooltipContent } from '../tooltip'

export type Basemap = 'street' | 'satellite'

// ห่างเกินนี้ (องศา ~110 กม. ต่อองศา) ถือว่าไปคนละพื้นที่ ให้กระโดดแทนการบิน
const FAR_JUMP_DEG = 1

// แผนที่ฐานสองแบบ ใส่ไว้ใน style เดียวตั้งแต่แรก แล้วสลับด้วย visibility
// (setStyle ทีหลังจะทำ deck.gl overlay หลุด) — ทั้งคู่ไม่ต้องใช้ API key
const BASE_STYLE: MapOptions['style'] = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
    satellite: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 19,
      attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    },
    // ภาพดาวเทียมไม่มีชื่อถนน/สถานที่ — ซ้อน layer ป้ายโปร่งใสทับตอนเปิดโหมดดาวเทียม
    satlabels: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© Esri',
    },
  },
  layers: [
    { id: 'osm', type: 'raster', source: 'osm' },
    { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
    { id: 'satlabels', type: 'raster', source: 'satlabels', layout: { visibility: 'none' } },
  ],
}

interface Props {
  layers: Layer[]
  bounds: [[number, number], [number, number]] | null
  // fit ครั้งแรกที่ข้อมูลมา แล้ว fit ใหม่เมื่อ fitKey เปลี่ยน (สลับ dataset)
  // — ไม่ fit ตอนเปลี่ยน filter เพราะ bounds คำนวณใหม่ทุกครั้งที่ข้อมูลมา
  fitKey?: string
  getTooltip?: (info: PickingInfo) => TooltipContent
  // เรียกครั้งเดียวตอนแผนที่พร้อม — หน้า Zones ต้องใช้ instance ต่อ Terra Draw
  onMapReady?: (map: MapLibreMap) => void
}

export default function MapView({ layers, bounds, fitKey = '', getTooltip, onMapReady }: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const overlayRef = useRef<MapboxOverlay | null>(null)
  const fittedKeyRef = useRef<string | null>(null)
  const [basemap, setBasemap] = useState<Basemap>(() => (localStorage.getItem('basemap') as Basemap) ?? 'street')
  // ชี้โดนอะไรที่คลิกได้อยู่ไหม — เอาไว้เปลี่ยนเคอร์เซอร์ให้รู้ว่าจุดนี้กดได้
  const [picking, setPicking] = useState(false)

  // เก็บ callback ไว้ใน ref — ถ้าใส่ใน deps ของ effect สร้างแผนที่ แผนที่จะถูกสร้างใหม่ทุก render
  const readyRef = useRef(onMapReady)
  readyRef.current = onMapReady

  useEffect(() => {
    const map = new MapLibreMap({
      container: containerRef.current!,
      style: BASE_STYLE,
      center: [100.6, 14.07],
      zoom: 9,
    })
    map.addControl(new NavigationControl(), 'top-right')
    const overlay = new MapboxOverlay({ layers: [] })
    map.addControl(overlay)
    mapRef.current = map
    overlayRef.current = overlay
    // เปิดทางให้ debug จาก console ตอน dev (vite ตัดทิ้งตอน build) — ปัญหาแผนที่ดูจาก
    // style layer จริงเท่านั้นถึงจะรู้เรื่อง เดาจากภาพหน้าจอไม่พอ
    if (import.meta.env.DEV) (window as unknown as { __map?: MapLibreMap }).__map = map
    map.once('load', () => readyRef.current?.(map))
    return () => {
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [])

  useEffect(() => {
    // onHover ระดับ deck ยิงต่อจาก onHover ของ layer (ที่ไม่ return true) — ครอบคลุมทุก layer ที่ pickable
    // MapboxOverlay ไม่ได้ส่ง getCursor ของ deck ไปถึง canvas ของ maplibre เลยต้องคุมเอง
    overlayRef.current?.setProps({
      layers,
      getTooltip,
      onHover: (info: PickingInfo) => setPicking(Boolean(info.object)),
    })
  }, [layers, getTooltip])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const sat = basemap === 'satellite'
      map.setLayoutProperty('osm', 'visibility', sat ? 'none' : 'visible')
      map.setLayoutProperty('satellite', 'visibility', sat ? 'visible' : 'none')
      map.setLayoutProperty('satlabels', 'visibility', sat ? 'visible' : 'none')
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
    localStorage.setItem('basemap', basemap)
  }, [basemap])

  useEffect(() => {
    if (bounds && mapRef.current && fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey
      const map = mapRef.current
      const here = map.getCenter()
      const [[minLng, minLat], [maxLng, maxLat]] = bounds
      // ไกลแค่ไหนถึงนับว่า "คนละที่" — กรุงเทพไปโอซาก้าราว 35 องศา
      // บินไปช้าๆ ข้ามทวีปไม่ได้ช่วยให้เข้าใจอะไร กระโดดไปเลยดีกว่า
      // ขยับใกล้ๆ ในพื้นที่เดิมค่อยเลื่อนให้เห็นว่าไปทางไหน
      const far =
        Math.abs((minLng + maxLng) / 2 - here.lng) > FAR_JUMP_DEG ||
        Math.abs((minLat + maxLat) / 2 - here.lat) > FAR_JUMP_DEG
      map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: far ? 0 : 600 })
    }
  }, [bounds, fitKey])

  return (
    <div className={picking ? 'map-container-wrap picking' : 'map-container-wrap'}>
      <div ref={containerRef} className="map-container" />
      <div className="basemap-switch seg">
        {(['street', 'satellite'] as Basemap[]).map((b) => (
          <button key={b} className={basemap === b ? 'seg-btn active' : 'seg-btn'} onClick={() => setBasemap(b)}>
            {t(`basemap.${b}`)}
          </button>
        ))}
      </div>
    </div>
  )
}
