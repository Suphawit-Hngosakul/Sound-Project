const { Router } = require('express');
const { dateRange, datasetParam } = require('../filters');

// เส้นทางเดิน — filter dataset + ช่วงวัน; ช่วงเวลาในวันให้ frontend ตัด vertex เอง
// จาก times[] (segment เดียวอาจคร่อมช่วง filter — ตัดฝั่ง client แม่นกว่าและไม่ทำ doc แตก)
module.exports = (db) => {
  const router = Router();
  const tracks = db.collection('tracks');

  router.get('/', async (req, res, next) => {
    try {
      const f = {};
      const dataset = datasetParam(req.query);
      if (dataset) f.dataset = dataset;
      const dates = dateRange(req.query);
      if (dates) f.localDate = dates;
      const docs = await tracks.find(f).sort({ startTime: 1 }).toArray();
      res.json(
        docs.map((t) => ({
          id: t._id,
          dataset: t.dataset,
          device: t.device,
          localDate: t.localDate,
          startTime: t.startTime,
          endTime: t.endTime,
          pointCount: t.pointCount,
          geometry: t.geometry,
          times: t.times.map((d) => d.getTime()),
          values: t.values,
        }))
      );
    } catch (e) {
      next(e);
    }
  });

  return router;
};
