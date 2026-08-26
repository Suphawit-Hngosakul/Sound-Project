const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// เครื่องนี้ Node resolve SRV ของ Atlas ไม่ได้ (querySrv ECONNREFUSED) — ชี้ public DNS เฉพาะ process
require('dns').setServers(['8.8.8.8', '1.1.1.1']);

const mongoose = require('mongoose');

const TZ_OFFSET_MIN = {
  Walking: 420,
  OMU: 540, // Osaka UTC+9
  Ayutthaya: 420,
  SiteInPuey: 420,
  BirdIoTMic: 420,
};
const DATASETS = Object.keys(TZ_OFFSET_MIN);
const MOVING_DATASETS = ['Walking', 'OMU', 'Ayutthaya'];
const METRICS = ['sound_db', 'temp_c', 'humidity_pct', 'lux', 'uv_index'];

async function connectDB() {
  if (!process.env.MONGODB_URI) {
    console.error(
      'ไม่พบ MONGODB_URI — คัดลอก .env.example เป็น .env ที่ root โปรเจกต์ แล้วใส่ connection string ของ MongoDB Atlas'
    );
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  return mongoose.connection.db;
}

module.exports = { connectDB, TZ_OFFSET_MIN, DATASETS, MOVING_DATASETS, METRICS };
