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

## Phase 7 — เก็บงาน
- [ ] **ทดสอบ end-to-end ทุกหน้า ทุก filter — ยังรันไม่ได้ ติด Atlas ต่อไม่ติด (ดู Blocker ล่าง)**
      script พร้อมแล้วที่ `server/test/e2e.cjs` (`cd server && npm run e2e`) — ยิงทุก endpoint ทุก filter
      เทียบผลให้สอดคล้องกัน เช่น hide+only = ทั้งหมด, ผลรวมรายชั่วโมง = ยอดรวม, ไม่มีแถวหลุดช่วงเวลา/bbox
- [x] ตรวจ performance
      - เปิด gzip ฝั่ง server (`compression`) — `/api/points` ของ Walking 2.3 MB เหลือราว 1/5
      - แยก bundle: `/zones` กับ `/dashboard` โหลดแบบ lazy — bundle หลักกลับจาก 2.7 MB เป็น 2.0 MB
        (556 KB gzip) · Dashboard 194 KB · Zones 26 KB โหลดตอนเข้าหน้าจริง
      - ยังไม่ได้วัดผล gzip กับ server จริง เพราะ Atlas ต่อไม่ได้
- [x] ตรวจ i18n — เขียน script ตรวจ key ที่ใช้จริงเทียบกับที่ประกาศ: ใช้ 105 static key + 19 dynamic pattern
      ครบทั้ง th/en ไม่มี key ขาด ไม่มีข้อความ hardcode (ยกเว้นป้ายปุ่มสลับภาษา `EN`/`ไทย` ซึ่งเป็นชื่อภาษา ไม่ต้องแปล)
      เก็บ 2 key ที่ประกาศแล้วไม่ได้ใช้: `popup.close` (ทำเป็น aria-label ปุ่มปิด) · `filter.from` (ป้าย "จาก" หน้า date picker)
- [x] อัปเดต README ครบ — ลำดับรัน pipeline, build จริง, ตาราง route, รายการ API, วิธีทดสอบ, แก้ปัญหาที่เจอบ่อย

### Blocker ปัจจุบัน
MongoDB Atlas ต่อไม่ได้: `Could not connect to any servers in your MongoDB Atlas cluster`
ตรวจแล้วว่า DNS SRV คืน 3 node ปกติ และ TCP ถึง `ac-mghtuin-shard-00-01:27017` ได้
แต่ driver ต่อไม่ผ่านแม้ยืด `serverSelectionTimeoutMS` เป็น 60 วิ = อาการของ **IP ไม่อยู่ใน Access List**
IP ขาออกตอนตรวจคือ `27.130.27.139` — แก้โดยเข้า cloud.mongodb.com → Network Access → Add Current IP Address
พอต่อได้แล้วให้รัน `cd server && npm run e2e` เพื่อปิด task แรกของ Phase 7

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
- **Replay ต้องข้ามช่องว่าง** — Walking ช่วงเวลาดิบกว้าง 100 วัน แต่เดินจริงรวมแค่ 457 นาที
  ถ้าไล่ตามเวลาดิบจะนิ่งเปล่าเกือบตลอด `buildTimeline()` เลยต่อเฉพาะช่วงที่มีข้อมูลเข้าด้วยกัน
  แล้ว replay เดินบน progress ของ timeline (แปลงกลับเป็นเวลาจริงด้วย `timelineToReal()` ตอนวาด/แสดงเวลา)
- **DataFilterExtension ส่งค่าเข้า GPU เป็น float32** — ห้ามใส่ epoch ms ตรงๆ (1.7e12 เหลือความละเอียด ~66 วินาที
  วัดจริงแล้ว) `LineDatum.p` เลยเก็บ progress บน timeline แทน (~1e7 ผิดพลาด 0 ms)
- Terra Draw วาดผ่าน layer ของ maplibre โดยตรง ส่วน deck.gl overlay อยู่ทับข้างบน
  ตอนเข้าโหมดวาดต้องปิด `pickable` ของ zone layer ไม่งั้น deck กินคลิกก่อนถึง Terra Draw
- `/api/zones/stats` ยิง aggregate ทีละโซน (N+1) — 18 โซนใช้ ~1.2–1.8 วิ ถ้าโซนเยอะขึ้นมากค่อยรวมเป็น query เดียว
- ทดสอบ API ที่มีข้อความไทยด้วย `curl -d @file.json` เท่านั้น — พิมพ์ JSON ไทย inline ใน Git Bash
  จะโดนแปลงเป็น `?` ตั้งแต่ก่อนถึง curl (ไม่ใช่บั๊กของ server เคยหลงมาแล้ว)
- **สี dataset เปลี่ยนใน Phase 6** — ชุดเดิมตกเกณฑ์ตาบอดสี (เขียว↔ส้ม ΔE 6.2) เปลี่ยนเป็นชุดที่ผ่าน validator
  ทั้งโหมดสว่าง/มืด (`DATASET_COLORS` + `DATASET_COLORS_DARK` ใน `api.ts`) แผนที่ใช้ชุดสว่าง กราฟสลับตามธีมเครื่อง
  สีผูกกับ dataset ตายตัว ห้ามไล่ตามลำดับใน list (ไม่งั้นกรองแล้วสีสลับ คนอ่านจำผิด)
- ห้ามทำกราฟสองแกน Y — คนละหน่วยให้แยกกราฟ (ทุก metric มีกราฟของตัวเอง)
- ทุกกราฟมีตาราง `ดูเป็นตัวเลข` พับไว้ข้างใต้ — ค่าต้องอ่านได้โดยไม่ต้อง hover
- import `echarts` ทั้งก้อนทำ bundle จาก 2.0 เป็น 3.3 MB — `components/Chart.tsx` ลงทะเบียนเฉพาะที่ใช้ เหลือ 2.7 MB
- `/api/points?dataset=Walking` = 2.3 MB / ~1 วิ (26,490 จุด) — ยังไม่ได้เปิด gzip ฝั่ง server
  ถ้า Phase 7 พบว่าช้า ให้ใส่ middleware `compression` (ลดเหลือ ~1/4)
