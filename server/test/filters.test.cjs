// unit test ของ filters.js — ไม่แตะ DB รันได้ตลอด
const { pointFilter, dateRange, datasetParam, intParam } = require('../src/filters');

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const throws = (name, fn, wantMsg) => {
  try { fn(); check(name, false, 'ไม่ได้โยน error'); }
  catch (e) { check(name, e.status === 400 && (!wantMsg || e.message.includes(wantMsg)), `${e.status} ${e.message}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- intParam ---
check('intParam ว่าง = null', intParam(undefined, 'x', 0, 10) === null && intParam('', 'x', 0, 10) === null);
check('intParam ปกติ', intParam('5', 'x', 0, 10) === 5);
check('intParam ขอบล่าง/บน', intParam('0', 'x', 0, 10) === 0 && intParam('10', 'x', 0, 10) === 10);
throws('intParam ไม่ใช่ตัวเลข', () => intParam('abc', 'x', 0, 10));
throws('intParam ตัวเลขปนตัวอักษร (parseInt เดิมรับ)', () => intParam('12abc', 'x', 0, 100));
throws('intParam ทศนิยม', () => intParam('1.5', 'x', 0, 10));
throws('intParam ต่ำกว่าช่วง', () => intParam('-1', 'x', 0, 10));
throws('intParam เกินช่วง', () => intParam('11', 'x', 0, 10));

// --- dataset ---
check('dataset ว่าง = null', datasetParam({}) === null);
check('dataset ถูกต้อง', datasetParam({ dataset: 'Walking' }) === 'Walking');
throws('dataset ไม่รู้จัก', () => datasetParam({ dataset: 'Nope' }), 'unknown dataset');

// --- ช่วงวัน ---
check('ไม่ส่งวัน = null', dateRange({}) === null);
check('วันเดียว', eq(dateRange({ date: '2025-12-17' }), { $gte: '2025-12-17', $lte: '2025-12-17' }));
check('ช่วงวัน', eq(dateRange({ date: '2025-12-17', dateEnd: '2025-12-20' }), { $gte: '2025-12-17', $lte: '2025-12-20' }));
throws('dateEnd โดยไม่มี date', () => dateRange({ dateEnd: '2025-12-20' }), 'dateEnd');
throws('date รูปแบบผิด', () => dateRange({ date: '17-12-2025' }), 'YYYY-MM-DD');
throws('dateEnd รูปแบบผิด', () => dateRange({ date: '2025-12-17', dateEnd: 'x' }), 'YYYY-MM-DD');
throws('dateEnd มาก่อน date', () => dateRange({ date: '2025-12-20', dateEnd: '2025-12-17' }));

// --- ช่วงเวลาในวัน ---
check('ไม่ส่งเวลา = ไม่มี localMinutes', pointFilter({}).localMinutes === undefined);
check('timeStart อย่างเดียว', eq(pointFilter({ timeStart: '540' }).localMinutes, { $gte: 540 }));
check('timeEnd อย่างเดียว', eq(pointFilter({ timeEnd: '720' }).localMinutes, { $lte: 720 }));
check('ทั้งคู่', eq(pointFilter({ timeStart: '540', timeEnd: '720' }).localMinutes, { $gte: 540, $lte: 720 }));
check('timeStart = timeEnd ได้', eq(pointFilter({ timeStart: '540', timeEnd: '540' }).localMinutes, { $gte: 540, $lte: 540 }));
throws('timeStart > timeEnd', () => pointFilter({ timeStart: '720', timeEnd: '540' }));
throws('timeStart เกิน 1439', () => pointFilter({ timeStart: '1440' }));
throws('timeStart ติดลบ', () => pointFilter({ timeStart: '-1' }));
throws('timeStart ขยะ (เดิมถูกเมินเงียบ)', () => pointFilter({ timeStart: 'abc' }));

// --- interpolated ---
check('interpolated=hide', pointFilter({ interpolated: 'hide' }).gps_interpolated === false);
check('interpolated=only', pointFilter({ interpolated: 'only' }).gps_interpolated === true);
check('ไม่ส่ง = ไม่กรอง', pointFilter({}).gps_interpolated === undefined);
throws('interpolated ค่าอื่น (เดิมถูกเมินเงียบ)', () => pointFilter({ interpolated: 'yes' }));

// --- bbox ---
const bb = pointFilter({ bbox: '100.5,13.8,100.7,13.95' });
check('bbox ปกติ', eq(bb.location, { $geoWithin: { $box: [[100.5, 13.8], [100.7, 13.95]] } }));
throws('bbox ไม่ครบ 4 ค่า', () => pointFilter({ bbox: '100,13,100.7' }));
throws('bbox มีค่าที่ไม่ใช่ตัวเลข', () => pointFilter({ bbox: '100,13,abc,14' }));
throws('bbox มุมสลับกัน', () => pointFilter({ bbox: '100.7,13.95,100.5,13.8' }));
throws('bbox lat เกิน 90', () => pointFilter({ bbox: '100,13,101,91' }));
throws('bbox lng เกิน 180', () => pointFilter({ bbox: '-181,13,101,14' }));
throws('bbox กว้างศูนย์', () => pointFilter({ bbox: '100,13,100,14' }));

// --- requireCoords ---
check('requireCoords เพิ่ม location $exists', eq(pointFilter({}, { requireCoords: true }).location, { $exists: true }));
check('requireCoords ไม่ทับ bbox', eq(pointFilter({ bbox: '100,13,101,14' }, { requireCoords: true }).location.$geoWithin.$box, [[100, 13], [101, 14]]));
check('ไม่ requireCoords = ไม่มี location', pointFilter({}).location === undefined);

// --- รวมหลายเงื่อนไข ---
const full = pointFilter({ dataset: 'OMU', date: '2025-12-17', dateEnd: '2025-12-18', timeStart: '480', timeEnd: '1080', interpolated: 'hide' });
check('รวมทุกเงื่อนไขพร้อมกัน', full.dataset === 'OMU' && full.localDate.$lte === '2025-12-18' && full.localMinutes.$gte === 480 && full.gps_interpolated === false);

console.log(`\n${pass} ผ่าน / ${fail} ไม่ผ่าน`);
process.exit(fail ? 1 : 0);
