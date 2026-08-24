/**
 * End-to-end browser smoke test: serves the game, loads it in headless Chromium,
 * clicks through Play -> Character -> Arena -> Tip Off, then taps to shoot until
 * the match resolves. Verifies no console errors, the FSM advances, players get
 * eliminated, and the game reaches a Victory or Defeat screen. Captures shots.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const pwPath = execSync('npm root -g').toString().trim() + '/playwright';
const { chromium } = require(pwPath);

const ROOT = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});

const fail = (m) => { console.error('❌ ' + m); process.exitCode = 1; };
const ok = (m) => console.log('✅ ' + m);

await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}/`;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.NAKAVT && window.NAKAVT.version, { timeout: 5000 });
  ok('game booted (window.NAKAVT present)');

  // Menu -> PLAY
  await page.click('.screen--menu .btn--play');
  await page.waitForSelector('h2:has-text("CHOOSE YOUR BALLER")', { timeout: 3000 });
  ok('character select shown');
  await page.screenshot({ path: join(ROOT, 'test/shot-1-charselect.png') });

  // pick a character (2nd card) then NEXT
  await page.locator('.card').nth(1).click();
  await page.locator('.screen >> .btn', { hasText: 'NEXT' }).click();
  await page.waitForSelector('h2:has-text("CHOOSE ARENA")', { timeout: 3000 });
  ok('arena select shown');

  // pick arena 2, HARD, then tip off
  await page.locator('.arena-card').nth(1).click();
  await page.locator('.seg button', { hasText: 'Hard' }).click();
  await page.screenshot({ path: join(ROOT, 'test/shot-2-arenaselect.png') });
  await page.click('.btn--play');

  // wait for countdown -> playing
  await page.waitForFunction(() => ['PLAYING', 'FINAL_DUEL'].includes(window.NAKAVT.scene.state), { timeout: 6000 });
  ok('match started, countdown cleared');
  const startAlive = await page.evaluate(() => window.NAKAVT.game.match.aliveCount);
  if (startAlive !== 10) fail(`expected 10 players, got ${startAlive}`); else ok('10 players spawned');

  // Play: tap repeatedly. Auto-tap into the perfect zone when the human is aiming
  // to exercise makes; otherwise just tap to keep rebounds moving.
  let resolved = null;
  let sawElimination = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const snap = await page.evaluate(() => {
      const s = window.NAKAVT.scene;
      const d = s.duel;
      let humanAim = false, meterPos = null;
      if (d && d.info.humanRole) {
        const h = d.info.humanRole === 'front' ? d.front : d.chaser;
        humanAim = h.state === 'aim';
        meterPos = h.meterPos;
      }
      return {
        state: s.state,
        alive: window.NAKAVT.game.match.aliveCount,
        humanAim, meterPos,
        eliminated: window.NAKAVT.game.match.eliminated.length,
      };
    });
    if (snap.eliminated > 0) sawElimination = true;
    if (snap.state === 'VICTORY') { resolved = 'VICTORY'; break; }
    if (snap.state === 'GAME_OVER') { resolved = 'GAME_OVER'; break; }
    // Tap when human is aiming near the centre for a good release; else tap to grab rebounds.
    if (snap.humanAim) {
      // Release inside the GOOD/PERFECT band (accounts for a little sweep lag).
      if (snap.meterPos != null && Math.abs(snap.meterPos - 0.5) < 0.11) {
        await page.mouse.click(195, 400);
      }
    } else {
      // tap to secure rebounds quickly
      await page.mouse.click(195, 400);
    }
    await page.waitForTimeout(15);
  }

  if (!resolved) fail('match did not resolve within 60s');
  else ok(`match resolved: ${resolved}`);
  if (!sawElimination) fail('no eliminations occurred'); else ok('eliminations occurred during play');

  // Result screen present (revealed after a short celebration delay)
  await page.waitForSelector('.result-title', { timeout: 4000 });
  const resultText = await page.evaluate(() => document.querySelector('.result-title')?.textContent || '');
  const expected = resolved === 'VICTORY' ? 'NAKAVT CHAMPION!' : 'KNOCKED OUT';
  if (resultText.trim() !== expected) fail(`result screen text "${resultText.trim()}" != "${expected}"`);
  else ok(`result screen: "${resultText.trim()}"`);
  await page.waitForSelector('.stats-panel', { timeout: 2000 });
  ok('stats panel rendered');
  await page.screenshot({ path: join(ROOT, 'test/shot-3-result.png') });

  // Play Again works
  await page.locator('.btn', { hasText: 'PLAY AGAIN' }).click();
  await page.waitForFunction(() => ['COUNTDOWN', 'PLAYING'].includes(window.NAKAVT.scene.state), { timeout: 6000 });
  ok('play again restarts a match');

  if (errors.length) fail(`console/page errors:\n  ${errors.slice(0, 10).join('\n  ')}`);
  else ok('no console or page errors');
} catch (e) {
  fail('exception: ' + e.message);
} finally {
  await browser.close();
  server.close();
  console.log(process.exitCode ? '\n=== BROWSER TEST FAILED ===' : '\n=== BROWSER TEST PASSED ===');
}
