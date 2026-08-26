// รัน API ด้วยข้อมูลตัวอย่างใน mongod ของเครื่อง — ใช้ดูหน้าเว็บตอน Atlas ใช้ไม่ได้
// ข้อมูลเป็นของปลอมชุดเล็ก ไม่ใช่ข้อมูลจริงจาก CSV
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const { createApp } = require('../src/app');
const { seed } = require('./fixtures.cjs');

const PORT = process.env.PORT || 3001;

(async () => {
  const mongo = await MongoMemoryServer.create();
  const client = new MongoClient(mongo.getUri());
  await client.connect();
  const db = client.db('demo');
  await seed(db);
  createApp(db).listen(PORT, () => {
    console.log(`API (ข้อมูลตัวอย่าง) listening on http://localhost:${PORT}`);
    console.log('ข้อมูลชุดนี้เป็นของปลอมสำหรับทดสอบหน้าเว็บ ไม่ใช่ข้อมูลจริง');
  });
  const bye = async () => { await client.close(); await mongo.stop(); process.exit(0); };
  process.on('SIGINT', bye);
  process.on('SIGTERM', bye);
})();
