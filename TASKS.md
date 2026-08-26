# TASKS.md — งานทั้งหมด

> อ่าน `PLAN.md` ก่อนเริ่มทุกครั้ง · ทำตามลำดับ phase · จบ task ติ๊ก `[x]` + note สั้นๆ ถ้ามีอะไรต้องรู้ต่อ

## Phase 0 — Scaffold ✅
- [x] โครง repo: `/server` (Express + Mongoose), `/web` (Vite React TS), `/pipeline`
- [x] `.env.example` (`MONGODB_URI`, `PORT`) + `.gitignore` + README วิธีรัน
- [x] `git init` + commit แรก (`.agent/.claude/.gemini` ถูก ignore — เป็นไฟล์ tooling)

## Phase 1 — Pipeline + DB ✅
- [x] Script import: อ่าน `Data/unified_points.csv` → collection `points`
      (แปลง type, สร้าง `location` GeoJSON, คำนวณ `localDate` + `localMinutes` ตาม timezone dataset)
- [x] สร้าง index: `2dsphere(location)`, `dataset+timestamp`, `dataset+localDate` (อยู่ท้าย import script)
- [x] Script สร้าง `tracks`: sort ต่อ device+วัน, ตัด segment เมื่อ gap > 120 วิ / speed > 45 m/s
- [x] Script สร้าง `daily_stats`: aggregate ต่อ dataset/วัน/ชั่วโมง (count, min/avg/max ต่อ metric)
- [x] Script ดึงโซน OSM (Overpass): cluster bbox จากจุดจริง + buffer, tag ตาม PLAN ข้อ 9,
      เก็บเฉพาะ polygon ที่มีจุดข้อมูล ≥ 5 จุดข้างใน → collection `zones` (`source: "osm"`)
- [x] **รันจริงกับ Atlas แล้ว** — `points` 81,629 / `tracks` 50 segments / `daily_stats` 113 / `zones` 18
      — โซน OSM ดึงเฉพาะไทย (`--thailand-only`) เพราะ Overpass ล้นบ่อย; Osaka ยังไม่มีโซน
        รันเพิ่มทีหลังได้: `node fetch_zones.js` (มี cache ใน `.overpass-cache/` ไม่ดึงซ้ำ, `--cache-only` = ไม่ยิงเน็ต)
      — หมายเหตุเครื่องนี้: Node resolve SRV ไม่ได้ lib.js เลย setServers 8.8.8.8/1.1.1.1
- [x] ตรวจยอด (dry-run ไม่ใช้ DB): CSV = 81,629 แถว / **50,036** มีพิกัด — ตรงกับ geojson
      (SCHEMA.md เขียน 50,033 เป็นเลขเก่าของเอกสาร ไม่ใช่ข้อมูลผิด)

## Phase 2 — API ✅
- [x] `GET /api/datasets` — สรุปต่อ dataset + `dates` (วันมีข้อมูลจริง สำหรับ date picker) + cache 5 นาที
- [x] `GET /api/points` — filter: dataset, date/dateEnd, timeStart/timeEnd, interpolated=hide|only, bbox, limit
      — response กระชับ `{columns, rows[[...]], truncated}` + `GET /api/points/:id` รายละเอียดเต็มสำหรับ popup
- [x] `GET /api/tracks` — filter dataset + ช่วงวัน; **ช่วงเวลาในวันให้ frontend ตัด vertex เองจาก `times[]`**
- [x] `GET /api/stats` — สรุปรวม หรือ `groupBy=hour|date` เป็น series
- [x] `GET/POST/PUT/DELETE /api/zones` — CRUD (validate ชื่อ/category/geometry ด้วย turf)
      — GET default เฉพาะ `nearData: true` (≤ ~20 กม. จากจุดข้อมูล, lazy compute + cache ใน doc), `?all=1` เอาหมด
- [x] `GET /api/zones/stats` — `$geoWithin` ต่อโซน + filter เวลา — ทดสอบจริง: วัดมหาธาตุ 1,764 จุด avg 60.2 dB
- [x] Error handler กลาง + fail ชัดเมื่อไม่มี `MONGODB_URI`
- ทดสอบแล้วทุก endpoint กับ Atlas จริง (health/datasets/points/point:id/stats/tracks/zones CRUD/zone stats/validation)

## Phase 3 — Web พื้นฐาน + แผนที่ ✅
- [x] Layout: navbar (Overview / dropdown ชุดข้อมูล / Zones / Dashboard) + i18n th/en toggle
      (`src/i18n.ts` เก็บ string ทั้งหมด, จำภาษาไว้ใน `localStorage.lang`)
- [x] หน้า Overview: แผนที่รวม — dataset เดินเก็บวาดจาก `tracks` (เบากว่าดึงจุดทั้งหมดมาก),
      dataset อยู่กับที่ดึง `/api/points?limit=3000` + toggle เปิด/ปิดต่อ dataset + การ์ดสรุป 5 ใบ
- [x] หน้า Dataset: MapLibre (OSM raster ไม่ใช้ key) + deck.gl ScatterplotLayer + สีตาม metric + legend gradient
      — ช่วงสี auto จาก min/max ที่เห็นจริง ถ้า min=max ใช้ `METRIC_RANGE` default
- [x] Popup click จุด — ครบ 15 คอลัมน์ (`GET /api/points/:id`) เวลาท้องถิ่นตาม `tzOffsetMin` ของ dataset
- [x] Layer panel: toggle จุด / heatmap / GPS ประมาณ / zones overlay (zone layer ใช้ร่วมกันที่ `src/zoneLayer.ts`)
- [x] สลับแผนที่ฐาน ถนน/ดาวเทียม (Esri World Imagery + layer ป้ายชื่อ ไม่ต้องใช้ key) — ปุ่มมุมซ้ายล่างของแผนที่ทุกหน้า
      จำค่าไว้ใน `localStorage.basemap`
- [x] Hover โซน = tooltip ชื่อ + ประเภท + ที่มา (OSM/วาดเอง) + ไฮไลต์โซน
- [x] Filter วัน (dropdown เฉพาะวันมีข้อมูลจาก `dates`) + ช่วงเวลาในวัน (slider คู่ step 15 นาที) — ส่งเข้า `/api/points` ทุกครั้ง
- ตรวจแล้ว: `tsc -b` + `vite build` ผ่าน, dev server ตอบทุก route + proxy `/api` ผ่าน, ทุกโมดูล transform 200

## Phase 4 — เส้นทาง + Replay
- [ ] Layer เส้นทางเดิน — ไล่สีตาม metric
- [ ] Replay: play/pause/speed, จุดวิ่งตาม timestamp, respect filter

## Phase 5 — Zones UI
- [ ] หน้า Zones: แผนที่ + รายการโซน (ชื่อ ประเภท สี source)
- [ ] วาดโซนด้วย Terra Draw → form ชื่อ/ประเภท/สี → save
- [ ] แก้/ลบโซน (ลบต้อง confirm)
- [ ] แสดง zone stats ต่อโซน (respect filter เวลา)

## Phase 6 — Dashboard
- [ ] Tab ต่อ dataset: การ์ดสรุป + time series + histogram
- [ ] Section เปรียบเทียบข้าม dataset (เสียง 4 แหล่ง, อากาศ 2 แหล่ง)
- [ ] ตารางค่าเฉลี่ยต่อโซน
- [ ] ทุกกราฟ respect filter วัน/ช่วงเวลา

## Phase 7 — เก็บงาน
- [ ] ทดสอบ end-to-end ทุกหน้า ทุก filter
- [ ] ตรวจ performance: Walking 26k จุด ต้องลื่น
- [ ] ตรวจ i18n ครบทุก string
- [ ] อัปเดต README วิธีรันครบ (pipeline → server → web)

## Notes จาก agent
(เขียนต่อท้ายที่นี่เมื่อเจออะไรที่คนต่อไปต้องรู้)

- maplibre-gl v6 **ไม่มี default export** — ต้อง `import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'`
  และ `StyleSpecification` ก็ไม่ได้ export ออกมา ใช้ `MapOptions['style']` แทน
- `MapView` fit bounds ใหม่เมื่อ prop `fitKey` เปลี่ยนเท่านั้น (ส่งชื่อ dataset เข้าไป) — ไม่งั้นสลับ dataset
  จาก dropdown แล้วแผนที่ไม่ขยับ เพราะ component ไม่ remount (route เดิม param ต่าง) และไม่ zoom กระตุกทุกครั้งที่เปลี่ยน filter
- แผนที่ฐานสองแบบใส่ไว้ใน style เดียวตั้งแต่ init แล้วสลับด้วย `setLayoutProperty(..., 'visibility', ...)`
  **ห้ามใช้ `map.setStyle()` สลับ** — deck.gl overlay ที่ addControl ไว้จะหลุดไปด้วย
- `@deck.gl/core` ไม่ได้ export type `TooltipContent` ออกมาจาก index — ประกาศเองที่ `src/tooltip.ts`
  และ tooltip ใช้ field `text` (innerText) ไม่ใช่ `html` เพราะชื่อโซนมาจาก OSM/ผู้ใช้
- `/api/points?dataset=Walking` = 2.3 MB / ~1 วิ (26,490 จุด) — ยังไม่ได้เปิด gzip ฝั่ง server
  ถ้า Phase 7 พบว่าช้า ให้ใส่ middleware `compression` (ลดเหลือ ~1/4)
