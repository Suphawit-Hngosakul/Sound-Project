const { Router } = require('express');
const { pointFilter } = require('../filters');
const { METRICS } = require('../db');

function metricAccumulators() {
  const acc = {};
  for (const m of METRICS) {
    acc[`${m}_min`] = { $min: `$${m}` };
    acc[`${m}_avg`] = { $avg: `$${m}` };
    acc[`${m}_max`] = { $max: `$${m}` };
    acc[`${m}_count`] = { $sum: { $cond: [{ $ne: [`$${m}`, null] }, 1, 0] } };
  }
  return acc;
}

function unpackMetrics(g) {
  const metrics = {};
  for (const m of METRICS) {
    if (g[`${m}_count`] > 0) metrics[m] = { min: g[`${m}_min`], avg: g[`${m}_avg`], max: g[`${m}_max`], count: g[`${m}_count`] };
  }
  return metrics;
}

// GET /api/stats?dataset=&date=&dateEnd=&timeStart=&timeEnd=&groupBy=hour|date
// ไม่มี groupBy = สรุปรวมก้อนเดียว / groupBy = series สำหรับกราฟ dashboard
module.exports = (db) => {
  const router = Router();
  const points = db.collection('points');

  router.get('/', async (req, res, next) => {
    try {
      const f = pointFilter(req.query);
      const groupBy = req.query.groupBy;
      let groupId = null;
      if (groupBy === 'hour') groupId = { $floor: { $divide: ['$localMinutes', 60] } };
      else if (groupBy === 'date') groupId = '$localDate';

      const groups = await points
        .aggregate(
          [
            { $match: f },
            {
              $group: {
                _id: groupId,
                count: { $sum: 1 },
                withCoords: { $sum: { $cond: [{ $ifNull: ['$location', false] }, 1, 0] } },
                ...metricAccumulators(),
              },
            },
            { $sort: { _id: 1 } },
          ],
          { allowDiskUse: true }
        )
        .toArray();

      const out = groups.map((g) => ({
        key: g._id,
        count: g.count,
        withCoords: g.withCoords,
        metrics: unpackMetrics(g),
      }));
      res.json(groupId === null ? (out[0] ?? { key: null, count: 0, withCoords: 0, metrics: {} }) : out);
    } catch (e) {
      next(e);
    }
  });

  return router;
};
