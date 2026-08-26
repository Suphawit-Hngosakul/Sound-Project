// bundle test ทุกไฟล์ด้วย esbuild แล้วรันด้วย node — ไม่ต้องติดตั้ง test runner เพิ่ม
const { buildSync } = require('esbuild');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.ts')).sort();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webtest-'));
let failed = 0;
for (const f of files) {
  const out = path.join(tmp, f.replace('.ts', '.cjs'));
  buildSync({ entryPoints: [path.join(__dirname, f)], bundle: true, platform: 'node', format: 'cjs', outfile: out, logLevel: 'warning' });
  console.log(`\n===== ${f} =====`);
  try { execFileSync(process.execPath, [out], { stdio: 'inherit' }); }
  catch { failed++; }
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed ? `\n${failed} ไฟล์ไม่ผ่าน` : `\nผ่านทั้งหมด ${files.length} ไฟล์`);
process.exit(failed ? 1 : 0);
