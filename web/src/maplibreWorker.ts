// maplibre หา worker ของตัวเองด้วย new URL('./maplibre-gl-worker.mjs', import.meta.url)
// ซึ่งพังทั้งสองฝั่ง: dev ชี้ไป /node_modules/.vite/deps/ (ไม่มีไฟล์)
// build ชี้ไป /assets/ (vite ไม่ได้ copy worker ไปด้วย)
//
// worker ไม่ขึ้น = source ชนิด geojson ไม่โหลดสักอัน (raster ยังปกติเพราะไม่ต้องใช้ worker)
// อาการคือวาดโซนแล้วไม่มีอะไรโผล่บนแผนที่ ทั้งที่ข้อมูลเข้า source ครบ
//
// ?worker&url ให้ vite bundle worker พร้อม maplibre-gl-shared.mjs ที่มันต้อง import
// แล้วคืน URL ที่ใช้ได้จริงทั้ง dev และ build (แค่ ?url จะได้ไฟล์เดียวขาด shared)
import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(maplibreWorkerUrl)
