const { Router } = require('express');
const { pointFilter, intParam, badRequest } = require('../filters');
const { METRICS } = require('../db');

const DEFAULT_BINS = 24;
const MAX_BINS = 60;

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
      if (groupBy !== undefined && !['hour', 'date'].includes(groupBy)) throw badRequest('groupBy ต้องเป็น hour หรือ date');
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

  // GET /api/stats/histogram?metric=&bins=&<filter เดียวกับ /api/stats>
  // แจกแจงค่าเป็นช่วงกว้างเท่ากัน — หา min/max ก่อนแล้วค่อย $bucket (ไม่ใช้ $bucketAuto เพราะได้ช่วงกว้างไม่เท่ากัน)
  router.get('/histogram', async (req, res, next) => {
    try {
      const metric = req.query.metric;
      if (!METRICS.includes(metric)) throw badRequest(`metric ต้องเป็น: ${METRICS.join(', ')}`);
      const bins = intParam(req.query.bins, 'bins', 4, MAX_BINS) ?? DEFAULT_BINS;
      const match = { ...pointFilter(req.query), [metric]: { $ne: null } };

      const [range] = await points
        .aggregate([{ $match: match }, { $group: { _id: null, min: { $min: `$${metric}` }, max: { $max: `$${metric}` }, count: { $sum: 1 } } }])
        .toArray();
      if (!range || !range.count) return res.json({ metric, min: null, max: null, binWidth: 0, total: 0, bins: [] });

      // ค่าเท่ากันหมด (หรือมีค่าเดียว) — คืนช่องเดียว ไม่งั้น boundaries ซ้ำ $bucket จะ error
      if (range.max === range.min) {
        return res.json({
          metric,
          min: range.min,
          max: range.max,
          binWidth: 0,
          total: range.count,
          bins: [{ from: range.min, to: range.max, count: range.count }],
        });
      }

      const width = (range.max - range.min) / bins;
      const boundaries = Array.from({ length: bins + 1 }, (_, i) => range.min + width * i);
      boundaries[bins] = range.max + width / 1000; // ขอบขวาต้องมากกว่าค่าสูงสุด ไม่งั้นค่าสูงสุดตกไปอยู่ default bucket

      const buckets = await points
        .aggregate([{ $match: match }, { $bucket: { groupBy: `$${metric}`, boundaries, default: 'other', output: { count: { $sum: 1 } } } }], {
          allowDiskUse: true,
        })
        .toArray();

      const byLow = new Map(buckets.filter((b) => b._id !== 'other').map((b) => [b._id, b.count]));
      res.json({
        metric,
        min: range.min,
        max: range.max,
        binWidth: width,
        total: range.count,
        bins: Array.from({ length: bins }, (_, i) => ({
          from: boundaries[i],
          to: boundaries[i] + width,
          count: byLow.get(boundaries[i]) ?? 0,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  return router;
};
