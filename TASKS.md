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

## Phase 2 — API
- [ ] `GET /api/datasets` — รายชื่อ + สรุป
- [ ] `GET /api/points` — filter: dataset, date/dateEnd, timeStart/timeEnd, metric, interpolated, bbox, limit — response แบบกระชับ (array)
- [ ] `GET /api/tracks` — filter เดียวกัน
- [ ] `GET /api/stats` — aggregation ตาม filter
- [ ] `GET/POST/PUT/DELETE /api/zones` — CRUD โซน (validate geometry)
      — GET กรองเฉพาะโซนใกล้จุดข้อมูล ≤ 20 กม. (คำนวณตอน save/import แล้ว cache ใน doc เป็น `nearData: true`)
- [ ] `GET /api/zones/stats` — `$geoWithin` ต่อโซน + filter เวลา
- [ ] Error handling + ข้อความชัดเมื่อไม่มี `MONGODB_URI`

## Phase 3 — Web พื้นฐาน + แผนที่
- [ ] Layout: navbar (ลิงก์ 4 หน้า) + ระบบ i18n th/en (toggle บน navbar)
- [ ] หน้า Overview: แผนที่รวมทุก dataset สีต่างกัน + การ์ดสรุป
- [ ] หน้า Dataset: แผนที่ MapLibre + จุดวัด (deck.gl) + สีตาม metric ที่เลือก + legend
- [ ] Popup click จุด — ครบ 15 คอลัมน์ เวลาท้องถิ่น
- [ ] Layer panel: toggle จุด / heatmap / GPS ประมาณ / zones overlay
- [ ] Filter วัน (date picker เฉพาะวันมีข้อมูล) + ช่วงเวลาในวัน (slider 00:00–24:00) — มีผลทุก layer

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
