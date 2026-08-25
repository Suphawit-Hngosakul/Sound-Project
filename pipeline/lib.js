// Shared helpers for pipeline scripts
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { MongoClient } = require('mongodb');

const DATA_DIR = path.join(__dirname, '..', 'Data');
const CSV_PATH = path.join(DATA_DIR, 'unified_points.csv');

// นาที offset จาก UTC ของ "เวลาท้องถิ่น dataset" (PLAN.md ข้อ 11)
const TZ_OFFSET_MIN = {
  Walking: 420, // UTC+7
  OMU: 540, // Osaka UTC+9
  Ayutthaya: 420,
  SiteInPuey: 420,
  BirdIoTMic: 420,
};

const DATASETS = Object.keys(TZ_OFFSET_MIN);

// เดินเก็บ = มีเส้นทาง / อยู่กับที่ = ไม่มี
const MOVING_DATASETS = ['Walking', 'OMU', 'Ayutthaya'];

const METRICS = ['sound_db', 'temp_c', 'humidity_pct', 'lux', 'uv_index'];

async function connect() {
  if (!process.env.MONGODB_URI) {
    console.error(
      'ไม่พบ MONGODB_URI — คัดลอก .env.example เป็น .env ที่ root โปรเจกต์ แล้วใส่ connection string ของ MongoDB Atlas'
    );
    process.exit(1);
  }
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  return { client, db: client.db() };
}

// epoch ms + tz offset -> { localDate: 'YYYY-MM-DD', localMinutes: 0-1439 }
function toLocal(epochMs, dataset) {
  const shifted = new Date(epochMs + TZ_OFFSET_MIN[dataset] * 60000);
  const localDate = shifted.toISOString().slice(0, 10);
  const localMinutes = shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
  return { localDate, localMinutes };
}

// ค่าว่าง/ไม่ใช่ตัวเลข -> null (ห้ามกลายเป็น 0)
function num(s) {
  if (s === undefined || s === null || s === '') return null;
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
}

module.exports = { connect, toLocal, num, CSV_PATH, DATA_DIR, TZ_OFFSET_MIN, DATASETS, MOVING_DATASETS, METRICS };
