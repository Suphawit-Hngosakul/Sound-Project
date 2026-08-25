# PLAN.md — IoT Field Data Web App

> **Agent ทุกตัวต้องอ่านไฟล์นี้ + `TASKS.md` ก่อนเริ่มงานเสมอ**
> อ่าน `Data/SCHEMA.md` ประกอบเพื่อเข้าใจข้อมูลต้นทาง
> อัปเดต checkbox ใน `TASKS.md` ทุกครั้งที่ทำงานเสร็จ

## 1. เป้าหมาย

Web app แสดงข้อมูล IoT ภาคสนาม (เสียง อุณหภูมิ ความชื้น แสง UV) จาก `Data/unified_points.csv`
บนแผนที่ — เห็นจุดวัด เส้นทางเดิน โซนพื้นที่ และ dashboard สรุปผลต่อ dataset

## 2. ข้อมูลต้นทาง

- `Data/unified_points.csv` — 81,629 แถว / 50,033 แถวมีพิกัด / 15 คอลัมน์ (schema ดู `Data/SCHEMA.md`)
- 5 dataset: `Walking` (กทม./ปทุม, เดินเก็บ, ครบทุก sensor), `OMU` (Osaka, เดินเก็บ, เสียงอย่างเดียว),
  `Ayutthaya` (เดินเก็บ, เสียง), `SiteInPuey` (มธ.รังสิต, อยู่กับที่, เสียง), `BirdIoTMic` (กทม./กาญจน์, อยู่กับที่, อุณหภูมิ+ความชื้น)
- จุดที่พิกัดมาจากการประมาณติด `gps_interpolated = 1` — ต้องแยกแสดง/กรองได้
- Timestamp: Walking + BirdIoTMic เป็น `+07:00`, ที่เหลือเป็น UTC `Z` — **OMU อยู่ Osaka (UTC+9)**
  การ filter ช่วงเวลาในวันต้องแปลงเป็นเวลาท้องถิ่นของ dataset ก่อนเสมอ
- ค่าว่าง = ไม่ได้วัด/glitch — ห้ามตีความเป็น 0

## 3. Tech stack (ตัดสินใจแล้ว — ห้ามเปลี่ยนเองโดยไม่ถามผู้ใช้)

| ส่วน | เลือกใช้ |
|---|---|
| Frontend | Vite + React + TypeScript + React Router |
| แผนที่ | MapLibre GL JS (OSM tiles, ไม่ใช้ API key) + deck.gl สำหรับจุดเยอะ/heatmap |
| วาดโซน | Terra Draw |
| กราฟ | ECharts |
| Geo utils | turf.js (point-in-polygon, bbox) |
| Backend | Node.js + Express + Mongoose |
| DB | **MongoDB Atlas** (cloud) — connection string ใน `.env` (`MONGODB_URI`), มี index `2dsphere` |
| ภาษา UI | **ไทยเป็นหลัก + toggle อังกฤษ** (i18n เช่น react-i18next, เก็บ string แยกไฟล์ th/en) |

โครง repo (monorepo แบบง่าย):

```
/server        Express API + Mongoose models + import script
/web           Vite React app
/pipeline      script preprocess (Node หรือ Python) — CSV → Mongo + ดึงโซน OSM
/Data          ข้อมูลต้นทาง (ห้ามแก้)
```

## 4. Database (MongoDB Atlas)

Collections:

- **`points`** — 1 doc ต่อการวัด: ทุกคอลัมน์จาก CSV + `location: GeoJSON Point` (เฉพาะแถวมีพิกัด)
  - index: `2dsphere(location)`, `dataset + timestamp`, `dataset + localDate`
  - เก็บ `localDate` (YYYY-MM-DD) + `localMinutes` (นาทีตั้งแต่เที่ยงคืน ตามเวลาท้องถิ่น dataset) — ให้ filter วัน/ช่วงเวลาเร็วโดยไม่คำนวณ timezone ตอน query
- **`tracks`** — เส้นทางเดินที่ precompute: LineString ต่อ segment (ตัดเมื่อ gap > 120 วิ หรือกระโดดไกลผิดปกติ) + ค่า sensor ต่อ vertex + ช่วงเวลา — ใช้วาดเส้น + replay
- **`zones`** — โซน: `{ name, category, color, geometry: Polygon/MultiPolygon, source: "osm" | "user", osmId? }`
- **`daily_stats`** — สถิติ precompute ต่อ dataset/วัน/ชั่วโมง (count, min/avg/max ต่อ metric) — ให้ dashboard เร็ว

## 5. API (Express)

```
GET  /api/datasets                          รายชื่อ + สรุปต่อ dataset
GET  /api/points?dataset=&date=&dateEnd=&timeStart=&timeEnd=&metric=&interpolated=&bbox=&limit=
GET  /api/tracks?dataset=&date=&timeStart=&timeEnd=
GET  /api/stats?dataset=&date=&dateEnd=&timeStart=&timeEnd=     สถิติตาม filter (ใช้ aggregation)
GET  /api/zones            POST /api/zones            PUT/DELETE /api/zones/:id
GET  /api/zones/stats?date=&timeStart=&timeEnd=      ค่าเฉลี่ย sensor ต่อโซน ($geoWithin)
```

- `timeStart`/`timeEnd` = นาทีในวัน (0–1439) เทียบกับ `localMinutes`
- จุดเยอะ: `/api/points` ต้องรองรับ `bbox` + limit + ส่งแบบกระชับ (array ไม่ใช่ object ต่อจุด) — Walking มี 26k จุด

## 6. หน้าเว็บ

| Route | หน้า | เนื้อหา |
|---|---|---|
| `/` | Overview | แผนที่รวมทุก dataset (สีต่าง) + การ์ดตัวเลขสรุม + ลิงก์ไปแต่ละหน้า |
| `/dataset/:name` | Dataset ×5 | แผนที่ + layer panel + filter + popup ข้อมูลจุด |
| `/zones` | Zones | จัดการโซน: วาด/แก้/ลบ/ตั้งชื่อ+ประเภท+สี, ดูโซน OSM, zone stats |
| `/dashboard` | Dashboard | สรุปผลแยกต่อ dataset (tab) + section เปรียบเทียบข้าม dataset |

## 7. Layers (ต่อหน้า dataset — toggle เปิด/ปิดอิสระ)

1. **จุดวัด** — สีตาม metric ที่เลือก: `sound_db` / `temp_c` / `humidity_pct` / `lux` / `uv_index`
   (**ทุก metric ที่ dataset นั้นมี ต้องเลือกได้หมด** — Walking ครบ 5) + legend color scale
2. **เส้นทางเดิน** — เฉพาะ dataset เดินเก็บ — ไล่สีตามค่า metric ที่เลือก
3. **Replay** — ปุ่ม play/pause/speed — จุดวิ่งตาม timestamp บนเส้นทาง
4. **Heatmap** — ความเข้มตาม metric ที่เลือก (deck.gl HeatmapLayer)
5. **จุด GPS ประมาณ** — toggle แสดง/ซ่อน `gps_interpolated = 1` (default: แสดงแบบสีจาง/ขอบต่าง)
6. **Zones overlay** — โซนทั้งหมดทับบนแผนที่ทุกหน้า
7. Click จุด → popup ครบ 15 คอลัมน์ (เวลาแสดงเป็นเวลาท้องถิ่น dataset)

## 8. Filter (มีผลทุก layer + stats พร้อมกัน)

- **วัน** — date picker เลือกวันเดียว/ช่วงวัน/ทั้งหมด — แสดงเฉพาะวันที่มีข้อมูลจริง
- **ช่วงเวลาในวัน** — slider 00:00–24:00 ใช้ข้ามหลายวันได้ (เช่น ทุกวันเอาเฉพาะ 08:00–12:00)
- ใช้ร่วมกันได้: วัน × ช่วงเวลา
- Filter ส่งไป API เป็น `date/dateEnd/timeStart/timeEnd` — dashboard + zone stats คำนวณตาม

## 9. Zones

- **อัตโนมัติ (prebuild ตอน pipeline)** — ดึงจาก OSM Overpass API ครั้งเดียว เก็บลง collection `zones` (`source: "osm"`):
  - วัด/ศาสนสถาน `amenity=place_of_worship` · สวนสัตว์/ที่เที่ยว `tourism=zoo|attraction` · สวน `leisure=park`
  - ที่อยู่อาศัย `landuse=residential` · การค้า `landuse=commercial|retail` · มหาวิทยาลัย `amenity=university`
  - bbox ครอบพื้นที่ข้อมูลจริง: กทม./ปทุมธานี, อยุธยา, กาญจนบุรี, Osaka — คำนวณ bbox จากจุดจริง + buffer
  - เอาเฉพาะ way/relation ที่เป็น polygon และ**ตัดเฉพาะโซนที่มีจุดข้อมูลตกอยู่ข้างใน** (ไม่งั้น residential ทั้งเมืองท่วม)
- **วาดเอง** — Terra Draw: polygon/rectangle/circle → form ตั้งชื่อ ประเภท สี → POST เก็บใน Mongo
- **Zone stats** — `$geoWithin` ต่อโซน: จำนวนจุด + min/avg/max ต่อ metric — แสดงหน้า Zones + Dashboard
- **การแสดงบนแผนที่**: แสดงเฉพาะโซนที่อยู่ใกล้จุดข้อมูล **ไม่เกิน 20 กม.** — กรองฝั่ง API
  (`GET /api/zones` เช็คระยะ geometry ถึงจุดข้อมูลใกล้สุด, cache ผล) โซนไกลกว่านั้นไม่ส่งไปวาด

## 10. Dashboard

- Tab ต่อ dataset: การ์ดสรุป (จำนวนจุด, ช่วงเวลา, % มีพิกัด, min/avg/max) + time series ต่อ metric
  (aggregate รายชั่วโมง/วัน) + histogram แจกแจงค่า
- **Section เปรียบเทียบข้าม dataset**: เสียง 4 แหล่งกราฟเดียว, อุณหภูมิ/ความชื้น 2 แหล่ง (Walking + BirdIoTMic)
- ตารางค่าเฉลี่ยต่อโซน
- ทุกส่วน respect filter วัน/ช่วงเวลา

## 11. กติกาสำคัญสำหรับ agent

- **ห้ามแก้ไฟล์ใน `Data/`**
- ค่าว่างต้องคงเป็น null ตลอดทั้งระบบ — ห้ามแทนด้วย 0
- ทุก timestamp แสดงผล/กรองเป็นเวลาท้องถิ่นของ dataset (Walking, Ayutthaya, SiteInPuey, BirdIoTMic = UTC+7 · OMU = UTC+9)
- UI string ทุกตัวผ่านระบบ i18n (th default, en toggle) — ห้าม hardcode
- `.env` ห้าม commit — มี `.env.example` ให้
- ผู้ใช้ต้องเอา MongoDB Atlas connection string มาใส่ `.env` เอง — ถ้ายังไม่มี ให้ระบบ fail พร้อมข้อความบอกชัด
- อัปเดต `TASKS.md` (ติ๊ก checkbox + note สั้นๆ) ทุกครั้งที่จบ task
