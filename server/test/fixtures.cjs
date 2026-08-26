// ข้อมูลตัวอย่างเล็กๆ ที่รู้คำตอบล่วงหน้า — โครงเดียวกับที่ import_points.js สร้าง
const { toLocal } = require('../../pipeline/lib');

function point(id, dataset, iso, opts = {}) {
  const ts = new Date(iso);
  const { localDate, localMinutes } = toLocal(ts.getTime(), dataset);
  const { lat = null, lng = null, interp = false, ...metrics } = opts;
  const doc = {
    _id: id, dataset, device: opts.device ?? 'dev1', timestamp: ts, localDate, localMinutes,
    latitude: lat, longitude: lng, alt_m: opts.alt_m ?? null,
    sound_db: metrics.sound_db ?? null, temp_c: metrics.temp_c ?? null, humidity_pct: metrics.humidity_pct ?? null,
    lux: metrics.lux ?? null, uv_index: metrics.uv_index ?? null,
    satellites: opts.satellites ?? null, gps_valid: lat !== null, gps_interpolated: interp,
  };
  if (lat !== null && lng !== null) doc.location = { type: 'Point', coordinates: [lng, lat] };
  return doc;
}

// Walking (UTC+7): 17 ธ.ค. 6 จุด — 5 จุดมีพิกัด, 1 จุดไม่มี, 1 จุดเป็น GPS ประมาณ
// เวลาท้องถิ่น: 08:00, 08:30, 09:00, 09:30, 10:00, 10:30
const points = [
  point('w1', 'Walking', '2025-12-17T01:00:00Z', { lat: 13.80, lng: 100.50, sound_db: 50, temp_c: 30 }),
  point('w2', 'Walking', '2025-12-17T01:30:00Z', { lat: 13.81, lng: 100.51, sound_db: 60, temp_c: 31 }),
  point('w3', 'Walking', '2025-12-17T02:00:00Z', { lat: 13.82, lng: 100.52, sound_db: 70, temp_c: 32 }),
  point('w4', 'Walking', '2025-12-17T02:30:00Z', { lat: 13.83, lng: 100.53, sound_db: 80, interp: true }),
  point('w5', 'Walking', '2025-12-17T03:00:00Z', { lat: 13.84, lng: 100.54, sound_db: 90 }),
  point('w6', 'Walking', '2025-12-17T03:30:00Z', { sound_db: 100 }), // ไม่มีพิกัด
  // วันที่สอง เวลาท้องถิ่น 08:00
  point('w7', 'Walking', '2025-12-18T01:00:00Z', { lat: 13.85, lng: 100.55, sound_db: 55 }),
  // OMU (UTC+9) เวลาท้องถิ่น 10:00 ของ 17 ธ.ค.
  point('o1', 'OMU', '2025-12-17T01:00:00Z', { lat: 34.65, lng: 135.50, sound_db: 65, device: 'omu1' }),
  point('o2', 'OMU', '2025-12-17T01:30:00Z', { lat: 34.66, lng: 135.51, sound_db: 75, device: 'omu1' }),
  // BirdIoTMic อยู่กับที่ วัดแต่อุณหภูมิ/ความชื้น
  point('b1', 'BirdIoTMic', '2025-12-17T05:00:00Z', { lat: 14.00, lng: 99.50, temp_c: 27, humidity_pct: 80, device: 'bird1' }),
  point('b2', 'BirdIoTMic', '2025-12-17T06:00:00Z', { lat: 14.00, lng: 99.50, temp_c: 29, humidity_pct: 84, device: 'bird1' }),
];

// Ayutthaya: จุดเยอะพอให้ response เกิน threshold ของ compression (1KB) จะได้ทดสอบ gzip ได้จริง
for (let i = 0; i < 300; i++) {
  const ts = new Date(Date.parse('2025-12-17T02:00:00Z') + i * 1000).toISOString();
  points.push(point(`a${i}`, 'Ayutthaya', ts, { lat: 14.35 + i * 0.0001, lng: 100.55 + i * 0.0001, sound_db: 55 + (i % 20), device: 'ayut1' }));
}

const tracks = [{
  _id: 'trk1', dataset: 'Walking', device: 'dev1', localDate: '2025-12-17',
  startTime: new Date('2025-12-17T01:00:00Z'), endTime: new Date('2025-12-17T03:00:00Z'), pointCount: 5,
  geometry: { type: 'LineString', coordinates: [[100.50, 13.80], [100.51, 13.81], [100.52, 13.82], [100.53, 13.83], [100.54, 13.84]] },
  times: [0, 30, 60, 90, 120].map((m) => new Date(Date.parse('2025-12-17T01:00:00Z') + m * 60000)),
  values: { sound_db: [50, 60, 70, 80, 90], temp_c: [30, 31, 32, null, null], humidity_pct: [null, null, null, null, null], lux: [null, null, null, null, null], uv_index: [null, null, null, null, null] },
}];

// โซนแรกคลุม w1..w3 (13.795-13.825), โซนที่สองอยู่ไกลจากจุดข้อมูลทั้งหมด
const zones = [
  { name: 'โซนทดสอบ', category: 'park', color: '#67c23a', source: 'osm',
    geometry: { type: 'Polygon', coordinates: [[[100.495, 13.795], [100.525, 13.795], [100.525, 13.825], [100.495, 13.825], [100.495, 13.795]]] } },
  { name: 'โซนไกล', category: 'residential', color: '#909399', source: 'osm',
    geometry: { type: 'Polygon', coordinates: [[[0.0, 0.0], [0.01, 0.0], [0.01, 0.01], [0.0, 0.01], [0.0, 0.0]]] } },
];

async function seed(db) {
  await db.collection('points').insertMany(points);
  await db.collection('tracks').insertMany(tracks);
  await db.collection('zones').insertMany(zones);
  await db.collection('points').createIndex({ location: '2dsphere' }, { sparse: true });
  await db.collection('points').createIndex({ dataset: 1, localDate: 1, localMinutes: 1 });
}

module.exports = { seed, points, tracks, zones };
