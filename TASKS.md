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

## Phase 4 — เส้นทาง + Replay ✅
- [x] Layer เส้นทางเดิน — ไล่สีตาม metric ต่อช่วง (LineLayer ทีละคู่ vertex; PathLayer ได้สีเดียวต่อเส้น)
      ใช้ scale เดียวกับจุดวัด/legend · toggle เห็นเฉพาะ dataset เดินเก็บ
- [x] ตัด vertex ตามช่วงเวลาในวันฝั่ง client (`src/tracks.ts` — API กรองได้แค่ระดับวัน)
      segment เดียวแตกเป็นหลายท่อนได้ถ้าออกนอกหน้าต่างแล้วกลับเข้ามา
- [x] Replay: play/pause + speed 10/60/300/1200× + scrubber + เวลาท้องถิ่น, จุดวิ่ง interpolate ตาม timestamp
      เส้นที่ผ่านไปแล้วเข้ม ที่ยังไม่ถึงจาง (DataFilterExtension filter บน GPU)
- [x] respect filter ทั้งวันและช่วงเวลา — เปลี่ยน filter = timeline สร้างใหม่ เริ่มเล่นจากต้น
- ทดสอบ logic กับ track จริงทั้ง 3 dataset เดินเก็บ (Walking/OMU/Ayutthaya) ผ่านหมด 20 เคส
  รวม round-trip timeline, ความแม่น float32, ไม่มีช่วงที่จุดวิ่งหาย
- ตรวจ `localMinutesOf` ฝั่ง client ตรงกับ `localMinutes` ที่ server คำนวณ 8,000 แถว ไม่ผิดสักแถว (ทั้ง +7 และ OMU +9)

## Phase 5 — Zones UI ✅
- [x] หน้า Zones: แผนที่ + รายการโซน (สี ชื่อ ประเภท จำนวนจุด ที่มา) · คลิกโซนบนแผนที่หรือในรายการ = เลือก + zoom ไปหา
- [x] วาดโซนด้วย Terra Draw (polygon / rectangle / circle) → ฟอร์มชื่อ/ประเภท/สี → POST
      สีเริ่มต้นเปลี่ยนตามประเภทให้ จนกว่าผู้ใช้จะแตะ color picker เอง
- [x] แก้ (PUT ชื่อ/ประเภท/สี) / ลบ (confirm ก่อน) — error จาก server เด้งขึ้นในฟอร์ม
- [x] zone stats ต่อโซน — min/avg/max ทุก metric ที่มี + จำนวนจุด respect filter วัน/ช่วงเวลา
- ทดสอบ CRUD เต็มวงจรกับ Atlas จริง: POST → GET → PUT → stats (474 จุด avg 63.1 dB) → DELETE → 404
  ชื่อภาษาไทย round-trip ตรงทุก codepoint · validate name ว่าง/category ผิด คืน 400 พร้อมข้อความไทย · DB กลับมา 18 โซนเท่าเดิม
- หน้า Zones ดึง `?all=1` ตั้งใจ — ถ้ากรอง nearData โซนที่ผู้ใช้เพิ่งวาดไกลจากข้อมูลจะหายไปเงียบๆ หลังกดบันทึก
  ส่วนแผนที่หน้าอื่น (Overview/Dataset) ยังใช้ default nearData ตาม PLAN ข้อ 9 (ตอนนี้ 18 โซนผ่านเกณฑ์ทั้งหมด ผลเลยเท่ากัน)

## Phase 6 — Dashboard ✅
- [x] Tab ต่อ dataset: การ์ดสรุป (จุด/มีพิกัด + avg·min·max ต่อ metric) + กราฟเส้นรายชั่วโมง + histogram ต่อ metric
- [x] **เพิ่ม endpoint** `GET /api/stats/histogram?metric=&bins=` — หา min/max ก่อนแล้ว `$bucket` ช่วงกว้างเท่ากัน
      (ไม่ใช้ `$bucketAuto` เพราะได้ช่วงกว้างไม่เท่ากัน อ่านเป็น histogram ไม่ได้)
- [x] Section เปรียบเทียบ: เสียง 4 แหล่ง / อุณหภูมิ + ความชื้น 2 แหล่ง — กราฟเส้นรายชั่วโมงแกนเดียว
- [x] ตารางค่าเฉลี่ยต่อโซน (ทุก metric ที่มีข้อมูล เรียงตามจำนวนจุด)
- [x] ทุกส่วน respect filter วัน/ช่วงเวลา — filter แถวเดียวคุมทั้งหน้า
- ตรวจแล้ว: การรวมค่ารายชั่วโมงเป็นสรุปฝั่ง client (ถ่วงน้ำหนักด้วย count) ตรงกับ `/api/stats` ของ server
  ทุก metric ทุก dataset ผิดพลาด < 1e-6 — เลยไม่ต้องยิง API ซ้ำอีก 5 ครั้ง
- ตรวจ histogram: ผลรวมทุก bin = total, ค่าสูงสุดไม่ตกขอบ, metric ผิดคืน 400, dataset ที่ไม่มี metric คืน bins ว่าง

## Phase 7 — เก็บงาน ✅
- [x] ทดสอบ end-to-end ทุกหน้า ทุก filter — **331 เคส ผ่านหมด**
      - `server npm test` — 42 เคส validate filter + 89 เคสยิง API จริงกับ mongod ในเครื่อง (mongodb-memory-server)
        ใช้ fixture เล็กที่คำนวณคำตอบด้วยมือได้ ค่าคาดหวังเป็นตัวเลขตรงๆ ไม่ใช่แค่ "ไม่ error"
      - `web npm test` — 72 เคส logic ฝั่งเว็บ (เวลาท้องถิ่น, สี, timeline replay, สรุปสถิติ, กันช่วงวันกลับหัว)
      - `server npm run e2e` — 102 เคสยิง server ที่รันจริง (ใช้ได้ทั้ง Atlas และ fixture)
      - `web npm run test:ui` — 26 เคสขับ Edge จริงไล่ทุกหน้า ทั้ง dev server และ build จริง เก็บภาพไว้ `.ui-shots/`
- [x] ตรวจ performance
      - เปิด gzip ฝั่ง server (`compression`) — ยืนยันด้วยเทสต์ว่า response ใหญ่ถูกบีบจริง
      - แยก bundle: `/zones` กับ `/dashboard` โหลดแบบ lazy — bundle หลัก 2.0 MB (556 KB gzip)
        Dashboard 194 KB · Zones 26 KB โหลดตอนเข้าหน้าจริง
- [x] ตรวจ i18n — 105 static key + 19 dynamic pattern ครบทั้ง th/en ไม่มีข้อความ hardcode
- [x] อัปเดต README ครบ — ลำดับรัน pipeline, build, ตาราง route, API, คำสั่งทดสอบ, วิธีเปิดเว็บโดยไม่ต้องมี Atlas

### บั๊กที่เจอตอน debug รอบนี้ (แก้แล้วทุกตัว)
1. **หน้า Dashboard ขาวทั้งหน้า** — `echarts-for-react/lib/core` เป็น CommonJS และ vite prebundle เป็น
   `export default require_core()` เลยได้ object ซ้อน default สองชั้น React โยน "Element type is invalid"
   `tsc` กับ `vite build` ผ่านฉลุยเพราะ type ถูก ผิดแค่ตอน runtime — เจอเพราะเปิดเบราว์เซอร์จริงเท่านั้น
   แก้ที่ `components/Chart.tsx` แกะ `.default` จนเจอ component
2. **กราฟเส้นว่างเปล่าทั้งที่มีข้อมูล** — ชั่วโมงที่มีข้อมูลโดดๆ (เพื่อนบ้าน null) ไม่มีเส้นให้ลาก
   ตอนปิด `showSymbol` เลยไม่เห็นอะไรเลย เปิด symbol ถาวร
3. **param ผิดรูปถูกเมินเงียบๆ** — `timeStart=abc`, `interpolated=yes`, `dateEnd` ที่ไม่มี `date`,
   ช่วงวัน/เวลากลับหัว, `bbox` มุมสลับ, `limit=0` ทั้งหมดเคยผ่านแล้วคืนข้อมูล**ที่ไม่ถูกกรอง**กลับไป
   ตอนนี้ตอบ 400 พร้อมข้อความบอกเหตุ (`filters.js` เขียนใหม่ + ใช้ร่วมกันทุก route)
4. **`truncated` โกหก** — ข้อมูลมีพอดีเท่า `limit` แล้วรายงานว่าโดนตัด แก้เป็นขอเกินมา 1 แถวแล้วเทียบ
5. **zone id ผิดรูปตอบ 500** — เป็นความผิดของ request ควรเป็น 400
6. **เลือกวันเริ่มเลยวันจบได้** — ได้ช่วงกลับหัว (ตอนนี้ API ตอบ 400) และ dateEnd ที่ค้างอยู่หลุดจากตัวเลือกใน select
   แก้ให้ดันวันจบตามไปเสมอ (`setStartDate`)
7. **ปุ่ม "ช่วงวัน" เด้งกลับเป็น "วันเดียว"** ถ้าเลือกวันสุดท้ายอยู่ — โหมดดูจากการมี dateEnd อย่างเดียวแล้ว
8. **`/api/tracks` ไม่ validate วันที่** ต่างจาก endpoint อื่น — ใช้ตัว validate ตัวเดียวกันหมดแล้ว

### รอบแก้ "พิกัดเพี้ยนเป็นเส้นตรง"
อาการที่แจ้ง: โซนกับพิกัดเพี้ยนหมด Ayutthaya กลายเป็นเส้นตรงเฉียง 45 องศา ขึ้นแค่ 300 จุด

**ไม่ใช่บั๊กของโปรแกรม** — server ที่รันอยู่คือ `npm run dev:fixtures` ซึ่งเสิร์ฟข้อมูลปลอม
`fixtures.cjs` ปั้น Ayutthaya 300 จุดด้วย `lat: 14.35 + i * 0.0001, lng: 100.55 + i * 0.0001`
จึงเป็นเส้นตรงเฉียงพอดี ส่วนกรอบสีเขียวคือ `โซนทดสอบ` ที่ hardcode ไว้แถวบางโพ
ยืนยันโดยเทียบกับ `Data/unified_points.csv` โดยตรง: Ayutthaya มี 6,884 แถว / 5,832 มีพิกัด
พิกัดจริง lat 14.07592–14.35972 lng 100.5573–100.6156 (453 พิกัดไม่ซ้ำ) วิ่งตามถนนจริง

แก้ 3 อย่าง:
1. **`npm run dev:local` (ใหม่)** — `server/scripts/dev-local.cjs` ยก mongod ขึ้นที่ port 27018
   dbPath ถาวรที่ `server/.local-db` แล้วรัน pipeline จริงจาก CSV ให้อัตโนมัติ
   เช็คทีละ collection (points/tracks/daily_stats/zones) รันค้างกลางทางแล้วเปิดใหม่ทำต่อจากจุดที่ขาด
   pipeline scripts อ่าน `MONGODB_URI` จาก env และ dotenv ไม่ทับค่าที่ตั้งมาแล้ว จึงชี้ไป mongod ในเครื่องได้โดยไม่แตะ `.env`
   ผลที่ได้: points 81,629 · tracks 50 · daily_stats 113 · zones 28 (ตรงกับ SCHEMA.md)
2. **แถบเตือนข้อมูลปลอม** — `createApp(db, { demo })` ติด header `X-Data-Source: demo|real` ทุก response
   (`dev:fixtures` ส่ง demo) `api.ts` อ่าน header แล้ว `App.tsx` ขึ้นแถบสีส้มทุกหน้า
   ต้องใส่ `exposedHeaders` ใน cors ด้วย ไม่งั้น browser อ่าน header ข้ามโดเมนไม่ได้
3. **`fetch_zones.js --cache-only` ไม่หน่วงอีกต่อไป** — เดิมนอน 1.5 วิต่อ tag + 3 วิต่อ bbox
   ทั้งที่อ่านจาก cache ล้วน (5 bbox = ~1 นาทีเปล่าๆ) ตอนนี้ข้าม throttle เมื่อไม่ยิงเน็ต
4. **`fetch_zones.js` ไม่ทิ้งงานทั้งรอบเพราะคำขอเดียวล้ม** — Overpass ตอบ 504 ที่ bbox 4 หมวด university
   แล้ว `throw` ทิ้งผลของ 3 bbox แรกที่ดึงสำเร็จแล้ว ตอนนี้ retry 5 ครั้ง ถอย 5/15/30/60/60 วิ
   ล้มจนหมดรอบก็ข้ามไปต่อ แล้วรายงานท้ายสุดว่า bbox/หมวดไหนยังขาด (cache เป็นรายคำขอ รันซ้ำยิงเฉพาะที่ขาด)
   ดึงครบแล้วได้ 6,277 polygon เหลือ 28 โซนที่มีจุดข้อมูล >= 5 จุด ครอบคลุมทั้งไทยและโอซาก้า
   (มธ.รังสิต 11,476 จุด · อุทยานประวัติศาสตร์อยุธยา 4,886 · 大阪公立大学 森之宮/杉本 · 住吉大社)

### รอบแก้ "วาดโซนเองไม่ได้" + เพิ่มโหมดวาดอิสระ
**ต้นเหตุ: worker ของ maplibre ไม่เคยโหลดสำเร็จเลย ทั้ง dev และ build**
maplibre หา worker ตัวเองด้วย `new URL('./maplibre-gl-worker.mjs', import.meta.url)`
- dev: `import.meta.url` = `/node_modules/.vite/deps/maplibre-gl.js` -> ชี้ไปไฟล์ที่ไม่มี
- build: `import.meta.url` = `/assets/index-xxx.js` -> vite ไม่ได้ copy worker ไปไว้ที่นั่น

worker ไม่ขึ้น = **source ชนิด geojson ไม่โหลดสักอัน** (raster tile ยังปกติเพราะไม่ต้องใช้ worker)
Terra Draw เก็บรูปเข้า source ได้ครบ ค่า style ครบ แต่ `isSourceLoaded` เป็น false ตลอด
`querySourceFeatures` คืน 0 จอเลยว่างเปล่า — คลิกวาดแล้วเหมือนเว็บไม่ตอบสนอง
(deck.gl ไม่โดน เพราะวาดด้วย canvas ของตัวเอง โซน OSM เลยยังเห็นอยู่ ทำให้ดูเหมือนแผนที่ปกติดี)

หมายเหตุเดิมใน TASKS ที่เขียนว่า "พังเฉพาะ dev server ของ vite build จริงไม่เป็น" **ผิด**
เทสต์ UI ก็ยกเว้นเคสนี้ไว้เลยไม่มีใครจับได้ — ตอนนี้บังคับให้ผ่านทั้งสองฝั่ง

แก้ที่ `web/src/maplibreWorker.ts`: `?worker&url` ให้ vite bundle worker พร้อม
`maplibre-gl-shared.mjs` ที่มัน import แล้วส่ง URL เข้า `setWorkerUrl()`
(ใช้ `?url` เฉยๆ ไม่ได้ จะได้ไฟล์เดียวขาด shared) ต้องตั้ง `worker: { format: 'es' }`
ใน vite config ด้วย เพราะ maplibre สร้างด้วย `new Worker(url, { type: 'module' })`
build จริงออกมาเป็น chunk `maplibre-gl-worker-*.js` 478 KB

**เพิ่มโหมดวาดอิสระ** — `TerraDrawFreehandMode` ตั้ง `drawInteraction: 'click-move-or-drag'`
(ลากก็ได้ คลิกแล้วเลื่อนเมาส์ก็ได้) `minDistance: 8` px กันจุดถี่จนบวม `smoothing: 0.3` เกลี่ยมือสั่น
ลากวงรีหนึ่งรอบได้ ~31 จุด

**กันพลาดรอบหน้า** — เทสต์ UI วาดโซนจริงแล้วเช็คว่ารูปขึ้นบนแผนที่จริง
(`isSourceLoaded` + `querySourceFeatures`) และบังคับว่า request ของ worker ห้ามล้ม
`MapView` ยัด `window.__map` ไว้ตอน dev (vite ตัดทิ้งตอน build) ไว้ debug แผนที่จาก console
เพิ่ม `preview.proxy` ใน vite config ด้วย จะได้ยิงเทสต์กับ build จริงได้: `UI_BASE=http://localhost:4173 npm run test:ui`

### รอบเพิ่ม hover บอกจุด
เดิมจุดวัดคลิกได้อย่างเดียว ไม่มี feedback เลย จุดกว้าง 4 px ท่ามกลางหมื่นจุด
คลิกแล้วแผงรายละเอียดเปิดขึ้นมา แต่ไม่มีทางรู้ว่าแผงพูดถึงจุดไหนบนแผนที่

- **tooltip ตอน hover จุด** — เวลาท้องถิ่นของ dataset + ค่า metric ที่กำลังไล่สีอยู่ + บอกถ้าเป็นพิกัดประมาณ
  บรรทัดสุดท้ายสลับข้อความ: ยังไม่เลือก = "คลิกเพื่อดูค่าทั้งหมด" / เป็นจุดที่เปิดอยู่ = "จุดนี้คือจุดที่กำลังแสดงรายละเอียดอยู่"
- **วงเน้นบนแผนที่** — จุดที่เปิดรายละเอียดอยู่ได้วงซ้อนสองชั้น จุดที่ hover ได้วงเดียว
  วาดวงดำจางรองก่อนแล้ววงขาวทับ อ่านออกทั้งบนแผนที่ถนนและภาพดาวเทียม
  แยก `focusLayers` ออกจาก `baseLayers` เพราะ hover ยิงถี่มาก ไม่ควรลากให้ layer หนักสร้างใหม่ทุกครั้ง
- **เคอร์เซอร์เป็น pointer** — `MapboxOverlay` ไม่ส่ง `getCursor` ของ deck ไปถึง canvas ของ maplibre
  ต้องดักที่ `onHover` ระดับ deck (ยิงต่อจาก onHover ของ layer ที่ไม่ return true) แล้วใส่ class `.picking`
  ทับด้วย `cursor: pointer !important` เพราะ maplibre ตั้ง cursor ไว้ที่ canvas เอง
- **หน้าภาพรวมก็ hover ได้** — จุดที่นั่นไล่สีตามชุดข้อมูล tooltip เลยบอกชื่อชุด + เวลาท้องถิ่นของชุดนั้น
  (มีเฉพาะชุดที่อยู่กับที่ ชุดที่เดินเก็บแสดงเป็นเส้นทาง)
- เทสต์ UI เล็งจุดด้วยการ project พิกัดจริงเป็นพิกัดจอ — กวาดเมาส์มั่วไม่โดน เพราะจุดกว้างไม่กี่พิกเซล
  และหน้าภาพรวม fit ทั้งไทยและโอซาก้าพร้อมกัน

### รอบทำค่าที่วัดให้เป็น layer
เดิม "สีตามค่า" เป็น `<select>` เลือกได้ทีละค่า อยู่แยกจากแผงเลเยอร์ ทั้งที่มันคือเลเยอร์เหมือนกัน

- ค่าที่วัดทุกตัวของชุดข้อมูลย้ายมาเป็น checkbox ในแผง `ค่าที่วัด` ติ๊กพร้อมกันได้หลายค่า
- **เปิดหลายค่า = วงซ้อนกันที่จุดเดียว** ตัวแรกเป็นวงทึบ ตัวถัดไปเป็นวงกลวงไล่ออก (รัศมี 8, 11.5, 15, 18.5 px)
  ตำแหน่งเดียวกันหมด ต่างกันแค่รัศมี (บอกว่าเป็นค่าไหน) กับสี (บอกว่าค่าเท่าไร)
  รับ hover/click แค่วงทึบตรงกลาง ไม่งั้นซ้อนกันหลายชั้นแล้ว tooltip เด้งซ้ำ
- **ช่วง min/max แยกต่อ metric** — คนละหน่วยกัน ใช้ช่วงร่วมกันไม่ได้ legend จึงมีแถบสีของตัวเองทุกค่า
  พร้อมสัญลักษณ์วงที่หน้าตาตรงกับที่วาดบนแผนที่
- **ค่าแรกที่เลือกเป็นตัวหลัก** — เส้นทาง heatmap และหมุด replay ไล่สีตามตัวนี้ (สามอย่างนี้รับได้ค่าเดียว)
- ไม่ติ๊กเลย = จุดแสดงแค่ตำแหน่ง ใช้สีประจำชุดข้อมูล
- tooltip ตอน hover ขึ้นทุกค่าที่เปิดอยู่ตามลำดับเดียวกับวง
- สลับ dataset แล้วเก็บค่าที่เลือกไว้เท่าที่ชุดใหม่มีจริง ไม่เหลือเลยค่อยเปิดตัวแรกให้

### รอบแก้ "สลับชุดข้อมูลแล้วแผนที่ไม่วาปตาม"
อาการ: เลือกชุดข้อมูลจาก dropdown แล้วแผนที่ค้างอยู่ที่เดิม หรือช้าไปหนึ่งชุดตลอด
(เลือก OMU ได้กรุงเทพ เลือก Ayutthaya ต่อได้โอซาก้า)

**ต้นเหตุ: effect ของลูกทำงานก่อน effect ของแม่**
ตอน route param เปลี่ยน `DatasetPage` ไม่ remount `rows` จึงยังเป็นของชุดเดิม
render รอบนั้น MapView ได้ `fitKey` ใหม่ + `bounds` เก่า และ effect ของ MapView (ลูก) ทำงาน**ก่อน**
effect ล้างข้อมูลของ DatasetPage (แม่) เสมอ — แผนที่เลย fit ไปที่ bounds ของชุดเดิม
แล้วปักธง `fittedKeyRef` ว่า fit ให้ชุดใหม่แล้ว พอข้อมูลจริงมา `fitKey` ไม่เปลี่ยน จึงไม่ขยับอีก

ล้างด้วย `useEffect` แก้ไม่ได้เพราะลำดับ effect เป็นแบบนั้นอยู่แล้ว
แก้ด้วยการ**ผูกชื่อชุดข้อมูลไว้กับข้อมูล** (`{ dataset, rows }`) แล้วคัดตอน render
ข้อมูลของชุดเก่าจึงไม่มีทางหลุดไปถึง MapView ตั้งแต่แรก — ไม่ต้องพึ่งลำดับ effect เลย
`segments` ทำแบบเดียวกัน และใช้ค่าคงที่ array ว่างตัวเดิมเสมอ ไม่งั้น useMemo คิดใหม่ทุก render

**วาปแทนบิน** — ห่างเกิน 1 องศา (~110 กม.) ใช้ `duration: 0` กระโดดไปเลย
บินช้าๆ จากกรุงเทพไปโอซาก้าไม่ได้ช่วยให้เข้าใจอะไร ขยับใกล้ๆ ในพื้นที่เดิมค่อยเลื่อนให้เห็นทิศทาง

เปลี่ยนชุดข้อมูลแล้วปิดแผงรายละเอียดด้วย ไม่งั้นค้างอยู่กับจุดของชุดก่อนหน้า

### หมายเหตุ
- MongoDB Atlas ต่อไม่ได้ตลอดรอบนี้: DNS SRV คืน 3 node ปกติ TCP ถึง `ac-mghtuin-shard-00-01:27017` ได้
  แต่ driver ต่อไม่ผ่านแม้ยืด timeout 60 วิ = **IP ไม่อยู่ใน Access List** (IP ตอนตรวจ `27.130.27.139`)
  แก้ที่ cloud.mongodb.com → Network Access → Add Current IP Address
  ระหว่างนี้ทดสอบด้วย mongod ในเครื่องแทน (`npm test` / `npm run dev:local`) ครอบคลุมทุก endpoint แล้ว
  ตรวจซ้ำรอบล่าสุดยังต่อไม่ได้: TLS ตัดทันทีด้วย `tlsv1 alert internal error` (alert 80) = อาการของ IP ที่ไม่อยู่ใน Access List

## Notes จาก agent
(เขียนต่อท้ายที่นี่เมื่อเจออะไรที่คนต่อไปต้องรู้)

- **maplibre ต้องมี worker ถึงจะวาด source ชนิด geojson ได้** — raster tile ไม่ต้องใช้ แผนที่เลยดูปกติดี
  ทั้งที่ geojson ตายหมด อาการ: `map.isSourceLoaded(id)` false ตลอด `querySourceFeatures` คืน 0
  ข้อมูลใน source ครบแต่ไม่มีอะไรออกจอ `web/src/maplibreWorker.ts` ตั้ง URL ให้แล้ว ห้ามลบ import ใน `MapView`
- ตอน debug แผนที่ ใช้ `window.__map` ใน console ได้ (มีเฉพาะ dev) — `getStyle().layers`, `isSourceLoaded`,
  `querySourceFeatures` บอกความจริงได้ในไม่กี่วินาที เดาจากภาพหน้าจอเสียเวลากว่ามาก
- maplibre-gl v6 **ไม่มี default export** — ต้อง `import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'`
  และ `StyleSpecification` ก็ไม่ได้ export ออกมา ใช้ `MapOptions['style']` แทน
- `MapView` fit bounds ใหม่เมื่อ prop `fitKey` เปลี่ยนเท่านั้น (ส่งชื่อ dataset เข้าไป) — ไม่งั้นสลับ dataset
  จาก dropdown แล้วแผนที่ไม่ขยับ เพราะ component ไม่ remount (route เดิม param ต่าง) และไม่ zoom กระตุกทุกครั้งที่เปลี่ยน filter
- แผนที่ฐานสองแบบใส่ไว้ใน style เดียวตั้งแต่ init แล้วสลับด้วย `setLayoutProperty(..., 'visibility', ...)`
  **ห้ามใช้ `map.setStyle()` สลับ** — deck.gl overlay ที่ addControl ไว้จะหลุดไปด้วย
- `@deck.gl/core` ไม่ได้ export type `TooltipContent` ออกมาจาก index — ประกาศเองที่ `src/tooltip.ts`
  และ tooltip ใช้ field `text` (innerText) ไม่ใช่ `html` เพราะชื่อโซนมาจาก OSM/ผู้ใช้
- **Replay ต้องข้ามช่องว่าง** — Walking ช่วงเวลาดิบกว้าง 100 วัน แต่เดินจริงรวมแค่ 457 นาที
  ถ้าไล่ตามเวลาดิบจะนิ่งเปล่าเกือบตลอด `buildTimeline()` เลยต่อเฉพาะช่วงที่มีข้อมูลเข้าด้วยกัน
  แล้ว replay เดินบน progress ของ timeline (แปลงกลับเป็นเวลาจริงด้วย `timelineToReal()` ตอนวาด/แสดงเวลา)
- **DataFilterExtension ส่งค่าเข้า GPU เป็น float32** — ห้ามใส่ epoch ms ตรงๆ (1.7e12 เหลือความละเอียด ~66 วินาที
  วัดจริงแล้ว) `LineDatum.p` เลยเก็บ progress บน timeline แทน (~1e7 ผิดพลาด 0 ms)
- Terra Draw วาดผ่าน layer ของ maplibre โดยตรง ส่วน deck.gl overlay อยู่ทับข้างบน
  ตอนเข้าโหมดวาดต้องปิด `pickable` ของ zone layer ไม่งั้น deck กินคลิกก่อนถึง Terra Draw
- `/api/zones/stats` ยิง aggregate ทีละโซน (N+1) — 28 โซนใช้ ~0.25–0.31 วิ บน mongod ในเครื่อง
  (บน Atlas เคยวัดได้ ~1.2–1.8 วิ ที่ 18 โซน — ค่าหน่วงเน็ตล้วนๆ) ถ้าโซนเยอะขึ้นมากค่อยรวมเป็น query เดียว
- ทดสอบ API ที่มีข้อความไทยด้วย `curl -d @file.json` เท่านั้น — พิมพ์ JSON ไทย inline ใน Git Bash
  จะโดนแปลงเป็น `?` ตั้งแต่ก่อนถึง curl (ไม่ใช่บั๊กของ server เคยหลงมาแล้ว)
- **สี dataset เปลี่ยนใน Phase 6** — ชุดเดิมตกเกณฑ์ตาบอดสี (เขียว↔ส้ม ΔE 6.2) เปลี่ยนเป็นชุดที่ผ่าน validator
  ทั้งโหมดสว่าง/มืด (`DATASET_COLORS` + `DATASET_COLORS_DARK` ใน `api.ts`) แผนที่ใช้ชุดสว่าง กราฟสลับตามธีมเครื่อง
  สีผูกกับ dataset ตายตัว ห้ามไล่ตามลำดับใน list (ไม่งั้นกรองแล้วสีสลับ คนอ่านจำผิด)
- ห้ามทำกราฟสองแกน Y — คนละหน่วยให้แยกกราฟ (ทุก metric มีกราฟของตัวเอง)
- ทุกกราฟมีตาราง `ดูเป็นตัวเลข` พับไว้ข้างใต้ — ค่าต้องอ่านได้โดยไม่ต้อง hover
- import `echarts` ทั้งก้อนทำ bundle จาก 2.0 เป็น 3.3 MB — `components/Chart.tsx` ลงทะเบียนเฉพาะที่ใช้ เหลือ 2.7 MB
- **ก่อนไล่บั๊ก "ข้อมูลเพี้ยน" ให้เช็คก่อนว่ากำลังต่อกับ server ตัวไหน** — `dev:fixtures` เสิร์ฟข้อมูลปลอม
  ที่หน้าตาเหมือนบั๊ก (เส้นตรงเฉียง 300 จุด) ดูได้จากแถบสีส้มบนหน้าเว็บ หรือ `curl -I localhost:3001/api/datasets`
  แล้วอ่าน `X-Data-Source` — ใช้ข้อมูลจริงให้รัน `npm run dev:local`
- `/api/points?dataset=Walking` = 2.3 MB / ~1 วิ (26,490 จุด) — ยังไม่ได้เปิด gzip ฝั่ง server
  ถ้า Phase 7 พบว่าช้า ให้ใส่ middleware `compression` (ลดเหลือ ~1/4)
