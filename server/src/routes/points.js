const { Router } = require('express');
const { pointFilter, badRequest } = require('../filters');
const { METRICS } = require('../db');

const MAX_LIMIT = 60000;
const DEFAULT_LIMIT = 30000;

// response กระชับ: columns + rows (array ต่อจุด) — 26k จุดของ Walking แล้ว JSON object ต่อจุดบวมเกิน
const COLUMNS = ['id', 'lng', 'lat', 't', 'localMinutes', ...METRICS, 'gps_interpolated'];

module.exports = (db) => {
  const router = Router();
  const points = db.collection('points');

  router.get('/', async (req, res, next) => {
    try {
      const f = pointFilter(req.query, { requireCoords: true });
      const limit = Math.min(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);
      const cursor = points
        .find(f)
        .sort({ timestamp: 1 })
        .limit(limit)
        .project({ location: 1, timestamp: 1, localMinutes: 1, gps_interpolated: 1, ...Object.fromEntries(METRICS.map((m) => [m, 1])) });
      const rows = [];
      for await (const p of cursor) {
        rows.push([
          p._id,
          p.location.coordinates[0],
          p.location.coordinates[1],
          p.timestamp.getTime(),
          p.localMinutes,
          ...METRICS.map((m) => p[m] ?? null),
          p.gps_interpolated ? 1 : 0,
        ]);
      }
      res.json({ columns: COLUMNS, rows, truncated: rows.length === limit });
    } catch (e) {
      next(e);
    }
  });

  // รายละเอียดเต็มของจุดเดียว — ใช้ตอน popup
  router.get('/:id', async (req, res, next) => {
    try {
      const doc = await points.findOne({ _id: req.params.id });
      if (!doc) throw Object.assign(badRequest('point not found'), { status: 404 });
      res.json(doc);
    } catch (e) {
      next(e);
    }
  });

  return router;
};
