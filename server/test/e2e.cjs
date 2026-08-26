// E2E: ยิงทุก endpoint + ทุกชนิด filter เทียบผลให้สอดคล้องกัน
const BASE = 'http://localhost:3001';
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, body: await r.json().catch(() => null) }; };

(async () => {
  const h = await get('/api/health');
  check('health', h.status === 200 && h.body.ok);

  const ds = await get('/api/datasets');
  check('datasets = 5 ชุด', ds.status === 200 && ds.body.length === 5, `ได้ ${ds.body?.length}`);
  const datasets = ds.body;
  for (const d of datasets) {
    check(`${d.dataset}: มี dates/metrics/tz`, d.dates.length > 0 && d.metrics.length > 0 && Number.isFinite(d.tzOffsetMin));
    check(`${d.dataset}: withCoords <= count`, d.withCoords <= d.count);
  }
  check('OMU tz = +9', datasets.find(d => d.dataset === 'OMU').tzOffsetMin === 540);

  for (const d of datasets) {
    const all = await get(`/api/points?dataset=${d.dataset}`);
    check(`points ${d.dataset}`, all.status === 200 && all.body.rows.length > 0, `${all.body?.rows?.length} แถว`);
    check(`points ${d.dataset}: rows = withCoords`, all.body.rows.length === Math.min(d.withCoords, 30000));

    const day = d.dates[0];
    const oneDay = await get(`/api/points?dataset=${d.dataset}&date=${day}`);
    check(`points ${d.dataset} วันเดียว <= ทั้งหมด`, oneDay.body.rows.length <= all.body.rows.length);

    const win = await get(`/api/points?dataset=${d.dataset}&timeStart=540&timeEnd=720`);
    check(`points ${d.dataset} 09:00-12:00 <= ทั้งหมด`, win.body.rows.length <= all.body.rows.length);
    const outside = win.body.rows.filter(r => r[4] < 540 || r[4] > 720);
    check(`points ${d.dataset}: ไม่มีแถวนอกช่วงเวลา`, outside.length === 0, `หลุด ${outside.length}`);

    const hide = await get(`/api/points?dataset=${d.dataset}&interpolated=hide`);
    check(`points ${d.dataset} interpolated=hide สะอาด`, hide.body.rows.every(r => r[10] === 0));
    const only = await get(`/api/points?dataset=${d.dataset}&interpolated=only`);
    check(`points ${d.dataset} interpolated=only สะอาด`, only.body.rows.every(r => r[10] === 1));
    check(`points ${d.dataset}: hide + only = ทั้งหมด`, hide.body.rows.length + only.body.rows.length === all.body.rows.length);

    const lim = await get(`/api/points?dataset=${d.dataset}&limit=10`);
    check(`points ${d.dataset} limit=10`, lim.body.rows.length === 10 && lim.body.truncated === true);

    const id = all.body.rows[0][0];
    const det = await get(`/api/points/${id}`);
    check(`point detail ${d.dataset}`, det.status === 200 && det.body.dataset === d.dataset && 'gps_interpolated' in det.body);

    const st = await get(`/api/stats?dataset=${d.dataset}`);
    check(`stats ${d.dataset}: count = ยอด dataset`, st.body.count === d.count, `${st.body.count} vs ${d.count}`);
    const byHour = await get(`/api/stats?dataset=${d.dataset}&groupBy=hour`);
    check(`stats ${d.dataset} groupBy=hour`, Array.isArray(byHour.body) && byHour.body.length > 0);
    check(`stats ${d.dataset}: ผลรวมรายชั่วโมง = ยอดรวม`, byHour.body.reduce((a, b) => a + b.count, 0) === st.body.count);
    const byDate = await get(`/api/stats?dataset=${d.dataset}&groupBy=date`);
    check(`stats ${d.dataset}: จำนวนวัน = dates`, byDate.body.length === d.dates.length);

    for (const m of d.metrics) {
      const hg = await get(`/api/stats/histogram?dataset=${d.dataset}&metric=${m}&bins=16`);
      const sum = hg.body.bins.reduce((a, b) => a + b.count, 0);
      check(`histogram ${d.dataset}/${m}: ผลรวม bin = total`, sum === hg.body.total, `${sum} vs ${hg.body.total}`);
      check(`histogram ${d.dataset}/${m}: total = count ของ metric`, hg.body.total === st.body.metrics[m].count);
    }

    if (d.moving) {
      const tr = await get(`/api/tracks?dataset=${d.dataset}`);
      check(`tracks ${d.dataset}`, tr.status === 200 && tr.body.length === d.trackCount, `${tr.body?.length} vs ${d.trackCount}`);
      const bad = tr.body.filter(s => s.geometry.coordinates.length !== s.times.length);
      check(`tracks ${d.dataset}: coords ตรงกับ times`, bad.length === 0);
    }
  }

  const bbox = await get('/api/points?dataset=Walking&bbox=100.5,13.8,100.7,13.95');
  const outBox = bbox.body.rows.filter(r => r[1] < 100.5 || r[1] > 100.7 || r[2] < 13.8 || r[2] > 13.95);
  check('points bbox กรองถูก', bbox.body.rows.length > 0 && outBox.length === 0, `${bbox.body.rows.length} แถว หลุด ${outBox.length}`);

  const z = await get('/api/zones');
  const zAll = await get('/api/zones?all=1');
  check('zones', z.status === 200 && z.body.length > 0, `${z.body?.length} โซน`);
  check('zones ?all=1 >= default', zAll.body.length >= z.body.length);
  check('zones: มี name/category/color/geometry ครบ', z.body.every(x => x.name && x.category && /^#[0-9a-f]{6}$/i.test(x.color) && x.geometry));
  const zs = await get('/api/zones/stats');
  check('zones/stats', zs.status === 200 && zs.body.length > 0);
  check('zones/stats: โซนที่มีจุดต้องมี metric', zs.body.filter(x => x.count > 0).every(x => Object.keys(x.metrics).length > 0));
  const zsWin = await get('/api/zones/stats?timeStart=540&timeEnd=720');
  const total = (a) => a.reduce((s, x) => s + x.count, 0);
  check('zones/stats ตาม filter <= ไม่ filter', total(zsWin.body) <= total(zs.body), `${total(zsWin.body)} vs ${total(zs.body)}`);

  const errs = [
    ['/api/points?dataset=NotReal', 400], ['/api/points?date=25-01-01', 400],
    ['/api/stats/histogram?metric=nope', 400], ['/api/tracks?dataset=NotReal', 400],
    ['/api/points/ไม่มีจริง', 404],
  ];
  for (const [p, want] of errs) {
    const r = await get(p);
    check(`error ${p} = ${want}`, r.status === want, `ได้ ${r.status}`);
  }

  const post = await fetch(BASE + '/api/zones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '', category: 'park', geometry: { type: 'Polygon', coordinates: [[[100, 13], [100.1, 13], [100.1, 13.1], [100, 13]]] } }) });
  check('POST zone ชื่อว่าง = 400', post.status === 400);

  console.log(`\n${pass} ผ่าน / ${fail} ไม่ผ่าน`);
  process.exit(fail ? 1 : 0);
})();
