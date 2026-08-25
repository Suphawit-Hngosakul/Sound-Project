# Sound Project — IoT Field Data Web App

Web แสดงข้อมูล IoT ภาคสนาม (เสียง อุณหภูมิ ความชื้น แสง UV) บนแผนที่
พร้อมเส้นทางเดิน โซนพื้นที่ และ dashboard — ดูรายละเอียดเต็มใน [PLAN.md](PLAN.md) งานคงเหลือใน [TASKS.md](TASKS.md)

## โครงสร้าง

```
/Data       ข้อมูลต้นทาง unified_points.csv (ห้ามแก้ — ไม่อยู่ใน git ต้องวางเองตอน clone ใหม่)
/pipeline   script preprocess: CSV → MongoDB + ดึงโซน OSM
/server     Express REST API (port 3001)
/web        Vite + React frontend
```

## วิธีรันครั้งแรก

1. ต้องมี Node.js 22+
2. คัดลอก `.env.example` เป็น `.env` แล้วใส่ MongoDB Atlas connection string
3. ติดตั้ง dependencies (ทำแล้วถ้า clone ใหม่ต้องรันเอง):

```
cd web && npm install
cd ../server && npm install
cd ../pipeline && npm install
```

4. Import ข้อมูลเข้า MongoDB (ครั้งเดียว หรือเมื่อข้อมูลเปลี่ยน):

```
cd pipeline
npm run import        # CSV → points + index
npm run tracks        # สร้างเส้นทางเดิน
npm run stats         # สถิติ dashboard
npm run zones         # ดึงโซนจาก OSM Overpass (ต้องมีเน็ต)
```

5. รัน server + web (2 terminal):

```
cd server && npm start
cd web && npm run dev
```

เปิด http://localhost:5173
