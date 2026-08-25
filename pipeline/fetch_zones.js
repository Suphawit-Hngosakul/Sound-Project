// Prebuild zones from OSM Overpass -> collection `zones` (source: "osm")
// เก็บเฉพาะโซนที่มีจุดข้อมูลตกอยู่ข้างใน >= MIN_POINTS_IN_ZONE
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const turf = require('@turf/turf');
const { connect } = require('./lib');

// cache ผล Overpass รายคำขอ — ล้มกลางทางรันใหม่ไม่ต้องดึงซ้ำ
const CACHE_DIR = path.join(__dirname, '.overpass-cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const OVERPASS_URLS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
const CELL_DEG = 0.2; // grid สำหรับ cluster พื้นที่ข้อมูล
const BBOX_BUFFER_DEG = 0.01; // ~1 กม.
const MIN_POINTS_IN_ZONE = 5;

// tag -> category (key ใช้ใน UI/i18n, สีตายตัวต่อ category)
const TAG_CATEGORIES = [
  { filter: '["amenity"="place_of_worship"]', category: 'worship', color: '#e6a23c' },
  { filter: '["tourism"="zoo"]', category: 'tourism', color: '#f56c6c' },
  { filter: '["tourism"="attraction"]', category: 'tourism', color: '#f56c6c' },
  { filter: '["leisure"="park"]', category: 'park', color: '#67c23a' },
  { filter: '["landuse"="residential"]', category: 'residential', color: '#909399' },
  { filter: '["landuse"="commercial"]', category: 'commercial', color: '#409eff' },
  { filter: '["landuse"="retail"]', category: 'commercial', color: '#409eff' },
  { filter: '["amenity"="university"]', category: 'university', color: '#9b59b6' },
];

function categoryOf(tags) {
  if (tags.amenity === 'place_of_worship') return 'worship';
  if (tags.tourism === 'zoo' || tags.tourism === 'attraction') return 'tourism';
  if (tags.leisure === 'park') return 'park';
  if (tags.landuse === 'residential') return 'residential';
  if (tags.landuse === 'commercial' || tags.landuse === 'retail') return 'commercial';
  if (tags.amenity === 'university') return 'university';
  return null;
}
const CATEGORY_COLOR = Object.fromEntries(TAG_CATEGORIES.map((t) => [t.category, t.color]));

// รวม cell ติดกันเป็น cluster (union-find อย่างง่าย) -> bbox ต่อ cluster
function clusterBboxes(coords) {
  const cells = new Map(); // "x,y" -> [minLng,minLat,maxLng,maxLat]
  for (const [lng, lat] of coords) {
    const key = `${Math.floor(lng / CELL_DEG)},${Math.floor(lat / CELL_DEG)}`;
    const b = cells.get(key);
    if (!b) cells.set(key, [lng, lat, lng, lat]);
    else {
      b[0] = Math.min(b[0], lng);
      b[1] = Math.min(b[1], lat);
      b[2] = Math.max(b[2], lng);
      b[3] = Math.max(b[3], lat);
    }
  }
  const keys = [...cells.keys()];
  const parent = new Map(keys.map((k) => [k, k]));
  const find = (k) => {
    while (parent.get(k) !== k) k = parent.get(k);
    return k;
  };
  for (const k of keys) {
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const n = `${x + dx},${y + dy}`;
      if (parent.has(n)) parent.set(find(n), find(k));
    }
  }
  const merged = new Map();
  for (const k of keys) {
    const root = find(k);
    const b = cells.get(k);
    const m = merged.get(root);
    if (!m) merged.set(root, [...b]);
    else {
      m[0] = Math.min(m[0], b[0]);
      m[1] = Math.min(m[1], b[1]);
      m[2] = Math.max(m[2], b[2]);
      m[3] = Math.max(m[3], b[3]);
    }
  }
  return [...merged.values()].map(([minLng, minLat, maxLng, maxLat]) => [
    minLng - BBOX_BUFFER_DEG,
    minLat - BBOX_BUFFER_DEG,
    maxLng + BBOX_BUFFER_DEG,
    maxLat + BBOX_BUFFER_DEG,
  ]);
}

async function overpassRequest(query) {
  const cacheFile = path.join(CACHE_DIR, crypto.createHash('md5').update(query).digest('hex') + '.json');
  if (fs.existsSync(cacheFile)) {
    process.stderr.write('(cache) ');
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }
  // --cache-only: ใช้เฉพาะที่ดึงมาแล้ว ไม่ยิง Overpass เพิ่ม
  if (process.argv.includes('--cache-only')) {
    process.stderr.write('(no cache, skip) ');
    return [];
  }
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const url of OVERPASS_URLS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'SoundProject-pipeline/1.0 (IoT field data visualization; github Suphawit-Hngosakul/Sound-Project)',
          },
          body: 'data=' + encodeURIComponent(query),
          signal: AbortSignal.timeout(150000), // กัน connection ค้างแขวนทั้ง script
        });
        if (res.ok) {
          const elements = (await res.json()).elements || [];
          fs.writeFileSync(cacheFile, JSON.stringify(elements));
          return elements;
        }
        lastErr = new Error(`Overpass ${res.status} @ ${url}`);
      } catch (e) {
        lastErr = e;
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  throw lastErr;
}

// แตก query รายหมวดต่อ bbox — คำขอเล็กลง เลี่ยง 504
async function queryOverpass(bbox) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const bb = `(${minLat},${minLng},${maxLat},${maxLng})`;
  const all = [];
  for (const t of TAG_CATEGORIES) {
    const query = `[out:json][timeout:120];(way${t.filter}${bb};relation${t.filter}${bb};);out geom;`;
    process.stderr.write(`  ${t.filter} ... `);
    const elements = await overpassRequest(query);
    process.stderr.write(`${elements.length} elements\n`);
    all.push(...elements);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return all;
}

function ringFromGeometry(geom) {
  const ring = geom.map((g) => [g.lon, g.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
  return ring.length >= 4 ? ring : null;
}

// way -> Polygon / relation -> MultiPolygon (เอาเฉพาะ outer member ที่เป็นวงปิดในตัว)
function toGeometry(el) {
  if (el.type === 'way' && el.geometry) {
    const ring = ringFromGeometry(el.geometry);
    return ring ? { type: 'Polygon', coordinates: [ring] } : null;
  }
  if (el.type === 'relation' && el.members) {
    const outers = el.members
      .filter((m) => m.role === 'outer' && m.geometry)
      .map((m) => ringFromGeometry(m.geometry))
      .filter(Boolean);
    if (!outers.length) return null;
    return { type: 'MultiPolygon', coordinates: outers.map((r) => [r]) };
  }
  return null;
}

async function main() {
  const { client, db } = await connect();
  const points = db.collection('points');
  const zones = db.collection('zones');

  const coords = await points
    .find({ location: { $exists: true } })
    .project({ _id: 0, c: '$location.coordinates' })
    .map((d) => d.c)
    .toArray();
  console.log(`data points with coords: ${coords.length}`);

  let bboxes = clusterBboxes(coords);
  // --thailand-only: ข้าม Osaka (lng > 110) ไปก่อน — Overpass ล้นบ่อย ค่อยรันเต็มทีหลัง
  if (process.argv.includes('--thailand-only')) {
    bboxes = bboxes.filter(([minLng]) => minLng < 110);
    console.log('thailand-only mode');
  }
  console.log(`region bboxes: ${bboxes.length}`);

  const seen = new Set();
  const candidates = [];
  for (const [i, bbox] of bboxes.entries()) {
    console.log(`overpass ${i + 1}/${bboxes.length} bbox=${bbox.map((v) => v.toFixed(3)).join(',')}`);
    const elements = await queryOverpass(bbox);
    for (const el of elements) {
      const osmId = `${el.type}/${el.id}`;
      if (seen.has(osmId)) continue;
      seen.add(osmId);
      const category = el.tags ? categoryOf(el.tags) : null;
      if (!category) continue;
      const geometry = toGeometry(el);
      if (!geometry) continue;
      candidates.push({
        name: el.tags['name:th'] || el.tags.name || `${category} ${el.id}`,
        category,
        color: CATEGORY_COLOR[category],
        source: 'osm',
        osmId,
        geometry,
      });
    }
    if (i < bboxes.length - 1) await new Promise((r) => setTimeout(r, 3000)); // อย่าถล่ม Overpass
  }
  console.log(`osm polygons: ${candidates.length} — filtering by data points inside...`);

  const kept = [];
  for (const z of candidates) {
    const feature = { type: 'Feature', properties: {}, geometry: z.geometry };
    const [minLng, minLat, maxLng, maxLat] = turf.bbox(feature);
    let count = 0;
    for (const [lng, lat] of coords) {
      if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) continue;
      if (turf.booleanPointInPolygon([lng, lat], feature)) {
        count++;
        if (count >= MIN_POINTS_IN_ZONE) break;
      }
    }
    if (count >= MIN_POINTS_IN_ZONE) {
      z.pointSample = count;
      kept.push(z);
    }
  }
  console.log(`zones kept (>= ${MIN_POINTS_IN_ZONE} data points inside): ${kept.length}`);

  await zones.deleteMany({ source: 'osm' }); // คง user zones ไว้
  if (kept.length) await zones.insertMany(kept.map((z) => ({ ...z, createdAt: new Date() })));
  await zones.createIndex({ source: 1 });
  await zones.createIndex({ geometry: '2dsphere' }).catch((e) => console.warn('2dsphere zones:', e.message));

  const byCat = {};
  for (const z of kept) byCat[z.category] = (byCat[z.category] || 0) + 1;
  console.log('per category:', byCat);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
