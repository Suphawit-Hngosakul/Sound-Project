const { Router } = require('express');
const { ObjectId } = require('mongodb');
const turf = require('@turf/turf');
const { pointFilter, badRequest } = require('../filters');
const { METRICS } = require('../db');

const NEAR_DATA_KM = 20;
const DEG_MARGIN = (NEAR_DATA_KM / 111) * 1.05; // ~20 กม. เป็นองศา (เผื่อ lng แคบลงตาม lat เล็กน้อย)

const CATEGORIES = ['worship', 'tourism', 'park', 'residential', 'commercial', 'university', 'other'];

// id ผิดรูปทำให้ new ObjectId() โยน error ธรรมดา -> error handler ตอบ 500
// ทั้งที่เป็นความผิดของ request ไม่ใช่ของ server
function toObjectId(id) {
  if (!ObjectId.isValid(id)) throw badRequest('zone id ไม่ถูกต้อง');
  return new ObjectId(id);
}

module.exports = (db) => {
  const router = Router();
  const zones = db.collection('zones');
  const points = db.collection('points');

  // โซน "ใกล้ข้อมูล" = ภายใน ~20 กม. จากจุดข้อมูลอย่างน้อย 1 จุด (เช็คด้วย bbox ขยาย)
  async function computeNearData(geometry) {
    const [minLng, minLat, maxLng, maxLat] = turf.bbox({ type: 'Feature', properties: {}, geometry });
    const n = await points.countDocuments({
      location: {
        $geoWithin: {
          $box: [
            [minLng - DEG_MARGIN, minLat - DEG_MARGIN],
            [maxLng + DEG_MARGIN, maxLat + DEG_MARGIN],
          ],
        },
      },
    });
    return n > 0;
  }

  function validateBody(body, { partial = false } = {}) {
    const out = {};
    if (body.name !== undefined || !partial) {
      if (typeof body.name !== 'string' || !body.name.trim()) throw badRequest('name ต้องไม่ว่าง');
      out.name = body.name.trim();
    }
    if (body.category !== undefined || !partial) {
      if (!CATEGORIES.includes(body.category)) throw badRequest(`category ต้องเป็น: ${CATEGORIES.join(', ')}`);
      out.category = body.category;
    }
    if (body.color !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(body.color)) throw badRequest('color ต้องเป็น #rrggbb');
      out.color = body.color;
    }
    if (body.geometry !== undefined || !partial) {
      const g = body.geometry;
      if (!g || !['Polygon', 'MultiPolygon'].includes(g.type)) throw badRequest('geometry ต้องเป็น Polygon/MultiPolygon');
      try {
        if (turf.area({ type: 'Feature', properties: {}, geometry: g }) <= 0) throw new Error('empty');
      } catch {
        throw badRequest('geometry ไม่ถูกต้อง');
      }
      out.geometry = g;
    }
    return out;
  }

  // GET /api/zones — default เฉพาะโซนใกล้ข้อมูล <= 20 กม. / ?all=1 เอาหมด
  router.get('/', async (req, res, next) => {
    try {
      // doc เก่าที่ยังไม่มี nearData (จาก pipeline) — คำนวณแล้ว cache ลง doc ครั้งเดียว
      const missing = await zones.find({ nearData: { $exists: false } }).toArray();
      for (const z of missing) {
        const near = await computeNearData(z.geometry);
        await zones.updateOne({ _id: z._id }, { $set: { nearData: near } });
      }
      const f = req.query.all === '1' ? {} : { nearData: true };
      if (req.query.source) f.source = req.query.source;
      const docs = await zones.find(f).sort({ category: 1, name: 1 }).toArray();
      res.json(docs);
    } catch (e) {
      next(e);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const doc = validateBody(req.body);
      doc.color = doc.color || '#409eff';
      doc.source = 'user';
      doc.nearData = await computeNearData(doc.geometry);
      doc.createdAt = new Date();
      const r = await zones.insertOne(doc);
      res.status(201).json({ ...doc, _id: r.insertedId });
    } catch (e) {
      next(e);
    }
  });

  router.put('/:id', async (req, res, next) => {
    try {
      const _id = toObjectId(req.params.id);
      const patch = validateBody(req.body, { partial: true });
      if (patch.geometry) patch.nearData = await computeNearData(patch.geometry);
      patch.updatedAt = new Date();
      const r = await zones.findOneAndUpdate({ _id }, { $set: patch }, { returnDocument: 'after' });
      if (!r) throw Object.assign(badRequest('zone not found'), { status: 404 });
      res.json(r);
    } catch (e) {
      next(e);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const r = await zones.deleteOne({ _id: toObjectId(req.params.id) });
      if (!r.deletedCount) throw Object.assign(badRequest('zone not found'), { status: 404 });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // GET /api/zones/stats?dataset=&date=&dateEnd=&timeStart=&timeEnd= — ค่าต่อโซน ($geoWithin)
  router.get('/stats', async (req, res, next) => {
    try {
      const baseFilter = pointFilter(req.query);
      delete baseFilter.location; // ใช้ geometry ของโซนแทน bbox
      const zoneDocs = await zones.find({ nearData: true }).toArray();
      const out = [];
      for (const z of zoneDocs) {
        const acc = {};
        for (const m of METRICS) {
          acc[`${m}_avg`] = { $avg: `$${m}` };
          acc[`${m}_min`] = { $min: `$${m}` };
          acc[`${m}_max`] = { $max: `$${m}` };
          acc[`${m}_count`] = { $sum: { $cond: [{ $ne: [`$${m}`, null] }, 1, 0] } };
        }
        const [g] = await points
          .aggregate([
            { $match: { ...baseFilter, location: { $geoWithin: { $geometry: z.geometry } } } },
            { $group: { _id: null, count: { $sum: 1 }, ...acc } },
          ])
          .toArray();
        const metrics = {};
        if (g) {
          for (const m of METRICS) {
            if (g[`${m}_count`] > 0)
              metrics[m] = { min: g[`${m}_min`], avg: g[`${m}_avg`], max: g[`${m}_max`], count: g[`${m}_count`] };
          }
        }
        out.push({ zoneId: z._id, name: z.name, category: z.category, color: z.color, source: z.source, count: g ? g.count : 0, metrics });
      }
      res.json(out);
    } catch (e) {
      next(e);
    }
  });

  return router;
};
