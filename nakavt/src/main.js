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
analytics.setDebug(new URLSearchParams(location.search).has('debug'));

const game = {
  state: STATE.MENU,
  scene: null,
  match: null,
  arena: ARENAS[0],
  lastTime: 0,
};

const ui = new UI(uiRoot, {
  onPlay: () => { sfx.ensure(); ui.showCharacterSelect(); },
  onHome: () => goMenu(),
  onPickCharacter: () => sfx.click(),
  onPickArena: () => sfx.click(),
  onSetDifficulty: (k) => { settings.difficulty = k; saveSettings(); sfx.click(); },
  onStartMatch: (charId, arenaId, diff) => startMatch(charId, arenaId, diff),
  onToggleSound: (muted) => { settings.muted = muted; sfx.setMuted(muted); saveSettings(); updateSoundIcon(); },
  onSetVolume: (v) => { settings.volume = v; sfx.setVolume(v); saveSettings(); },
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

// ---- input: tap to shoot ----
function onTap(e) {
  if (game.state === STATE.PLAYING || game.state === STATE.FINAL_DUEL || game.state === STATE.COUNTDOWN) {
    e.preventDefault();
    scene.handleTap();
  }
}
canvas.addEventListener('pointerdown', onTap, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); scene.handleTap(); }
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
  scene.start(game.match, game.arena, CHARACTERS, { tutorialDone: settings.tutorialDone });
  game.state = STATE.COUNTDOWN;
  syncStateFromScene();
}

function endMatch(won, stats) {
  if (!settings.tutorialDone) { settings.tutorialDone = true; saveSettings(); }
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
  document.getElementById('hud-shots').textContent = h.shots;
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

// ---- main loop ----
function loop(now) {
  const dt = Math.min(0.05, (now - game.lastTime) / 1000 || 0);
  game.lastTime = now;

  const playing = game.state === STATE.COUNTDOWN || game.state === STATE.PLAYING || game.state === STATE.FINAL_DUEL;
  if (playing) {
    scene.update(dt);
    scene.render();
    syncStateFromScene();
  } else if (game.state === STATE.VICTORY || game.state === STATE.GAME_OVER) {
    // freeze on the final frame under the result overlay
  } else {
    renderAmbience(dt);
  }
  requestAnimationFrame(loop);
}

// ---- settings persistence ----
function loadSettings() {
  const def = { muted: false, volume: 0.7, difficulty: 'NORMAL', tutorialDone: false };
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
window.NAKAVT = { game, scene, sfx, analytics, version: '1.0.0', name: GAME.name };
