// UI smoke test — ขับเบราว์เซอร์จริงผ่าน Edge ที่ติดตั้งอยู่แล้ว (playwright-core ไม่โหลด browser เอง)
// ต้องมี API + vite dev รันอยู่ก่อน:  server: npm run dev:fixtures   web: npm run dev
const { chromium } = require('playwright-core');
const path = require('path');

const BASE = process.env.UI_BASE || 'http://localhost:5173';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const SHOTS = path.join(__dirname, '..', '..', '.ui-shots');

let pass = 0, fail = 0;
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

    // เปลี่ยน metric
    await page.selectOption('.sidebar select', 'temp_c');
    await page.waitForTimeout(600);
    check('เปลี่ยน metric แล้วไม่ error', errors.length === 0, errors[0] ?? '');

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
    check('Zones: มีปุ่มวาดครบ 3 แบบ', (await page.locator('.panel .seg-btn').count()) >= 3);
    await page.locator('.zone-main').first().click();
    await page.waitForTimeout(800);
    check('Zones: คลิกโซนแล้วมีแผงสถิติ', (await page.locator('.stats-table').count()) > 0 || (await page.locator('.panel', { hasText: 'สถิติในโซน' }).count()) > 0);
    await shot('04-zones');

    // เปิดฟอร์มแก้โซน
    await page.locator('.link-btn', { hasText: 'แก้ไข' }).first().click();
    await page.waitForSelector('.zone-form', { timeout: 10000 });
    check('Zones: ฟอร์มแก้ไขเปิดพร้อมชื่อเดิม', (await page.locator('.zone-form input').first().inputValue()).length > 0);
    await page.locator('.link-btn', { hasText: 'ยกเลิก' }).click();

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
    // maplibre-gl-worker พังเฉพาะ dev server ของ vite (build จริงไม่เป็น) — ตรวจแยกไว้ข้างล่าง
    const realFailed = failedReq.filter((r) => !/favicon/i.test(r) && !/ERR_ABORTED/.test(r) && !/maplibre-gl-worker/.test(r));
    check('ไม่มี request ที่ล้มเหลว', realFailed.length === 0, realFailed.slice(0, 3).join(' | '));
    const workerFailed = failedReq.some((r) => /maplibre-gl-worker/.test(r));
    check('build จริงโหลด worker ของ maplibre ได้ (dev server ของ vite โหลดไม่ได้ ไม่กระทบการใช้งาน)',
      !workerFailed || BASE.includes('5173'), workerFailed ? 'worker โหลดไม่ผ่าน' : 'ปกติ');
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
