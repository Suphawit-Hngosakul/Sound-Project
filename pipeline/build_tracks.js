// Build walking tracks from `points` -> collection `tracks`
// ตัด segment เมื่อ gap > 120 วิ หรือ implied speed > 45 m/s (กระโดดผิดปกติ)
const turf = require('@turf/turf');
const { connect, MOVING_DATASETS, METRICS } = require('./lib');

const MAX_GAP_S = 120;
const MAX_SPEED_MS = 45;
const MIN_POINTS = 2;

async function main() {
  const { client, db } = await connect();
  const points = db.collection('points');
  const tracks = db.collection('tracks');
  await tracks.drop().catch(() => {});

  let totalSegments = 0;

  for (const dataset of MOVING_DATASETS) {
    const devices = await points.distinct('device', { dataset, location: { $exists: true } });
    for (const device of devices) {
      const cursor = points
        .find({ dataset, device, location: { $exists: true } })
        .sort({ timestamp: 1 })
        .project({ location: 1, timestamp: 1, localDate: 1, ...Object.fromEntries(METRICS.map((m) => [m, 1])) });

      let seg = null;
      let prev = null;
      const flush = async () => {
        if (seg && seg.coordinates.length >= MIN_POINTS) {
          await tracks.insertOne({
            dataset,
            device,
            localDate: seg.localDate,
            startTime: seg.times[0],
            endTime: seg.times[seg.times.length - 1],
            pointCount: seg.coordinates.length,
            geometry: { type: 'LineString', coordinates: seg.coordinates },
            times: seg.times, // Date ต่อ vertex — ใช้ replay
            values: seg.values, // ค่า metric ต่อ vertex (null = ไม่มี)
          });
          totalSegments++;
        }
        seg = null;
      };

      for await (const p of cursor) {
        const t = p.timestamp.getTime();
        let split = false;
        if (prev) {
          const dtS = (t - prev.t) / 1000;
          const distM = turf.distance(prev.coord, p.location.coordinates, { units: 'kilometers' }) * 1000;
          if (dtS > MAX_GAP_S || (dtS > 0 && distM / dtS > MAX_SPEED_MS)) split = true;
          if (dtS === 0) continue; // จุดซ้ำเวลาเดียวกัน ข้าม
        }
        if (!seg || split) {
          await flush();
          seg = { localDate: p.localDate, coordinates: [], times: [], values: Object.fromEntries(METRICS.map((m) => [m, []])) };
        }
        seg.coordinates.push(p.location.coordinates);
        seg.times.push(p.timestamp);
        for (const m of METRICS) seg.values[m].push(p[m] ?? null);
        prev = { t, coord: p.location.coordinates };
      }
      await flush();
      prev = null;
    }
    console.log(`${dataset}: done`);
  }

  await tracks.createIndex({ dataset: 1, localDate: 1 });
  console.log(`total segments: ${totalSegments}`);

  // ตัด metric ที่ dataset ไม่มีออกจาก values เพื่อลดขนาด — ทำตอน query ฝั่ง API แทน (เก็บ null ไว้ตรงไปตรงมา)
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
