/** Dev-only: render every character pose to a sprite sheet PNG for visual QA. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const pwPath = execSync('npm root -g').toString().trim() + '/playwright';
const { chromium } = require(pwPath);
const ROOT = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end('nf'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newContext({ viewport: { width: 900, height: 520 }, deviceScaleFactor: 2 }).then((c) => c.newPage());
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
try {
  await page.goto(base + 'index.html', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const { drawCharacter } = await import('./src/render/characters.js');
    const { CHARACTERS } = await import('./src/config.js');
    const cv = document.createElement('canvas'); cv.width = 1800; cv.height = 1040;
    cv.id = 'sheet';
    cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:900px;height:520px';
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d'); ctx.scale(2, 2);
    ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, 900, 520);
    const poses = ['idle', 'run', 'aim', 'shoot', 'celebrate', 'knockout'];
    ctx.fillStyle = '#8892a6'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
    poses.forEach((pose, i) => {
      const x = 80 + i * 140;
      // two chars per pose (one facing each way), animate a mid-frame
      [CHARACTERS[0], CHARACTERS[2]].forEach((ch, r) => {
        const y = 200 + r * 250;
        const phase = pose === 'shoot' ? 0.6 : pose === 'knockout' ? 0.5 : 1.3;
        drawCharacter(ctx, ch, x, y, 1.4, pose, phase, { facing: r === 0 ? 1 : -1 });
      });
      ctx.fillStyle = '#8892a6'; ctx.fillText(pose, x, 30);
    });
    window.__done = true;
  });
  await page.waitForFunction(() => window.__done, { timeout: 5000 });
  await page.locator('#sheet').screenshot({ path: join(ROOT, 'test/posesheet.png') });
  console.log(errs.length ? '❌ errors: ' + errs.join('\n') : '✅ pose sheet rendered, no errors');
  if (errs.length) process.exitCode = 1;
} catch (e) { console.error('exception', e.message); process.exitCode = 1; }
finally { await browser.close(); server.close(); }
