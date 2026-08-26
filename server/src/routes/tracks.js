const { Router } = require('express');
const { badRequest } = require('../filters');
const { DATASETS } = require('../db');

// เส้นทางเดิน — filter dataset + ช่วงวัน; ช่วงเวลาในวันให้ frontend ตัด vertex เอง
// จาก times[] (segment เดียวอาจคร่อมช่วง filter — ตัดฝั่ง client แม่นกว่าและไม่ทำ doc แตก)
module.exports = (db) => {
  const router = Router();
  const tracks = db.collection('tracks');

  router.get('/', async (req, res, next) => {
    try {
      const f = {};
      if (req.query.dataset) {
        if (!DATASETS.includes(req.query.dataset)) throw badRequest(`unknown dataset: ${req.query.dataset}`);
        f.dataset = req.query.dataset;
      }
      if (req.query.date) f.localDate = { $gte: req.query.date, $lte: req.query.dateEnd || req.query.date };
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
