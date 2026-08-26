const { Router } = require('express');
const { METRICS, MOVING_DATASETS, TZ_OFFSET_MIN } = require('../db');

const CACHE_MS = 5 * 60 * 1000;

// สรุปต่อ dataset — ข้อมูลนิ่ง (เปลี่ยนเฉพาะตอนรัน pipeline) cache ในหน่วยความจำ 5 นาที
module.exports = (db) => {
  const router = Router();
  const points = db.collection('points');
  const tracks = db.collection('tracks');
  let cache = null;
  let cacheAt = 0;

  router.get('/', async (req, res, next) => {
    try {
      if (cache && Date.now() - cacheAt < CACHE_MS) return res.json(cache);

      const acc = {};
      for (const m of METRICS) acc[`${m}_count`] = { $sum: { $cond: [{ $ne: [`$${m}`, null] }, 1, 0] } };
      const groups = await points
        .aggregate([
          {
            $group: {
              _id: '$dataset',
              count: { $sum: 1 },
              withCoords: { $sum: { $cond: [{ $ifNull: ['$location', false] }, 1, 0] } },
              interpolated: { $sum: { $cond: ['$gps_interpolated', 1, 0] } },
              minDate: { $min: '$localDate' },
              maxDate: { $max: '$localDate' },
              dates: { $addToSet: '$localDate' },
              devices: { $addToSet: '$device' },
              ...acc,
            },
          },
        ])
        .toArray();

      const trackCounts = Object.fromEntries(
        (await tracks.aggregate([{ $group: { _id: '$dataset', n: { $sum: 1 } } }]).toArray()).map((t) => [t._id, t.n])
      );

      cache = groups
        .map((g) => ({
          dataset: g._id,
          count: g.count,
          withCoords: g.withCoords,
          interpolated: g.interpolated,
          dateRange: [g.minDate, g.maxDate],
          dates: g.dates.sort(), // วันที่มีข้อมูลจริง — date picker ใช้จำกัดตัวเลือก
          devices: g.devices.sort(),
          metrics: METRICS.filter((m) => g[`${m}_count`] > 0),
          moving: MOVING_DATASETS.includes(g._id),
          trackCount: trackCounts[g._id] || 0,
          tzOffsetMin: TZ_OFFSET_MIN[g._id],
        }))
        .sort((a, b) => b.count - a.count);
      cacheAt = Date.now();
      res.json(cache);
    } catch (e) {
      next(e);
    }
  });

  return router;
};
