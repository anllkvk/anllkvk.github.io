/**
 * NAKAVT bootstrap — owns the canvas, the requestAnimationFrame loop, the
 * top-level state machine and wires together UI (menus), Scene (gameplay),
 * Sfx (audio) and input. Kept thin: rules live in core/, visuals in render/,
 * gameplay in scene.js.
 */
import { STATE, STORAGE_KEY, CHARACTERS, ARENAS, DIFFICULTY, GAME } from './config.js';
import { makeRng } from './core/rng.js';
import { KnockoutMatch, buildRoster } from './core/knockout.js';
import { analytics } from './core/events.js';
import { Sfx } from './audio/sfx.js';
import { haptics } from './audio/haptics.js';
import { Scene } from './scene.js';
import { UI } from './ui.js';
import { drawArena, drawCourt } from './render/arena.js';
import { drawCharacter } from './render/characters.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const hud = document.getElementById('hud');
const uiRoot = document.getElementById('ui');

const sfx = new Sfx();
let dpr = 1;

// ---- persisted settings ----
const settings = loadSettings();
sfx.setMuted(settings.muted);
sfx.setVolume(settings.volume);
haptics.setEnabled(settings.haptics !== false);
analytics.setDebug(new URLSearchParams(location.search).has('debug'));

const game = {
  state: STATE.MENU,
  scene: null,
  match: null,
  arena: ARENAS[0],
  lastTime: 0,
};

// Adaptive quality: sample FPS and drop effects on sustained low frame rates.
// `locked` = user forced Reduced-effects, so auto never overrides their choice
// (initialized from persisted settings so it survives reloads).
const autoQuality = { acc: 0, frames: 0, quality: settings.reduceFx ? 0.4 : 1, locked: !!settings.reduceFx };

const ui = new UI(uiRoot, {
  onPlay: () => { sfx.ensure(); ui.showCharacterSelect(); },
  onHome: () => goMenu(),
  onPickCharacter: () => sfx.click(),
  onPickArena: () => sfx.click(),
  onSetDifficulty: (k) => { settings.difficulty = k; saveSettings(); sfx.click(); },
  onStartMatch: (charId, arenaId, diff) => startMatch(charId, arenaId, diff),
  onToggleSound: (muted) => { settings.muted = muted; sfx.setMuted(muted); saveSettings(); updateSoundIcon(); },
  onSetVolume: (v) => { settings.volume = v; sfx.setVolume(v); saveSettings(); },
  onToggleHaptics: (on) => { settings.haptics = on; haptics.setEnabled(on); saveSettings(); if (on) haptics.tap(); },
  onToggleReduceFx: (on) => { settings.reduceFx = on; saveSettings(); scene.setQuality(on ? 0.4 : 1); autoQuality.locked = on; },
});

const scene = new Scene(ctx, canvas, sfx, {
  onHud: (h) => updateHud(h),
  onElimination: (info) => { /* toast kept subtle; banner is on canvas */ },
  onFinalDuel: () => { hud.classList.remove('hidden'); },
  onVictory: (stats) => endMatch(true, stats),
  onDefeat: (stats) => endMatch(false, stats),
});
game.scene = scene;

// ---- canvas sizing (DPR-aware for crisp 60fps rendering) ----
function resize() {
  const app = document.getElementById('app');
  const w = app.clientWidth;
  const h = app.clientHeight;
  dpr = Math.min(2, window.devicePixelRatio || 1); // cap DPR for mobile perf
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scene.dpr = dpr;
  scene.resize?.(dpr);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));

// ---- input: left-half virtual joystick to MOVE, right-half hold to SHOOT ----
const input = {
  moveId: null, moveBase: { x: 0, y: 0 }, moveVec: { x: 0, y: 0 },
  shootId: null, keys: new Set(),
};
const JOY_R = 56; // joystick radius in CSS px

function inPlay() {
  return game.state === STATE.PLAYING || game.state === STATE.FINAL_DUEL || game.state === STATE.COUNTDOWN;
}
function applyMove() {
  // joystick takes priority; otherwise keyboard
  if (input.moveId !== null) { scene.setMove(input.moveVec.x, input.moveVec.y); return; }
  let x = 0, y = 0;
  if (input.keys.has('a') || input.keys.has('ArrowLeft')) x -= 1;
  if (input.keys.has('d') || input.keys.has('ArrowRight')) x += 1;
  if (input.keys.has('w') || input.keys.has('ArrowUp')) y -= 1;
  if (input.keys.has('s') || input.keys.has('ArrowDown')) y += 1;
  const m = Math.hypot(x, y) || 1;
  scene.setMove(x / m, y / m);
}

canvas.addEventListener('pointerdown', (e) => {
  if (!inPlay()) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  if (x < rect.width * 0.5 && input.moveId === null) {
    input.moveId = e.pointerId; input.moveBase = { x, y }; input.moveVec = { x: 0, y: 0 };
  } else if (input.shootId === null) {
    input.shootId = e.pointerId; scene.shootDown();
  }
}, { passive: false });

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== input.moveId) return;
  const rect = canvas.getBoundingClientRect();
  let dx = (e.clientX - rect.left) - input.moveBase.x;
  let dy = (e.clientY - rect.top) - input.moveBase.y;
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx = dx / d * JOY_R; dy = dy / d * JOY_R; }
  input.moveVec = { x: dx / JOY_R, y: dy / JOY_R };
  applyMove();
}, { passive: false });

function endPointer(e) {
  if (e.pointerId === input.moveId) { input.moveId = null; input.moveVec = { x: 0, y: 0 }; applyMove(); }
  if (e.pointerId === input.shootId) { input.shootId = null; scene.shootUp(); }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('lostpointercapture', endPointer);

window.addEventListener('keydown', (e) => {
  if (['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    input.keys.add(e.key); applyMove(); e.preventDefault();
  } else if (e.code === 'Space' && !e.repeat) { scene.shootDown(); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  if (input.keys.has(e.key)) { input.keys.delete(e.key); applyMove(); }
  if (e.code === 'Space') { scene.shootUp(); }
});

document.getElementById('hud-sound').addEventListener('click', () => {
  settings.muted = !settings.muted;
  sfx.setMuted(settings.muted);
  saveSettings();
  updateSoundIcon();
});

// ---- state transitions ----
function goMenu() {
  game.state = STATE.MENU;
  hud.classList.add('hidden');
  ui.showMenu(settings);
  const c = document.getElementById('confetti'); if (c) c.remove();
}

function startMatch(charId, arenaId, diffKey) {
  sfx.ensure();
  ui.clear();
  hud.classList.remove('hidden');
  game.arena = ARENAS.find((a) => a.id === arenaId) || ARENAS[0];
  const difficulty = DIFFICULTY[diffKey] || DIFFICULTY.NORMAL;
  const rng = makeRng((Date.now() ^ (Math.random() * 1e9)) >>> 0);
  const roster = buildRoster(CHARACTERS, charId, rng);
  game.match = new KnockoutMatch(roster, { difficulty, rng });
  scene.dpr = dpr;
  scene.tutorialDone = settings.tutorialDone;
  scene.setQuality(settings.reduceFx ? 0.4 : autoQuality.quality);
  scene.start(game.match, game.arena, CHARACTERS, { tutorialDone: settings.tutorialDone });
  game.state = STATE.COUNTDOWN;
  syncStateFromScene();
}

function endMatch(won, stats) {
  if (!settings.tutorialDone) { settings.tutorialDone = true; }
  // high-score persistence
  const prevBest = settings.best || 0;
  stats.isNewBest = (stats.score || 0) > prevBest;
  if (stats.isNewBest) settings.best = stats.score;
  stats.best = settings.best || 0;
  saveSettings();
  const delay = won ? 1300 : 1000;
  setTimeout(() => {
    hud.classList.add('hidden');
    ui.showResult(won, stats, game.arena);
    game.state = won ? STATE.VICTORY : STATE.GAME_OVER;
  }, delay);
}

function syncStateFromScene() {
  // Mirror the scene's internal state onto the top-level machine so input routing works.
  const map = {
    [STATE.COUNTDOWN]: STATE.COUNTDOWN,
    [STATE.PLAYING]: STATE.PLAYING,
    [STATE.FINAL_DUEL]: STATE.FINAL_DUEL,
    [STATE.VICTORY]: STATE.VICTORY,
    [STATE.GAME_OVER]: STATE.GAME_OVER,
  };
  game.state = map[scene.state] ?? game.state;
}

// ---- HUD ----
function updateHud(h) {
  document.getElementById('hud-round').textContent = h.round;
  document.getElementById('hud-remaining').textContent = h.remaining;
  document.getElementById('hud-score').textContent = h.score;
  const role = document.getElementById('hud-role');
  role.textContent = h.roleLabel;
  role.style.color = h.finalDuel ? '#ff3b4e' : '#ffd23f';
}
function updateSoundIcon() {
  document.getElementById('hud-sound').textContent = settings.muted ? '🔇' : '🔊';
}

// ---- menu ambience: a gentle animated court behind the menus ----
let ambT = 0;
const ambChars = [CHARACTERS[4], CHARACTERS[1], CHARACTERS[7]];
function renderAmbience(dt) {
  ambT += dt;
  const W = canvas.width / dpr, H = canvas.height / dpr;
  ctx.clearRect(0, 0, W, H);
  const a = game.arena;
  drawArena(ctx, W, H, a, ambT, { scoreboard: { top: 'NAKAVT', bottom: 'TAP PLAY' } });
  const floorY = H * 0.46;
  const layout = { W, H, floorY, hoopX: W / 2, hoopY: floorY + (H - floorY) * 0.16, ftY: floorY + (H - floorY) * 0.72, lineX: W / 2 };
  drawCourt(ctx, layout, a, ambT);
  ambChars.forEach((c, i) => {
    const x = W * (0.28 + i * 0.22);
    drawCharacter(ctx, c, x, layout.ftY + 6, 0.8, i === 1 ? 'shoot' : 'idle', i === 1 ? (Math.sin(ambT) * 0.5 + 0.5) : ambT + i);
  });
}

// ---- on-screen touch controls (drawn over the scene) ----
function drawControls() {
  const W = canvas.width / dpr, H = canvas.height / dpr;
  // Joystick (left): base at rest bottom-left, or where the thumb is when active
  const rest = { x: W * 0.2, y: H * 0.8 };
  const base = input.moveId !== null ? input.moveBase : rest;
  ctx.save();
  ctx.globalAlpha = input.moveId !== null ? 0.85 : 0.35;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(base.x, base.y, JOY_R, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.arc(base.x, base.y, JOY_R, 0, Math.PI * 2); ctx.fill();
  const kx = base.x + input.moveVec.x * JOY_R, ky = base.y + input.moveVec.y * JOY_R;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(kx, ky, JOY_R * 0.42, 0, Math.PI * 2); ctx.fill();
  if (input.moveId === null) { ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('MOVE', base.x, base.y + JOY_R + 16); }
  ctx.restore();
  // Shoot ring (right)
  const sc = { x: W * 0.82, y: H * 0.8, r: 46 };
  ctx.save();
  ctx.globalAlpha = input.shootId !== null ? 0.9 : 0.4;
  ctx.fillStyle = input.shootId !== null ? 'rgba(255,122,26,0.5)' : 'rgba(255,122,26,0.25)';
  ctx.beginPath(); ctx.arc(sc.x, sc.y, sc.r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ff7a1a'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('SHOOT', sc.x, sc.y);
  ctx.restore();
  // Keyboard hint (desktop)
  ctx.save();
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#fff'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('◄ ▲ ▼ ►  MOVE     ·     SPACE  SHOOT', W / 2, H - 6);
  ctx.restore();
}

// ---- main loop ----
function loop(now) {
  const dt = Math.min(0.05, (now - game.lastTime) / 1000 || 0);
  game.lastTime = now;

  try {
    const playing = game.state === STATE.COUNTDOWN || game.state === STATE.PLAYING || game.state === STATE.FINAL_DUEL;
    if (playing) {
      // adaptive quality: if we sustain <45 FPS for ~2s, drop effects once
      if (!autoQuality.locked && dt > 0) {
        autoQuality.acc += dt; autoQuality.frames++;
        if (autoQuality.acc >= 2) {
          const fps = autoQuality.frames / autoQuality.acc;
          if (fps < 45 && autoQuality.quality > 0.5) { autoQuality.quality = 0.5; scene.setQuality(0.5); }
          autoQuality.acc = 0; autoQuality.frames = 0;
        }
      }
      scene.update(dt);
      scene.render();
      drawControls();
      syncStateFromScene();
    } else if (game.state === STATE.VICTORY || game.state === STATE.GAME_OVER) {
      // freeze on the final frame under the result overlay
    } else {
      renderAmbience(dt);
    }
  } catch (err) {
    console.error('[nakavt] frame error', err); // never let one bad frame stop the loop
  }
  requestAnimationFrame(loop);
}

// ---- settings persistence ----
function loadSettings() {
  const def = { muted: false, volume: 0.7, difficulty: 'NORMAL', tutorialDone: false, haptics: true, reduceFx: false, best: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...def, ...JSON.parse(raw) } : def;
  } catch { return def; }
}
function saveSettings() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* private mode */ }
}

// ---- boot ----
resize();
updateSoundIcon();
ui.difficulty = settings.difficulty;
goMenu();
requestAnimationFrame(loop);

// expose a tiny debug handle
window.NAKAVT = { game, scene, sfx, analytics, version: '1.3.0', name: GAME.name };

// PWA: register the service worker for install + offline play.
// Skipped under automation (Playwright sets navigator.webdriver) so e2e stays deterministic.
if ('serviceWorker' in navigator && !navigator.webdriver) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is best-effort */ });
  });
}
