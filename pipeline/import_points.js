// Import Data/unified_points.csv -> collection `points` + indexes
const fs = require('fs');
const { parse } = require('csv-parse');
const { connect, toLocal, num, CSV_PATH } = require('./lib');

const BATCH = 5000;

async function main() {
  const { client, db } = await connect();
  const col = db.collection('points');
  await col.drop().catch(() => {}); // idempotent re-import

  let batch = [];
  let total = 0;
  let withCoords = 0;

  const parser = fs.createReadStream(CSV_PATH).pipe(parse({ columns: true, trim: true }));

  for await (const row of parser) {
    const dataset = row.dataset;
    const ts = new Date(row.timestamp);
    if (isNaN(ts)) {
      console.warn('skip bad timestamp:', row.id);
      continue;
    }
    const lat = num(row.latitude);
    const lng = num(row.longitude);
    const { localDate, localMinutes } = toLocal(ts.getTime(), dataset);

    const doc = {
      _id: row.id,
      dataset,
      device: row.device || null,
      timestamp: ts,
      localDate,
      localMinutes,
      latitude: lat,
      longitude: lng,
      alt_m: num(row.alt_m),
      sound_db: num(row.sound_db),
      temp_c: num(row.temp_c),
      humidity_pct: num(row.humidity_pct),
      lux: num(row.lux),
      uv_index: num(row.uv_index),
      satellites: row.satellites === '' ? null : Math.round(num(row.satellites) ?? 0),
      gps_valid: row.gps_valid === '1',
      gps_interpolated: row.gps_interpolated === '1',
    };
    if (lat !== null && lng !== null) {
      doc.location = { type: 'Point', coordinates: [lng, lat] };
      withCoords++;
    }
    batch.push(doc);
    if (batch.length >= BATCH) {
      await col.insertMany(batch, { ordered: false });
      total += batch.length;
      batch = [];
      process.stdout.write(`\rinserted ${total}`);
    }
  }
  if (batch.length) {
    await col.insertMany(batch, { ordered: false });
    total += batch.length;
  }
  console.log(`\rinserted ${total} rows (${withCoords} with coordinates)`);

  console.log('creating indexes...');
  await col.createIndex({ location: '2dsphere' }, { sparse: true });
  await col.createIndex({ dataset: 1, timestamp: 1 });
  await col.createIndex({ dataset: 1, localDate: 1, localMinutes: 1 });

  // ตรวจยอด: 81,629 แถว / 50,036 มีพิกัด (นับจริงจาก CSV+geojson — SCHEMA.md เขียน 50,033 เป็นเลขเก่า)
  console.log(`expected 81629 rows / 50036 with coords -> got ${total} / ${withCoords}`);
  if (total !== 81629 || withCoords !== 50036) {
    console.warn('!! ยอดไม่ตรง SCHEMA.md — ตรวจสอบก่อนไปต่อ');
  }
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
