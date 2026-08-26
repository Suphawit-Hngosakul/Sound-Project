# Sound Project — IoT Field Data Web App

Web แสดงข้อมูล IoT ภาคสนาม (เสียง อุณหภูมิ ความชื้น แสง UV) บนแผนที่
พร้อมเส้นทางเดิน โซนพื้นที่ และ dashboard — ดูรายละเอียดเต็มใน [PLAN.md](PLAN.md) งานคงเหลือใน [TASKS.md](TASKS.md)

## โครงสร้าง

```
/Data       ข้อมูลต้นทาง unified_points.csv (ห้ามแก้ — ไม่อยู่ใน git ต้องวางเองตอน clone ใหม่)
/pipeline   script preprocess: CSV → MongoDB + ดึงโซน OSM
/server     Express REST API (port 3001)
/web        Vite + React frontend (port 5173)
```

## วิธีรันครั้งแรก

1. ต้องมี Node.js 22+
2. คัดลอก `.env.example` เป็น `.env` แล้วใส่ MongoDB Atlas connection string
3. ติดตั้ง dependencies (ถ้า clone ใหม่ต้องรันเอง):

```
cd web && npm install
cd ../server && npm install
cd ../pipeline && npm install
```

4. Import ข้อมูลเข้า MongoDB (ครั้งเดียว หรือเมื่อข้อมูลเปลี่ยน) — **ต้องรันตามลำดับนี้**
   เพราะ tracks กับ stats อ่านจาก collection `points` ที่ import สร้างไว้:

```
cd pipeline
npm run import        # CSV → points + สร้าง index (2dsphere, dataset+timestamp, dataset+localDate)
npm run tracks        # ตัด segment เป็นเส้นทางเดิน → tracks
npm run stats         # สรุปต่อ dataset/วัน/ชั่วโมง → daily_stats
npm run zones         # ดึงโซนจาก OSM Overpass → zones (ต้องมีเน็ต)
```

`npm run zones` มี cache อยู่ที่ `pipeline/.overpass-cache/` ยิงซ้ำจะไม่โหลดใหม่
เพิ่ม `--cache-only` ถ้าไม่อยากให้ยิงเน็ตเลย · ค่าเริ่มต้นดึงเฉพาะพื้นที่ไทย (`--thailand-only`)
เพราะ Overpass ล้นบ่อยเวลาขอ Osaka ด้วย

5. รัน server + web (2 terminal):

```
cd server && npm start      # http://localhost:3001
cd web && npm run dev       # http://localhost:5173
```

Vite proxy `/api` ไปที่ port 3001 ให้แล้ว ไม่ต้องตั้ง CORS อะไรเพิ่ม

### ทดสอบ API

```
cd server && npm run e2e    # ยิงทุก endpoint ทุก filter เทียบผลให้สอดคล้องกัน (server ต้องรันอยู่)
```

### build เวอร์ชันจริง

```
cd web && npm run build     # ออกที่ web/dist
cd web && npm run preview   # ลองเปิดไฟล์ที่ build แล้ว
```

## หน้าเว็บ

| Route | มีอะไร |
|---|---|
| `/` | แผนที่รวมทุกชุดข้อมูล + การ์ดสรุป — เปิด/ปิดทีละชุดได้ |
| `/dataset/:name` | จุดวัดไล่สีตาม metric, heatmap, เส้นทางเดิน, replay, โซน, filter วัน/ช่วงเวลา, คลิกจุดดูครบ 15 คอลัมน์ |
| `/zones` | รายการโซน + วาดโซนใหม่ (polygon/สี่เหลี่ยม/วงกลม) + แก้/ลบ + สถิติในโซน |
| `/dashboard` | แท็บต่อชุดข้อมูล: การ์ดสรุป + กราฟรายชั่วโมง + histogram, ส่วนเปรียบเทียบข้ามชุด, ตารางค่าเฉลี่ยต่อโซน |

ปุ่มขวาบนสลับไทย/อังกฤษ · ปุ่มซ้ายล่างของแผนที่สลับแผนที่ถนน/ภาพดาวเทียม (จำค่าไว้ใน localStorage)

## API

```
GET  /api/health
GET  /api/datasets                     สรุปต่อ dataset + วันที่มีข้อมูลจริง (cache 5 นาที)
GET  /api/points?dataset=&date=&dateEnd=&timeStart=&timeEnd=&interpolated=&bbox=&limit=
GET  /api/points/:id                   รายละเอียดเต็มของจุดเดียว
GET  /api/tracks?dataset=&date=&dateEnd=
GET  /api/stats?...&groupBy=hour|date
GET  /api/stats/histogram?metric=&bins=&...
GET  /api/zones?all=1&source=          POST /api/zones
PUT  /api/zones/:id                    DELETE /api/zones/:id
GET  /api/zones/stats?...
```

`timeStart` / `timeEnd` เป็นนาทีในวัน 0–1439 เทียบกับเวลาท้องถิ่นของชุดข้อมูลนั้น
(Walking / Ayutthaya / SiteInPuey / BirdIoTMic = UTC+7 · OMU = UTC+9)

## เจอปัญหาบ่อย

**server ขึ้น `Could not connect to any servers in your MongoDB Atlas cluster`**
IP ปัจจุบันไม่อยู่ใน Access List ของ Atlas — เข้า cloud.mongodb.com → Network Access → Add IP Address
→ Add Current IP Address (IP บ้าน/มือถือเปลี่ยนบ่อย ต้องเพิ่มใหม่เมื่อย้ายเน็ต)
เช็คแยกได้ว่าเป็นปัญหา whitelist จริงไหม: ถ้า DNS SRV กับ TCP ถึง cluster ได้แต่ driver ต่อไม่ผ่าน = ใช่

**server ขึ้น `querySrv ECONNREFUSED`**
Node resolve SRV ของ Atlas ไม่ได้ — `server/src/db.js` กับ `pipeline/lib.js` ชี้ DNS ไป 8.8.8.8 / 1.1.1.1 ให้แล้ว

**server ขึ้น `ไม่พบ MONGODB_URI`**
ยังไม่ได้สร้าง `.env` ที่ root โปรเจกต์ (ไม่ใช่ใน `/server`)

**หน้าเว็บขึ้น error ทุก request**
server ยังไม่ได้รัน — เปิด http://localhost:3001/api/health ต้องได้ `{"ok":true}`
