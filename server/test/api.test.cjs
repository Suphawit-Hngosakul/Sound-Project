// ยิง API จริงกับ mongod ในเครื่อง (mongodb-memory-server) — ไม่ต้องพึ่ง Atlas
// ข้อมูลตัวอย่างเล็กพอที่จะคำนวณคำตอบด้วยมือได้ ค่าคาดหวังจึงเป็นตัวเลขตรงๆ ไม่ใช่แค่ "ไม่ error"
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const { createApp } = require('../src/app');
const { seed } = require('./fixtures.cjs');

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

(async () => {
  const mongo = await MongoMemoryServer.create();
  const client = new MongoClient(mongo.getUri());
  await client.connect();
  const db = client.db('test');
  await seed(db);

  const server = createApp(db).listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (p, headers) => {
    const r = await fetch(base + p, { headers });
    return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
  };
  const send = async (p, method, body) => {
    const r = await fetch(base + p, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const poly = (coords) => ({ type: 'Polygon', coordinates: [coords] });
  const smallPoly = poly([[100, 13], [100.1, 13], [100.1, 13.1], [100, 13]]);

  try {
    // ---------- health ----------
    check('health', (await get('/api/health')).body.ok === true);

    // ---------- datasets ----------
    const ds = (await get('/api/datasets')).body;
    check('datasets: เฉพาะชุดที่มีข้อมูล', ds.length === 4, ds.map((d) => d.dataset).join(','));
    const w = ds.find((d) => d.dataset === 'Walking');
    check('Walking: count 7 / withCoords 6 / interpolated 1', w.count === 7 && w.withCoords === 6 && w.interpolated === 1, `${w.count}/${w.withCoords}/${w.interpolated}`);
    check('Walking: metrics เฉพาะที่มีค่าจริง', w.metrics.join(',') === 'sound_db,temp_c', w.metrics.join(','));
    check('Walking: dates 2 วัน', w.dates.length === 2 && w.dates[0] === '2025-12-17');
    check('Walking: moving + trackCount 1', w.moving === true && w.trackCount === 1);
    const omu = ds.find((d) => d.dataset === 'OMU');
    check('OMU: tz +9 และไม่มี track', omu.tzOffsetMin === 540 && omu.trackCount === 0);
    check('BirdIoTMic: อยู่กับที่', ds.find((d) => d.dataset === 'BirdIoTMic').moving === false);

    // ---------- points ----------
    const all = (await get('/api/points?dataset=Walking')).body;
    check('points: เฉพาะจุดที่มีพิกัด (จุดไม่มีพิกัดถูกตัด)', all.rows.length === 6, `${all.rows.length} แถว`);
    check('points: ไม่ truncated', all.truncated === false);
    check('points: เรียงตามเวลา', all.rows.every((r, i) => i === 0 || r[3] >= all.rows[i - 1][3]));
    check('points: ค่าว่างเป็น null ไม่ใช่ 0', all.rows.find((r) => r[0] === 'w4')[6] === null);
    check('points: localMinutes เป็นเวลาไทย 08:00', all.rows[0][4] === 480);
    const omuRows = (await get('/api/points?dataset=OMU')).body.rows;
    check('points OMU: localMinutes เป็นเวลาโอซากา 10:00', omuRows[0][4] === 600);

    const day1 = (await get('/api/points?dataset=Walking&date=2025-12-17')).body;
    check('points: กรองวันเดียว', day1.rows.length === 5, `${day1.rows.length}`);
    const range = (await get('/api/points?dataset=Walking&date=2025-12-17&dateEnd=2025-12-18')).body;
    check('points: กรองช่วงวัน', range.rows.length === 6);
    const win = (await get('/api/points?dataset=Walking&timeStart=540&timeEnd=600')).body;
    check('points: กรองช่วงเวลาในวัน 09:00-10:00', win.rows.length === 3, win.rows.map((r) => r[4]).join(','));
    check('points: ไม่มีแถวหลุดช่วงเวลา', win.rows.every((r) => r[4] >= 540 && r[4] <= 600));

    const hide = (await get('/api/points?dataset=Walking&interpolated=hide')).body;
    const only = (await get('/api/points?dataset=Walking&interpolated=only')).body;
    check('points: hide ไม่มี GPS ประมาณ', hide.rows.every((r) => r[10] === 0) && hide.rows.length === 5);
    check('points: only เหลือแต่ GPS ประมาณ', only.rows.every((r) => r[10] === 1) && only.rows.length === 1);
    check('points: hide + only = ทั้งหมด', hide.rows.length + only.rows.length === all.rows.length);

    const box = (await get('/api/points?dataset=Walking&bbox=100.495,13.795,100.525,13.825')).body;
    check('points: bbox กรองถูก', box.rows.length === 3, `${box.rows.length}`);
    const lim = (await get('/api/points?dataset=Walking&limit=2')).body;
    check('points: limit + truncated', lim.rows.length === 2 && lim.truncated === true);
    const exact = (await get('/api/points?dataset=Walking&limit=6')).body;
    check('points: limit พอดีจำนวนแถว ต้องไม่บอกว่า truncated', exact.rows.length === 6 && exact.truncated === false);

    const det = (await get('/api/points/w4')).body;
    const cols = ['_id', 'dataset', 'device', 'timestamp', 'localDate', 'localMinutes', 'latitude', 'longitude', 'alt_m', 'sound_db', 'temp_c', 'humidity_pct', 'lux', 'uv_index', 'satellites', 'gps_valid', 'gps_interpolated'];
    check('point detail: ครบทุกคอลัมน์', cols.every((k) => k in det));
    check('point detail: gps_interpolated ถูกต้อง', det.gps_interpolated === true);
    check('point detail: id ไม่มีจริง = 404', (await get('/api/points/nope')).status === 404);

    // ---------- stats ----------
    const st = (await get('/api/stats?dataset=Walking')).body;
    check('stats: count รวมจุดที่ไม่มีพิกัดด้วย', st.count === 7 && st.withCoords === 6);
    check('stats: sound_db avg = 505/7', close(st.metrics.sound_db.avg, 505 / 7), String(st.metrics.sound_db.avg));
    check('stats: sound_db min/max', st.metrics.sound_db.min === 50 && st.metrics.sound_db.max === 100);
    check('stats: temp_c นับเฉพาะที่มีค่า', st.metrics.temp_c.count === 3 && close(st.metrics.temp_c.avg, 31));
    check('stats: metric ที่ไม่มีค่าเลยไม่โผล่', st.metrics.lux === undefined);

    const byHour = (await get('/api/stats?dataset=Walking&groupBy=hour')).body;
    check('stats groupBy=hour: แยกตามชั่วโมงท้องถิ่น', byHour.length === 3, byHour.map((b) => b.key).join(','));
    check('stats groupBy=hour: ผลรวม = ยอดรวม', byHour.reduce((a, b) => a + b.count, 0) === st.count);
    const wAvg = byHour.reduce((a, b) => a + b.metrics.sound_db.avg * b.metrics.sound_db.count, 0) / byHour.reduce((a, b) => a + b.metrics.sound_db.count, 0);
    check('stats: เฉลี่ยถ่วงน้ำหนักรายชั่วโมง = เฉลี่ยรวม (สูตรที่ dashboard ใช้)', close(wAvg, st.metrics.sound_db.avg));
    const byDate = (await get('/api/stats?dataset=Walking&groupBy=date')).body;
    check('stats groupBy=date', byDate.length === 2 && byDate[0].key === '2025-12-17');
    check('stats: ไม่มีข้อมูลตามตัวกรอง = ก้อนศูนย์ ไม่ใช่ error', (await get('/api/stats?dataset=Walking&date=2030-01-01')).body.count === 0);

    // ---------- histogram ----------
    const hg = (await get('/api/stats/histogram?dataset=Walking&metric=sound_db&bins=5')).body;
    check('histogram: min/max/total', hg.min === 50 && hg.max === 100 && hg.total === 7);
    check('histogram: ผลรวม bin = total (ค่าสูงสุดไม่ตกขอบ)', hg.bins.reduce((a, b) => a + b.count, 0) === 7);
    check('histogram: แจกแจงถูกช่อง', hg.bins.map((b) => b.count).join(',') === '2,1,1,1,2', hg.bins.map((b) => b.count).join(','));
    check('histogram: ช่องกว้างเท่ากัน', hg.bins.every((b) => close(b.to - b.from, 10)));
    const hgOne = (await get('/api/stats/histogram?dataset=BirdIoTMic&metric=humidity_pct&bins=4')).body;
    check('histogram: ข้อมูลน้อยก็ยังแบ่งได้', hgOne.total === 2 && hgOne.bins.reduce((a, b) => a + b.count, 0) === 2);
    check('histogram: metric ที่ dataset ไม่มี = bins ว่าง', (await get('/api/stats/histogram?dataset=OMU&metric=lux')).body.bins.length === 0);

    // ---------- tracks ----------
    const tr = (await get('/api/tracks?dataset=Walking')).body;
    check('tracks', tr.length === 1 && tr[0].pointCount === 5);
    check('tracks: coords เท่ากับ times', tr[0].geometry.coordinates.length === tr[0].times.length);
    check('tracks: times เป็น epoch ms', typeof tr[0].times[0] === 'number');
    check('tracks: กรองวันที่ไม่มี = ว่าง', (await get('/api/tracks?dataset=Walking&date=2025-12-18')).body.length === 0);

    // ---------- zones ----------
    const zNear = (await get('/api/zones')).body;
    const zAll = (await get('/api/zones?all=1')).body;
    check('zones: default ตัดโซนที่ไกลจากข้อมูลออก', zNear.length === 1 && zNear[0].name === 'โซนทดสอบ', `${zNear.length} โซน`);
    check('zones ?all=1: ได้ครบ', zAll.length === 2);
    const zs = (await get('/api/zones/stats')).body;
    const z1 = zs.find((z) => z.name === 'โซนทดสอบ');
    check('zone stats: นับจุดในโซนถูก', z1.count === 3, `${z1.count}`);
    check('zone stats: sound avg = 60', close(z1.metrics.sound_db.avg, 60), String(z1.metrics.sound_db.avg));
    check('zone stats: temp avg = 31', close(z1.metrics.temp_c.avg, 31));
    const zsWin = (await get('/api/zones/stats?timeStart=540&timeEnd=1439')).body.find((z) => z.name === 'โซนทดสอบ');
    check('zone stats: respect filter เวลา', zsWin.count === 1, `${zsWin.count}`);

    // CRUD
    const newGeom = poly([[100.53, 13.825], [100.56, 13.825], [100.56, 13.86], [100.53, 13.86], [100.53, 13.825]]);
    const created = await send('/api/zones', 'POST', { name: 'โซนใหม่', category: 'commercial', color: '#409eff', geometry: newGeom });
    check('POST zone', created.status === 201 && created.body.source === 'user' && created.body.nearData === true);
    check('POST zone: ชื่อไทยไม่เพี้ยน', created.body.name === 'โซนใหม่');
    const newId = created.body._id;
    check('POST แล้วเห็นในรายการ', (await get('/api/zones?all=1')).body.length === 3);
    const upd = await send(`/api/zones/${newId}`, 'PUT', { name: 'แก้ชื่อแล้ว', category: 'park' });
    check('PUT zone', upd.status === 200 && upd.body.name === 'แก้ชื่อแล้ว' && upd.body.category === 'park');
    check('PUT: geometry เดิมไม่ถูกแตะ', upd.body.geometry.coordinates[0].length === 5);
    check('zone ใหม่โผล่ใน stats', (await get('/api/zones/stats')).body.some((z) => z.name === 'แก้ชื่อแล้ว'));
    check('DELETE zone', (await send(`/api/zones/${newId}`, 'DELETE')).status === 200);
    check('DELETE ซ้ำ = 404', (await send(`/api/zones/${newId}`, 'DELETE')).status === 404);
    check('กลับมาเท่าเดิม', (await get('/api/zones?all=1')).body.length === 2);

    // ---------- validation ----------
    const bad = [
      ['/api/points?dataset=NotReal', 400], ['/api/points?date=17-12-2025', 400],
      ['/api/points?dateEnd=2025-12-18', 400], ['/api/points?date=2025-12-20&dateEnd=2025-12-17', 400],
      ['/api/points?timeStart=abc', 400], ['/api/points?timeStart=1440', 400], ['/api/points?timeStart=-1', 400],
      ['/api/points?timeStart=720&timeEnd=540', 400], ['/api/points?interpolated=yes', 400],
      ['/api/points?bbox=1,2,3', 400], ['/api/points?bbox=100.7,13.9,100.5,13.8', 400],
      ['/api/points?limit=0', 400], ['/api/points?limit=-5', 400],
      ['/api/stats?groupBy=week', 400], ['/api/stats/histogram?metric=nope', 400],
      ['/api/stats/histogram?metric=sound_db&bins=1', 400], ['/api/tracks?dataset=NotReal', 400],
      ['/api/tracks?date=bad', 400],
    ];
    for (const [p, want] of bad) {
      const r = await get(p);
      check(`validation ${p} = ${want}`, r.status === want, `ได้ ${r.status}`);
    }
    check('zone id ผิดรูป = 400 ไม่ใช่ 500', (await send('/api/zones/xyz', 'DELETE')).status === 400);
    check('PUT zone id ผิดรูป = 400', (await send('/api/zones/xyz', 'PUT', { name: 'x' })).status === 400);
    check('POST zone ชื่อว่าง = 400', (await send('/api/zones', 'POST', { name: '  ', category: 'park', geometry: smallPoly })).status === 400);
    check('POST zone category ผิด = 400', (await send('/api/zones', 'POST', { name: 'x', category: 'nope', geometry: smallPoly })).status === 400);
    check('POST zone geometry ผิดชนิด = 400', (await send('/api/zones', 'POST', { name: 'x', category: 'park', geometry: { type: 'Point', coordinates: [100, 13] } })).status === 400);
    check('POST zone สีผิดรูป = 400', (await send('/api/zones', 'POST', { name: 'x', category: 'park', color: 'green', geometry: smallPoly })).status === 400);

    // ---------- gzip ----------
    // compression ไม่บีบ response ที่เล็กกว่า 1KB — ต้องยิงตัวที่ใหญ่พอถึงจะเห็นผล
    const gzBig = await get('/api/points?dataset=Ayutthaya', { 'Accept-Encoding': 'gzip' });
    check('gzip ทำงานกับ response ใหญ่', gzBig.headers.get('content-encoding') === 'gzip', gzBig.headers.get('content-encoding') ?? 'ไม่มี header');
    check('gzip: ข้อมูลยังถอดออกมาครบ', gzBig.body.rows.length === 300, `${gzBig.body.rows.length} แถว`);
    const gzSmall = await get('/api/points?dataset=BirdIoTMic', { 'Accept-Encoding': 'gzip' });
    check('response เล็กไม่ต้องบีบ (ตามค่าเริ่มต้นของ compression)', gzSmall.headers.get('content-encoding') === null);

    // ---------- ป้ายบอกที่มาของข้อมูล ----------
    // หน้าเว็บใช้ header นี้ขึ้นแถบเตือนว่ากำลังดูข้อมูลปลอม
    const real = await get('/api/datasets');
    check('createApp ปกติติดป้าย X-Data-Source: real', real.headers.get('x-data-source') === 'real', real.headers.get('x-data-source') ?? 'ไม่มี');
    const demoServer = createApp(db, { demo: true }).listen(0);
    try {
      const r = await fetch(`http://127.0.0.1:${demoServer.address().port}/api/datasets`);
      check('createApp({demo:true}) ติดป้าย X-Data-Source: demo', r.headers.get('x-data-source') === 'demo', r.headers.get('x-data-source') ?? 'ไม่มี');
      check('demo: header เปิดให้ browser อ่านข้ามโดเมนได้', (r.headers.get('access-control-expose-headers') ?? '').includes('X-Data-Source'));
    } finally {
      demoServer.close();
    }
  } finally {
    server.close();
    await client.close();
    await mongo.stop();
  }

  console.log(`\n${pass} ผ่าน / ${fail} ไม่ผ่าน`);
  process.exit(fail ? 1 : 0);
})();
