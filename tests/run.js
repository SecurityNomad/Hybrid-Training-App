const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const PORT = 8791;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.json':'application/json',
  '.png':'image/png', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json' };

// Chromium: env override, else the playwright cache this machine already has.
const EXE = process.env.CHROMIUM || path.join(process.env.HOME,
  'Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64',
  'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(b);
  });
});

// Freezes the page clock so date maths is deterministic. Must still allow new Date(y,m,d).
function clockStub() {
  if (!window.__NOW) return;
  const R = Date, N = new R(window.__NOW + 'T12:00:00');
  window.Date = class extends R {
    constructor(...a) { if (a.length === 0) super(N.getTime()); else super(...a); }
    static now() { return N.getTime(); }
  };
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  if (!fs.existsSync(EXE)) {
    console.error('Chromium not found at:\n  ' + EXE + '\nSet CHROMIUM=/path/to/chromium');
    process.exit(2);
  }
  const browser = await chromium.launch({ executablePath: EXE });
  const cases = require('./cases.js');
  let pass = 0, fail = 0;

  for (const c of cases) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(`window.__NOW = ${JSON.stringify(c.now || null)};`);
    await ctx.addInitScript(clockStub);
    if (c.state) {
      await ctx.addInitScript(
        `try{ localStorage.setItem('hyrox_dash_raha_v1', ${JSON.stringify(JSON.stringify(c.state))}); }catch(e){}`);
    }
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });

    let ok = false, detail = '';
    try { [ok, detail] = await pg.evaluate(c.fn); }
    catch (e) { ok = false; detail = 'threw: ' + e.message; }
    if (errs.length) { ok = false; detail += ' | page errors: ' + errs.join('; '); }

    console.log((ok ? '  PASS  ' : '  FAIL  ') + c.name + (detail ? '   ' + detail : ''));
    ok ? pass++ : fail++;
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
