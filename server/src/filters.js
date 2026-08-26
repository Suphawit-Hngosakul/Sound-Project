const { DATASETS } = require('./db');

// แปลง query params -> mongo filter สำหรับ collection `points`
// รองรับ: dataset, date, dateEnd, timeStart, timeEnd (นาทีในวัน 0-1439), interpolated=hide|only, bbox=minLng,minLat,maxLng,maxLat
function pointFilter(q, { requireCoords = false } = {}) {
  const f = {};
  if (q.dataset) {
    if (!DATASETS.includes(q.dataset)) throw badRequest(`unknown dataset: ${q.dataset}`);
    f.dataset = q.dataset;
  }
  if (q.date) {
    const end = q.dateEnd || q.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
      throw badRequest('date/dateEnd ต้องเป็น YYYY-MM-DD');
    f.localDate = { $gte: q.date, $lte: end };
  }
  const ts = intOrNull(q.timeStart);
  const te = intOrNull(q.timeEnd);
  if (ts !== null || te !== null) {
    f.localMinutes = {};
    if (ts !== null) f.localMinutes.$gte = ts;
    if (te !== null) f.localMinutes.$lte = te;
  }
  if (q.interpolated === 'hide') f.gps_interpolated = false;
  if (q.interpolated === 'only') f.gps_interpolated = true;
  if (q.bbox) {
    const b = q.bbox.split(',').map(Number);
    if (b.length !== 4 || b.some((v) => !Number.isFinite(v))) throw badRequest('bbox ต้องเป็น minLng,minLat,maxLng,maxLat');
    f.location = { $geoWithin: { $box: [[b[0], b[1]], [b[2], b[3]]] } };
  } else if (requireCoords) {
    f.location = { $exists: true };
  }
  return f;
}

function intOrNull(v) {
  if (v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

module.exports = { pointFilter, badRequest, intOrNull };
