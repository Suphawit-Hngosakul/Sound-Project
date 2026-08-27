// UI smoke test — ขับเบราว์เซอร์จริงผ่าน Edge ที่ติดตั้งอยู่แล้ว (playwright-core ไม่โหลด browser เอง)
// ต้องมี API + vite dev รันอยู่ก่อน:  server: npm run dev:local   web: npm run dev
const { chromium } = require('playwright-core');
const path = require('path');

const BASE = process.env.UI_BASE || 'http://localhost:5173';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SHOTS = path.join(__dirname, '..', '..', '.ui-shots');

let pass = 0, fail = 0;
const flat = (s) => String(s).split('\n').join(' | ');
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

(async () => {
  const browser = await chromium.launch({ executablePath: EDGE });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // เก็บ error ของหน้าเว็บไว้ทั้งหมด — console error หรือ exception ถือว่าตก
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => errors.push(`exception: ${e.message.slice(0, 200)}`));
  const failedReq = [];
  page.on('requestfailed', (r) => failedReq.push(`${r.url().slice(0, 120)} ${r.failure()?.errorText}`));

  const shot = async (name) => { await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }); };
  // แผนที่ยิง tile ตลอดเวลา networkidle เลยไม่มีวันเกิด — รอ DOM แล้วค่อยรอ element ที่ต้องการเอา
  const goto = async (p) => { await page.goto(BASE + p, { waitUntil: 'domcontentloaded', timeout: 45000 }); };

  try {
    require('fs').mkdirSync(SHOTS, { recursive: true });

    // ---------- Overview ----------
    await goto('/');
    await page.waitForSelector('.card', { timeout: 30000 });
    const cards = await page.locator('.card').count();
    check('Overview: การ์ดสรุปขึ้นครบตามจำนวน dataset', cards > 0, `${cards} ใบ`);
    check('Overview: มีแผนที่', (await page.locator('.map-container canvas').count()) > 0);
    check('Overview: ปุ่มสลับแผนที่ถนน/ดาวเทียม', (await page.locator('.basemap-switch .seg-btn').count()) === 2);
    check('Overview: legend เลือก dataset ได้', (await page.locator('.map-legend .check').count()) > 0);
    const navText = await page.locator('.navbar').innerText();
    check('Navbar: ภาษาไทยเป็นค่าเริ่มต้น', navText.includes('ภาพรวม'), navText.replace(/\n/g, ' ').slice(0, 60));
    await shot('01-overview');

    // ---------- hover จุดในหน้าภาพรวม ----------
    // จุดที่นี่ไล่สีตามชุดข้อมูล ดูจากสีอย่างเดียวไม่รู้ว่าจุดไหนของชุดไหน เก็บตอนไหน
    // หน้านี้ fit ทั้งไทยและโอซาก้า จุดจึงห่างกันมาก กวาดมั่วไม่มีทางโดน
    // ต้องซูมไปที่จุดจริงแล้ว project เป็นพิกัดจอ (จุดในหน้านี้มีเฉพาะชุดที่อยู่กับที่)
    const ovAim = await page.evaluate(async () => {
      const res = await (await fetch('/api/points?dataset=SiteInPuey&limit=100')).json();
      const row = res.rows[0];
      const m = window.__map;
      if (!m) return null;
      m.jumpTo({ center: [row[1], row[2]], zoom: 16 });
      await new Promise((r) => setTimeout(r, 1200));
      const pt = m.project([row[1], row[2]]);
      const c = m.getContainer().getBoundingClientRect();
      return { x: c.x + pt.x, y: c.y + pt.y };
    });
    let ovTip = '';
    if (ovAim) {
      await page.waitForTimeout(1500);
      for (const [dx, dy] of [[0, 0], [1, 1], [-1, -1], [2, 0], [0, 2], [-2, 2]]) {
        await page.mouse.move(ovAim.x + dx, ovAim.y + dy);
        await page.waitForTimeout(250);
        const tip = page.locator('.map-tooltip').first();
        if ((await tip.count()) && /เปิดชุดข้อมูลนี้/.test(await tip.innerText())) { ovTip = await tip.innerText(); break; }
      }
      check('Overview: hover จุดแล้วบอกชุดข้อมูลกับเวลา', ovTip.includes('SiteInPuey'), flat(ovTip) || '(ไม่มี tooltip)');
    }

    // ---------- สลับภาษา ----------
    await page.locator('.lang-btn').click();
    await page.waitForTimeout(300);
    check('สลับเป็นอังกฤษแล้วเมนูเปลี่ยน', (await page.locator('.navbar').innerText()).includes('Overview'));
    await page.locator('.lang-btn').click();
    await page.waitForTimeout(300);
    check('สลับกลับเป็นไทยได้', (await page.locator('.navbar').innerText()).includes('ภาพรวม'));

    // ---------- Dataset ----------
    await goto('/dataset/Walking');
    await page.waitForSelector('.sidebar h2', { timeout: 30000 });
    check('Dataset: ชื่อชุดข้อมูลถูกต้อง', (await page.locator('.sidebar h2').innerText()) === 'Walking');
    check('Dataset: มี legend สีตาม metric', (await page.locator('.legend-bar').count()) === 1);
    const layerCount = await page.locator('.panel .check').count();
    check('Dataset: layer panel ครบ', layerCount >= 6, `${layerCount} toggle`);
    await shot('02-dataset');

    // ค่าที่วัดเป็น layer ติ๊กเปิดพร้อมกันได้หลายค่า
    const soundLayer = page.locator('.check', { hasText: 'เสียง (dB)' }).first();
    check('Dataset: ค่าที่วัดอยู่ใน layer panel', (await soundLayer.count()) > 0);
    check('Dataset: legend ขึ้นตามค่าที่เปิดอยู่', (await page.locator('.legend-head').allInnerTexts()).join(',').includes('เสียง'));
    const tempLayer = page.locator('.check', { hasText: 'อุณหภูมิ' }).first();
    await tempLayer.locator('input').check();
    await page.waitForTimeout(900);
    const legendNames = await page.locator('.legend-head').allInnerTexts();
    check('Dataset: เปิดค่าที่สองแล้วได้ legend สองอัน', legendNames.length === 2, legendNames.join(' + '));
    check('Dataset: เปิดหลายค่าแล้วไม่ error', errors.length === 0, errors[0] ?? '');
    await tempLayer.locator('input').uncheck();
    await soundLayer.locator('input').uncheck();
    await page.waitForTimeout(700);
    check('Dataset: ปิดค่าหมดแล้วบอกว่าเหลือแค่ตำแหน่ง',
      (await page.locator('.panel', { hasText: 'ค่าที่วัด' }).innerText()).includes('แสดงแค่ตำแหน่ง'));
    await soundLayer.locator('input').check();
    await page.waitForTimeout(700);

    // เปิด heatmap + replay
    await page.locator('.check', { hasText: 'Heatmap' }).locator('input').check();
    await page.waitForTimeout(500);
    check('เปิด heatmap ได้', await page.locator('.check', { hasText: 'Heatmap' }).locator('input').isChecked());
    await page.locator('.check', { hasText: 'เล่นย้อนเส้นทาง' }).locator('input').check();
    await page.waitForSelector('.replay-time', { timeout: 10000 });
    const t0 = await page.locator('.replay-time').innerText();
    await page.locator('.play-btn').click();
    await page.waitForTimeout(1500);
    const t1 = await page.locator('.replay-time').innerText();
    check('Replay: กดเล่นแล้วเวลาเดินหน้า', t0 !== t1, `${t0} -> ${t1}`);
    await shot('03-replay');
    await page.locator('.play-btn').click();

    // filter วัน
    await page.locator('.seg-btn', { hasText: 'วันเดียว' }).first().click();
    await page.waitForTimeout(800);
    check('เลือกโหมดวันเดียวแล้วมี date picker', (await page.locator('.panel .row select').count()) > 0);

    // คลิกจุดบนแผนที่เพื่อเปิด popup
    const box = await page.locator('.map-container canvas').first().boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(800);

    // ---------- Zones ----------
    await goto('/zones');
    await page.waitForSelector('.zone-list', { timeout: 30000 });
    const zoneRows = await page.locator('.zone-row').count();
    check('Zones: รายการโซนขึ้น', zoneRows > 0, `${zoneRows} โซน`);
    const drawBtns = page.locator('.panel', { hasText: 'วาดโซนใหม่' }).locator('.seg-btn');
    check('Zones: มีปุ่มวาดครบ 4 แบบ', (await drawBtns.count()) === 4, (await drawBtns.allInnerTexts()).join('/'));
    await page.locator('.zone-main').first().click();
    await page.waitForTimeout(800);
    check('Zones: คลิกโซนแล้วมีแผงสถิติ', (await page.locator('.stats-table').count()) > 0 || (await page.locator('.panel', { hasText: 'สถิติในโซน' }).count()) > 0);
    await shot('04-zones');

    // ---------- วาดโซนจริง ----------
    // เคยพังเงียบมาแล้ว: geojson source ของ maplibre ต้องมี worker ถ้า worker ไม่ขึ้น
    // Terra Draw เก็บรูปเข้า source ได้ปกติ แต่ไม่มีอะไรวาดออกจอเลย คลิกแล้วเหมือนเว็บค้าง
    await drawBtns.nth(3).click(); // โหมดอิสระ
    await page.waitForTimeout(300);
    const mapBox = await page.locator('.map-container').first().boundingBox();
    const cx = mapBox.x + mapBox.width * 0.5;
    const cy = mapBox.y + mapBox.height * 0.45;
    await page.mouse.move(cx + 110, cy);
    await page.mouse.down();
    for (let a = 0; a <= 360; a += 20) {
      const rad = (a * Math.PI) / 180;
      await page.mouse.move(cx + 110 * Math.cos(rad), cy + 110 * Math.sin(rad));
      await page.waitForTimeout(20);
    }
    await page.mouse.up();
    await page.waitForTimeout(1200);
    check('Zones: วาดอิสระแล้วได้ฟอร์มโซนใหม่', (await page.locator('.zone-form').count()) > 0);
    // window.__map มีเฉพาะตอน dev (vite ตัดทิ้งตอน build) — เช็ค render จริงเท่าที่เข้าถึงได้
    const drawState = await page.evaluate(() => {
      const m = window.__map;
      if (!m) return null;
      return { loaded: m.loaded(), srcLoaded: m.isSourceLoaded('td-polygon'), rendered: m.querySourceFeatures('td-polygon').length };
    });
    if (drawState) {
      check('Zones: รูปที่วาดขึ้นบนแผนที่จริง (ไม่ใช่แค่มีข้อมูลใน source)', drawState.rendered > 0, JSON.stringify(drawState));
      check('Zones: geojson source ของ maplibre โหลดได้ (worker ทำงาน)', drawState.srcLoaded === true);
    }
    await page.locator('.zone-form .link-btn', { hasText: 'ยกเลิก' }).click();
    await page.waitForTimeout(300);
    check('Zones: กดยกเลิกแล้วฟอร์มหาย', (await page.locator('.zone-form').count()) === 0);

    // เปิดฟอร์มแก้โซน
    await page.locator('.link-btn', { hasText: 'แก้ไข' }).first().click();
    await page.waitForSelector('.zone-form', { timeout: 10000 });
    check('Zones: ฟอร์มแก้ไขเปิดพร้อมชื่อเดิม', (await page.locator('.zone-form input').first().inputValue()).length > 0);
    await page.locator('.link-btn', { hasText: 'ยกเลิก' }).click();

    // ---------- สลับชุดข้อมูลแล้วแผนที่ต้องวาปตาม ----------
    // เคยพลาดมาแล้ว: effect ของ MapView (ลูก) ทำงานก่อน effect ของหน้า (แม่)
    // แผนที่เลย fit ไปที่ bounds ของชุดเดิม แล้วไม่ขยับอีกเลยตอนข้อมูลจริงมา = ช้าไปหนึ่งชุดตลอด
    const centerNow = () => page.evaluate(() => {
      const m = window.__map;
      if (!m) return null;
      const c = m.getCenter();
      return { lng: c.lng, lat: c.lat };
    });
    if (await centerNow()) {
      const moves = [
        ['OMU', 135.4, 135.7, 34.5, 34.8],
        ['Ayutthaya', 100.4, 100.8, 14.0, 14.4],
        ['Walking', 100.4, 100.8, 13.8, 14.2],
      ];
      let okAll = true;
      let detail = '';
      for (const [ds, lngLo, lngHi, latLo, latHi] of moves) {
        await page.selectOption('.nav-select', ds);
        await page.waitForTimeout(4000);
        const c = await centerNow();
        const ok = c.lng > lngLo && c.lng < lngHi && c.lat > latLo && c.lat < latHi;
        if (!ok) okAll = false;
        detail += ds + '(' + c.lng.toFixed(2) + ',' + c.lat.toFixed(2) + ') ';
      }
      check('Dataset: สลับชุดข้อมูลแล้วแผนที่วาปไปที่ข้อมูลชุดนั้น', okAll, detail.trim());
    }

    // ---------- hover และเลือกจุดในหน้า dataset ----------
    await goto('/dataset/SiteInPuey');
    await page.waitForSelector('.sidebar h2', { timeout: 30000 });
    await page.waitForTimeout(4000);
    // เล็งจากพิกัดจริงแล้ว project เป็นพิกัดจอ — กวาดหาเองพลาดง่ายเพราะจุดกว้างไม่กี่พิกเซล
    const aim = await page.evaluate(async () => {
      const res = await (await fetch('/api/points?dataset=SiteInPuey&limit=500')).json();
      const row = res.rows[Math.floor(res.rows.length / 2)];
      const m = window.__map;
      if (!m) return null;
      m.jumpTo({ center: [row[1], row[2]], zoom: 17 });
      await new Promise((r) => setTimeout(r, 1200));
      const pt = m.project([row[1], row[2]]);
      const c = m.getContainer().getBoundingClientRect();
      return { x: c.x + pt.x, y: c.y + pt.y };
    });
    if (aim) {
      await page.waitForTimeout(2000);
      let tipText = '';
      for (const [dx, dy] of [[0, 0], [1, 1], [-1, -1], [2, 0], [0, 2]]) {
        await page.mouse.move(aim.x + dx, aim.y + dy);
        await page.waitForTimeout(250);
        const tip = page.locator('.map-tooltip').first();
        if ((await tip.count()) && /คลิกเพื่อดู/.test(await tip.innerText())) { tipText = await tip.innerText(); break; }
      }
      check('Dataset: hover จุดแล้วขึ้นเวลาและค่าที่วัด', /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(tipText), flat(tipText));
      check('Dataset: ชี้จุดแล้วเคอร์เซอร์เป็น pointer', (await page.locator('.map-container-wrap.picking').count()) > 0);
      await page.mouse.click(aim.x, aim.y);
      await page.waitForSelector('.popup-panel', { timeout: 15000 });
      check('Dataset: คลิกจุดแล้วเปิดแผงรายละเอียด', (await page.locator('.popup-panel').count()) > 0);
      await page.mouse.move(aim.x + 1, aim.y + 1);
      await page.waitForTimeout(500);
      const tip2 = page.locator('.map-tooltip').first();
      const sameText = (await tip2.count()) ? await tip2.innerText() : '';
      check('Dataset: hover จุดที่เปิดอยู่ บอกว่าเป็นจุดเดียวกัน', /กำลังแสดงรายละเอียด/.test(sameText), flat(sameText));
      await shot('06-point-hover');
      await page.locator('.popup-head .link-btn').click();
    }

    // ---------- Dashboard ----------
    await goto('/dashboard');
    await page.waitForSelector('.tile', { timeout: 45000 });
    const tiles = await page.locator('.tile').count();
    check('Dashboard: การ์ดสรุปขึ้น', tiles > 0, `${tiles} ใบ`);
    await page.waitForSelector('.chart-card canvas', { timeout: 30000 });
    const charts = await page.locator('.chart-card canvas').count();
    check('Dashboard: กราฟ render จริง', charts > 0, `${charts} กราฟ`);
    check('Dashboard: มีตารางต่อโซน', (await page.locator('.data-table').count()) > 0);
    await page.locator('.table-details summary').first().click();
    await page.waitForTimeout(300);
    check('Dashboard: กางตารางตัวเลขได้', (await page.locator('.table-details[open]').count()) > 0);
    await shot('05-dashboard');

    // สลับแท็บ
    const tabs = await page.locator('.tab').count();
    if (tabs > 1) {
      await page.locator('.tab').nth(1).click();
      await page.waitForTimeout(1500);
      check('Dashboard: สลับแท็บ dataset ได้', (await page.locator('.tab.active').innerText()).length > 0);
    }

    // ---------- สรุป error ----------
    const realErrors = errors.filter((e) => !/favicon|DevTools/i.test(e));
    check('ไม่มี error ในคอนโซลตลอดการทดสอบ', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
    // ERR_ABORTED ของ tile = เปลี่ยนหน้าแล้วเบราว์เซอร์ยกเลิกเอง ไม่ใช่ของเสีย
    const realFailed = failedReq.filter((r) => !/favicon/i.test(r) && !/ERR_ABORTED/.test(r));
    check('ไม่มี request ที่ล้มเหลว', realFailed.length === 0, realFailed.slice(0, 3).join(' | '));
    // worker ของ maplibre ต้องโหลดได้ทั้ง dev และ build — ถ้าไม่ขึ้น geojson source ตายเงียบทั้งหมด
    // (เคยยอมให้ตกบน dev server มาก่อน บั๊ก "วาดโซนไม่ได้" เลยรอดสายตาไปนาน)
    const workerFailed = failedReq.filter((r) => /maplibre-gl-worker/.test(r));
    check('worker ของ maplibre โหลดได้', workerFailed.length === 0, workerFailed.slice(0, 2).join(' | '));
  } catch (e) {
    check(`ทดสอบล้มกลางคัน: ${e.message.slice(0, 150)}`, false);
    await page.screenshot({ path: path.join(SHOTS, 'error.png') }).catch(() => {});
  } finally {
    await browser.close();
  }

  console.log(`\n${pass} ผ่าน / ${fail} ไม่ผ่าน`);
  console.log(`ภาพหน้าจอ: ${SHOTS}`);
  process.exit(fail ? 1 : 0);
})();
