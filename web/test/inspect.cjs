// เก็บหลักฐานงานดีไซน์รอบเดียว — ทุกหน้า ทั้ง desktop และ mobile + ค่า computed ที่ต้องตรวจ
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const BASE = process.env.UI_BASE || 'http://localhost:5173';
const EDGE = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(__dirname, '..', '..', '.ui-shots');
const SCHEME = process.env.COLOR_SCHEME === 'dark' ? 'dark' : 'light';
const TAG = SCHEME === 'dark' ? 'dark-' : 'insp-';

const PAGES = [
  ['overview', '/', '.card'],
  ['dataset', '/dataset/Walking', '.sidebar h2'],
  ['zones', '/zones', '.zone-list'],
  ['dashboard', '/dashboard', '.tile'],
];
const SIZES = [['desktop', 1440, 900], ['mobile', 390, 844]];

// contrast ratio ตาม WCAG
function luminance([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const parse = (css) => (css.match(/[\d.]+/g) || []).slice(0, 3).map(Number);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EDGE });
  const report = { contrast: [], focus: [], surfaces: {}, overflow: [], touch: [] };

  for (const [sizeName, width, height] of SIZES) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: SCHEME });
    for (const [name, route, waitFor] of PAGES) {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector(waitFor, { timeout: 40000 }).catch(() => {});
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(OUT, `${TAG}${sizeName}-${name}.png`), fullPage: sizeName === 'mobile' });

      const data = await page.evaluate(() => {
        // พื้นหลังจริงที่ตาเห็น = ซ้อนสีโปร่งใสทุกชั้นลงบนชั้นทึบที่อยู่ล่างสุด
        const rgba = (css) => {
          const n = (css.match(/[\d.]+/g) || []).map(Number);
          return { r: n[0] || 0, g: n[1] || 0, b: n[2] || 0, a: n.length > 3 ? n[3] : 1 };
        };
        const bgOf = (el) => {
          const layers = [];
          let n = el;
          while (n) {
            const c = rgba(getComputedStyle(n).backgroundColor);
            if (c.a > 0) { layers.push(c); if (c.a === 1) break; }
            n = n.parentElement;
          }
          layers.push({ r: 255, g: 255, b: 255, a: 1 });
          let out = layers[layers.length - 1];
          for (let i = layers.length - 2; i >= 0; i--) {
            const t = layers[i];
            out = { r: t.r * t.a + out.r * (1 - t.a), g: t.g * t.a + out.g * (1 - t.a), b: t.b * t.a + out.b * (1 - t.a), a: 1 };
          }
          return `rgb(${Math.round(out.r)}, ${Math.round(out.g)}, ${Math.round(out.b)})`;
        };
        const sel = '.dim, .small, .tile-label, .panel-title, .legend-labels span, .card-kv dt, .data-table th, .tag, .nav-link, .seg-btn, .tab, .zone-name, figcaption, label, .link-btn, .replay-time';
        const out = [];
        for (const el of document.querySelectorAll(sel)) {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || !el.textContent.trim()) continue;
          out.push({ cls: el.className.toString().slice(0, 40), text: el.textContent.trim().slice(0, 24), color: cs.color, bg: bgOf(el), size: cs.fontSize, weight: cs.fontWeight });
        }
        // เอกลักษณ์ของ browser surface ที่ต้องตั้งเอง
        const root = getComputedStyle(document.documentElement);
        const surfaces = {
          scrollbarColor: root.scrollbarColor, scrollbarWidth: root.scrollbarWidth,
          accentColor: root.accentColor, caretColor: getComputedStyle(document.body).caretColor,
          hasSelectionRule: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => /::selection/.test(r.selectorText || '')); } catch { return false; } }),
          hasFocusVisible: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => /:focus-visible/.test(r.selectorText || '')); } catch { return false; } }),
          hasScrollbarRule: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => /scrollbar/i.test(r.selectorText || '') || /scrollbar-color/i.test(r.cssText || '')); } catch { return false; } }),
        };
        // ล้นแนวนอนที่สำคัญคือ "ตัวหน้าเลื่อนได้" — ล้นในกล่องที่ตั้งใจให้ scroll ไม่นับ
        const scrolls = document.documentElement.scrollWidth > window.innerWidth + 1;
        const overflow = scrolls ? [{ cls: 'PAGE เลื่อนแนวนอนได้', right: document.documentElement.scrollWidth }] : [];
        // ปุ่มที่เล็กกว่า 24px
        const touch = [];
        for (const el of document.querySelectorAll('button, a, input, select, summary')) {
          const r = el.getBoundingClientRect();
          if (r.width && r.height && (r.height < 24 || r.width < 24)) touch.push({ cls: (el.className.toString() || el.tagName).slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
        }
        return { out, surfaces, overflow: overflow.slice(0, 8), touch: touch.slice(0, 8) };
      });

      for (const t of data.out) {
        const c = ratio(parse(t.color), parse(t.bg));
        const big = parseFloat(t.size) >= 24 || (parseFloat(t.size) >= 18.66 && Number(t.weight) >= 700);
        if (c < (big ? 3 : 4.5)) report.contrast.push({ page: name, size: sizeName, ...t, ratio: +c.toFixed(2), need: big ? 3 : 4.5 });
      }
      report.surfaces = data.surfaces;
      if (data.overflow.length) report.overflow.push({ page: name, size: sizeName, items: data.overflow });
      if (data.touch.length) report.touch.push({ page: name, size: sizeName, items: data.touch });
    }
    await page.close();
  }

  await browser.close();
  const dedup = (arr, key) => [...new Map(arr.map((x) => [key(x), x])).values()];
  console.log('=== contrast ต่ำกว่าเกณฑ์ ===');
  for (const c of dedup(report.contrast, (x) => x.cls + x.color + x.bg)) console.log(` ${c.ratio}:1 (ต้อง ${c.need}) ${c.size} .${c.cls} "${c.text}" ${c.color} บน ${c.bg} [${c.page}/${c.size}]`);
  console.log('\n=== browser surfaces ===');
  console.log(JSON.stringify(report.surfaces, null, 1));
  console.log('\n=== ล้นแนวนอน ===');
  console.log(report.overflow.length ? JSON.stringify(report.overflow, null, 1) : ' ไม่มี');
  console.log('\n=== เป้าคลิกเล็กกว่า 24px ===');
  for (const t of dedup(report.touch.flatMap((r) => r.items.map((i) => ({ ...i, page: r.page, size: r.size }))), (x) => x.cls + x.w + x.h)) console.log(` ${t.w}x${t.h} .${t.cls} [${t.page}/${t.size}]`);
  console.log(`\nภาพ: ${OUT}`);
})();
