const { DATASETS } = require('./db');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function badRequest(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

// param ตัวเลข: ผิดรูป/นอกช่วง = 400 ไม่ใช่เมินทิ้งเงียบๆ
// (ของเดิมใช้ parseInt แล้วเมินค่าที่แปลงไม่ได้ -> ผู้ใช้ขอ filter แต่ได้ข้อมูลที่ไม่ถูกกรองกลับไป)
function intParam(v, name, min, max) {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw badRequest(`${name} ต้องเป็นจำนวนเต็ม`);
  if (n < min || n > max) throw badRequest(`${name} ต้องอยู่ระหว่าง ${min} ถึง ${max}`);
  return n;
}

function datasetParam(q) {
  if (!q.dataset) return null;
  if (!DATASETS.includes(q.dataset)) throw badRequest(`unknown dataset: ${q.dataset}`);
  return q.dataset;
}

// ช่วงวัน — ใช้ร่วมกันทั้ง points/stats/tracks จะได้ validate เหมือนกันทุกที่
function dateRange(q) {
  if (!q.date) {
    if (q.dateEnd) throw badRequest('ส่ง dateEnd มาต้องส่ง date ด้วย');
    return null;
  }
  const end = q.dateEnd || q.date;
  if (!DATE_RE.test(q.date) || !DATE_RE.test(end)) throw badRequest('date/dateEnd ต้องเป็น YYYY-MM-DD');
  if (end < q.date) throw badRequest('dateEnd ต้องไม่มาก่อน date');
  return { $gte: q.date, $lte: end };
}

// แปลง query params -> mongo filter สำหรับ collection `points`
// รองรับ: dataset, date, dateEnd, timeStart, timeEnd (นาทีในวัน 0-1439), interpolated=hide|only, bbox=minLng,minLat,maxLng,maxLat
function pointFilter(q, { requireCoords = false } = {}) {
  const f = {};
  const dataset = datasetParam(q);
  if (dataset) f.dataset = dataset;

  const dates = dateRange(q);
  if (dates) f.localDate = dates;

  const ts = intParam(q.timeStart, 'timeStart', 0, 1439);
  const te = intParam(q.timeEnd, 'timeEnd', 0, 1439);
  if (ts !== null && te !== null && ts > te) throw badRequest('timeStart ต้องไม่มากกว่า timeEnd');
  if (ts !== null || te !== null) {
    f.localMinutes = {};
    if (ts !== null) f.localMinutes.$gte = ts;
    if (te !== null) f.localMinutes.$lte = te;
  }

  if (q.interpolated !== undefined && !['hide', 'only'].includes(q.interpolated))
    throw badRequest('interpolated ต้องเป็น hide หรือ only');
  if (q.interpolated === 'hide') f.gps_interpolated = false;
  if (q.interpolated === 'only') f.gps_interpolated = true;

  if (q.bbox) {
    const b = q.bbox.split(',').map(Number);
    if (b.length !== 4 || b.some((v) => !Number.isFinite(v))) throw badRequest('bbox ต้องเป็น minLng,minLat,maxLng,maxLat');
    const [minLng, minLat, maxLng, maxLat] = b;
    if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) throw badRequest('bbox อยู่นอกช่วงพิกัดที่เป็นไปได้');
    if (minLng >= maxLng || minLat >= maxLat) throw badRequest('bbox ต้องเรียง minLng,minLat,maxLng,maxLat และมุมล่างซ้ายต้องน้อยกว่ามุมบนขวา');
    f.location = { $geoWithin: { $box: [[minLng, minLat], [maxLng, maxLat]] } };
  } else if (requireCoords) {
    f.location = { $exists: true };
  }
  return f;
}

module.exports = { pointFilter, dateRange, datasetParam, intParam, badRequest };
