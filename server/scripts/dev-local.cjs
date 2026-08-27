// รัน API ด้วย "ข้อมูลจริง" จาก Data/unified_points.csv บน mongod ในเครื่อง
// ใช้ตอนต่อ Atlas ไม่ได้ (เช่น IP ยังไม่อยู่ใน Access List) — ไม่ใช่ข้อมูลตัวอย่างเหมือน dev:fixtures
//
// เก็บ dbPath ไว้ถาวรที่ server/.local-db รันครั้งต่อไปจึงไม่ต้อง import ใหม่
// (import 81,629 แถว + build tracks/stats ใช้เวลาหลายนาที)
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const { createApp } = require('../src/app');

const PORT = process.env.PORT || 3001;
const DB_PORT = Number(process.env.LOCAL_DB_PORT || 27018);
const DB_PATH = path.join(__dirname, '..', '.local-db');
const PIPELINE = path.join(__dirname, '..', '..', 'pipeline');
const CSV = path.join(__dirname, '..', '..', 'Data', 'unified_points.csv');

const RESEED = process.argv.includes('--reseed');

// pipeline scripts อ่าน MONGODB_URI จาก env — dotenv ไม่ทับค่าที่ตั้งมาแล้ว
// จึงชี้ไป mongod ในเครื่องได้โดยไม่ต้องแตะ .env
function runPipeline(script, args, uri) {
  const label = [script, ...args].join(' ');
  console.log(`\n--- pipeline: ${label} ---`);
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd: PIPELINE,
    stdio: 'inherit',
    env: { ...process.env, MONGODB_URI: uri },
  });
  if (r.status !== 0) throw new Error(`pipeline ${label} ล้มเหลว (exit ${r.status})`);
}

async function main() {
  if (!fs.existsSync(CSV)) {
    console.error(`ไม่พบ ${CSV} — ต้องมีข้อมูลจริงก่อนถึงจะรัน dev:local ได้`);
    process.exit(1);
  }
  fs.mkdirSync(DB_PATH, { recursive: true });

  const mongo = await MongoMemoryServer.create({
    instance: { port: DB_PORT, dbPath: DB_PATH, storageEngine: 'wiredTiger', auth: false },
  });
  const uri = `mongodb://127.0.0.1:${DB_PORT}/sound`;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  // เช็คทีละ collection — รันค้างกลางทางแล้วเปิดใหม่จะทำต่อจากจุดที่ขาด ไม่ import ทั้งก้อนซ้ำ
  // โซน OSM ใช้เฉพาะที่ cache ไว้แล้ว ไม่ยิง Overpass ซ้ำ
  const STEPS = [
    ['points', 'import_points.js', []],
    ['tracks', 'build_tracks.js', []],
    ['daily_stats', 'build_stats.js', []],
    ['zones', 'fetch_zones.js', ['--cache-only']],
  ];
  if (RESEED) console.log('--reseed: สร้างใหม่ทั้งหมด');
  for (const [collection, script, args] of STEPS) {
    const have = await db.collection(collection).countDocuments().catch(() => 0);
    if (!RESEED && have > 0) {
      console.log(`ข้าม ${script} — มี ${collection} อยู่แล้ว ${have} รายการ`);
      continue;
    }
    runPipeline(script, args, uri);
  }

  const counts = {};
  for (const c of ['points', 'tracks', 'daily_stats', 'zones']) counts[c] = await db.collection(c).countDocuments();
  console.log('\nข้อมูลในเครื่อง:', counts);

  createApp(db).listen(PORT, () => {
    console.log(`\nAPI (ข้อมูลจริง) listening on http://localhost:${PORT}`);
    console.log(`mongod: ${uri}  dbPath: ${DB_PATH}`);
  });

  const bye = async () => {
    await client.close();
    await mongo.stop({ doCleanup: false, force: false }); // เก็บ dbPath ไว้ใช้รอบหน้า
    process.exit(0);
  };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
