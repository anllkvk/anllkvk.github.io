/**
 * DOM UI layer — menus, character/arena select, victory/defeat, settings.
 * Gameplay itself lives on the canvas (scene.js); everything here is HTML so
 * buttons stay crisp and accessible on every screen size. Previews reuse the
 * same procedural renderers as the game for a consistent look.
 */
import { CHARACTERS, ARENAS, DIFFICULTY, GAME } from './config.js';
import { drawCharacter } from './render/characters.js';
import { drawArena, drawCourt } from './render/arena.js';

export class UI {
  constructor(root, cb) {
    this.root = root;
    this.cb = cb; // { onPlay, onPickCharacter, onPickArena, onStartMatch, onSetDifficulty, onToggleSound, onSetVolume, onHome }
    this.selectedChar = CHARACTERS[3].id;
    this.selectedArena = ARENAS[0].id;
    this.difficulty = 'NORMAL';
  }

  clear() { this.root.innerHTML = ''; }

  _el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ---------- Main menu ----------
  showMenu(settings) {
    this.clear();
    const s = this._el('div', 'screen screen--menu');
    const logo = this._el('div', 'logo', `
      <span class="ball">🏀</span>
      <h1>NAKAVT</h1>
      <div class="sub">Basketball Knockout</div>
    `);
    const tag = this._el('p', 'tagline', 'Ten players. One ball each up front. Miss and the player behind you knocks you out. Be the last one standing.');
    const btns = this._el('div', 'btns');
    const play = this._el('button', 'btn btn--play', '▶ PLAY');
    play.onclick = () => this.cb.onPlay();
    const chars = this._el('button', 'btn btn--ghost', 'CHARACTERS');
    chars.onclick = () => this.showCharacterSelect({ preview: true });
    const arenas = this._el('button', 'btn btn--ghost', 'ARENAS');
    arenas.onclick = () => this.showArenaSelect({ preview: true });
    const set = this._el('button', 'btn btn--ghost btn--sm', '⚙ SETTINGS');
    set.onclick = () => this.showSettings(settings);
    btns.append(play, chars, arenas, set);
    s.append(logo, tag, btns);
    this.root.append(s);
  }

  // ---------- Character select ----------
  showCharacterSelect(opts = {}) {
    this.clear();
    const preview = opts.preview;
    const s = this._el('div', 'screen screen-scrim');
    const back = this._el('button', 'back-x', '‹');
    back.onclick = () => this.cb.onHome();
    s.append(back);
    s.append(this._el('h2', null, 'CHOOSE YOUR BALLER'));
    s.append(this._el('p', 'hint', preview ? 'Meet the roster — every stat is balanced.' : 'Pick who you play. The other 9 join as rivals.'));

    const grid = this._el('div', 'grid');
    for (const c of CHARACTERS) {
      const card = this._el('div', 'card');
      if (c.id === this.selectedChar) card.classList.add('sel');
      const cv = document.createElement('canvas');
      cv.width = 180; cv.height = 152;
      card.append(cv);
      card.append(this._el('div', 'cname', c.name));
      card.append(this._el('div', 'arch', `${c.team} · #${c.number}`));
      card.append(this._statBars(c.stats));
      card.onclick = () => {
        this.selectedChar = c.id;
        grid.querySelectorAll('.card').forEach((n) => n.classList.remove('sel'));
        card.classList.add('sel');
        this.cb.onPickCharacter?.(c.id);
      };
      grid.append(card);
      requestAnimationFrame(() => this._paintChar(cv, c));
    }
    s.append(grid);

    const btn = this._el('button', 'btn', preview ? 'BACK' : 'NEXT: PICK ARENA →');
    btn.onclick = () => preview ? this.cb.onHome() : this.showArenaSelect();
    s.append(btn);
    this.root.append(s);
  }

  /** Five tiny stat bars (ACC / REA / SPD / REB / CLU) for a character card. */
  _statBars(stats) {
    const wrap = this._el('div', 'statbars');
    const rows = [['ACC', stats.accuracy], ['REA', stats.reaction], ['SPD', stats.speed], ['REB', stats.rebound], ['CLU', stats.clutch]];
    for (const [label, v] of rows) {
      const row = this._el('div', 'statbar');
      row.append(this._el('span', 'sbl', label));
      const track = this._el('span', 'sbt');
      const fill = this._el('i');
      fill.style.width = `${Math.round(v * 100)}%`;
      track.append(fill); row.append(track);
      wrap.append(row);
    }
    return wrap;
  }

  _paintChar(cv, c) {
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const bg = ctx.createLinearGradient(0, 0, 0, cv.height);
    bg.addColorStop(0, '#1b2444'); bg.addColorStop(1, '#0e1428');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cv.width, cv.height);
    drawCharacter(ctx, c, cv.width / 2, cv.height * 0.86, 1.7, 'idle', performance.now() / 400);
  }

  // ---------- Arena select ----------
  showArenaSelect(opts = {}) {
    this.clear();
    const preview = opts.preview;
    const s = this._el('div', 'screen screen-scrim');
    const back = this._el('button', 'back-x', '‹');
    back.onclick = () => preview ? this.cb.onHome() : this.showCharacterSelect();
    s.append(back);
    s.append(this._el('h2', null, 'CHOOSE ARENA'));
    s.append(this._el('p', 'hint', 'Two original courts, two atmospheres.'));

    const wrap = this._el('div', 'arenas');
    for (const a of ARENAS) {
      const card = this._el('div', 'arena-card');
      if (a.id === this.selectedArena) card.classList.add('sel');
      const cv = document.createElement('canvas');
      cv.width = 380; cv.height = 220;
      card.append(cv);
      const meta = this._el('div', 'arena-meta', `<div class="an">${a.name}</div><div class="at">${a.tagline}</div>`);
      card.append(meta);
      card.onclick = () => {
        this.selectedArena = a.id;
        wrap.querySelectorAll('.arena-card').forEach((n) => n.classList.remove('sel'));
        card.classList.add('sel');
        this.cb.onPickArena?.(a.id);
      };
      wrap.append(card);
      requestAnimationFrame(() => this._paintArena(cv, a));
    }
    s.append(wrap);

    // Difficulty
    s.append(this._el('p', 'hint', 'DIFFICULTY'));
    const seg = this._el('div', 'seg');
    for (const key of ['EASY', 'NORMAL', 'HARD']) {
      const b = this._el('button', this.difficulty === key ? 'on' : '', DIFFICULTY[key].label);
      b.onclick = () => {
        this.difficulty = key;
        seg.querySelectorAll('button').forEach((n) => n.classList.remove('on'));
        b.classList.add('on');
        this.cb.onSetDifficulty?.(key);
      };
      seg.append(b);
    }
    s.append(seg);

    if (preview) {
      const btn = this._el('button', 'btn', 'BACK');
      btn.onclick = () => this.cb.onHome();
      s.append(btn);
    } else {
      const btn = this._el('button', 'btn btn--play', '🏀 TIP OFF');
      btn.onclick = () => this.cb.onStartMatch(this.selectedChar, this.selectedArena, this.difficulty);
      s.append(btn);
    }
    this.root.append(s);
  }

  _paintArena(cv, a) {
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    drawArena(ctx, W, H, a, 0, { scoreboard: { top: a.name.toUpperCase(), bottom: 'NAKAVT' } });
    const floorY = H * 0.5;
    drawCourt(ctx, {
      W, H, floorY, hoopX: W / 2, hoopY: floorY + (H - floorY) * 0.2,
      ftY: floorY + (H - floorY) * 0.7, lineX: W / 2,
    }, a, 0);
  }

  // ---------- Victory / defeat ----------
  showResult(won, stats, ctxLabel) {
    this.clear();
    const s = this._el('div', 'screen screen-scrim');
    s.append(this._el('div', 'logo', '<span class="ball">🏀</span>'));
    s.append(this._el('div', `result-title ${won ? 'win' : 'lose'}`, won ? 'NAKAVT CHAMPION!' : 'KNOCKED OUT'));
    const place = won ? '🏆 1st of 10' : `#${stats.placement} of ${GAME.totalPlayers}`;
    s.append(this._el('p', 'hint', won ? 'Last one standing. The crowd goes wild.' : `You finished ${place}. Run it back?`));

    const panel = this._el('div', 'stats-panel');
    const rows = [
      ['Placement', won ? '🏆 1st' : `#${stats.placement}`],
      ['Shots', stats.shots],
      ['Perfect', stats.perfect],
      ['Knockouts', stats.knockouts],
      ['Accuracy', `${stats.accuracy}%`],
      ['Time', `${(stats.timeMs / 1000).toFixed(1)}s`],
    ];
    for (const [k, v] of rows) panel.append(this._el('div', 's', `<span>${k}</span><b>${v}</b>`));
    s.append(panel);

    const row1 = this._el('div', 'row');
    const again = this._el('button', 'btn', '▶ PLAY AGAIN');
    again.onclick = () => this.cb.onStartMatch(this.selectedChar, this.selectedArena, this.difficulty);
    row1.append(again);
    const row2 = this._el('div', 'row');
    const chars = this._el('button', 'btn btn--ghost btn--sm', 'CHARACTERS');
    chars.onclick = () => this.showCharacterSelect();
    const arenas = this._el('button', 'btn btn--ghost btn--sm', 'ARENAS');
    arenas.onclick = () => this.showArenaSelect();
    const home = this._el('button', 'btn btn--ghost btn--sm', 'HOME');
    home.onclick = () => this.cb.onHome();
    row2.append(chars, arenas, home);
    s.append(row1, row2);
    this.root.append(s);
    if (won) this._confetti();
  }

  _confetti() {
    const cv = document.createElement('canvas');
    cv.id = 'confetti';
    const app = document.getElementById('app');
    cv.width = app.clientWidth; cv.height = app.clientHeight;
    app.append(cv);
    const ctx = cv.getContext('2d');
    const colors = ['#ffd23f', '#ff7a1a', '#2ec16b', '#4dd0ff', '#ff3b4e', '#9b7bff'];
    const bits = Array.from({ length: 140 }, () => ({
      x: Math.random() * cv.width, y: -Math.random() * cv.height,
      vy: 2 + Math.random() * 4, vx: (Math.random() - 0.5) * 2,
      r: 3 + Math.random() * 5, c: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    }));
    let frames = 0;
    const tick = () => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const b of bits) {
        b.y += b.vy; b.x += b.vx; b.rot += b.vr;
        if (b.y > cv.height) { b.y = -10; b.x = Math.random() * cv.width; }
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.fillStyle = b.c; ctx.fillRect(-b.r / 2, -b.r / 2, b.r, b.r * 1.6);
        ctx.restore();
      }
      frames++;
      if (frames < 300 && document.getElementById('confetti')) requestAnimationFrame(tick);
      else cv.remove();
    };
    tick();
  }

  // ---------- Settings ----------
  showSettings(settings) {
    this.clear();
    const s = this._el('div', 'screen screen-scrim');
    const back = this._el('button', 'back-x', '‹');
    back.onclick = () => this.cb.onHome();
    s.append(back);
    s.append(this._el('h2', null, '⚙ SETTINGS'));

    const sound = this._el('div', 'settings-item', '<span>Sound</span>');
    const toggle = this._el('button', `toggle ${settings.muted ? '' : 'on'}`);
    toggle.onclick = () => {
      const nowMuted = toggle.classList.toggle('on') === false;
      this.cb.onToggleSound?.(nowMuted);
    };
    sound.append(toggle);

    const vol = this._el('div', 'settings-item', '<span>Volume</span>');
    const range = document.createElement('input');
    range.type = 'range'; range.min = '0'; range.max = '100';
    range.value = String(Math.round(settings.volume * 100));
    range.oninput = () => this.cb.onSetVolume?.(Number(range.value) / 100);
    vol.append(range);

    const vib = this._el('div', 'settings-item', '<span>Vibration</span>');
    const vibToggle = this._el('button', `toggle ${settings.haptics === false ? '' : 'on'}`);
    vibToggle.onclick = () => this.cb.onToggleHaptics?.(vibToggle.classList.toggle('on'));
    vib.append(vibToggle);

    const fx = this._el('div', 'settings-item', '<span>Reduced effects</span>');
    const fxToggle = this._el('button', `toggle ${settings.reduceFx ? 'on' : ''}`);
    fxToggle.onclick = () => this.cb.onToggleReduceFx?.(fxToggle.classList.toggle('on'));
    fx.append(fxToggle);

    const info = this._el('p', 'hint', `NAKAVT v1.0 · Move (arrows/joystick), Space/SHOOT to release. Target ${GAME.targetFps} FPS. Installable — add to home screen.`);
    info.style.marginTop = '18px';

    const done = this._el('button', 'btn', 'DONE');
    done.onclick = () => this.cb.onHome();
    done.style.marginTop = '18px';

    s.append(sound, vol, vib, fx, info, done);
    this.root.append(s);
  }

  // Brief elimination toast during play.
  toast(text) {
    const t = this._el('div', null, text);
    Object.assign(t.style, {
      position: 'absolute', top: '30%', left: '50%', transform: 'translate(-50%,0)',
      background: 'rgba(255,59,78,0.92)', color: '#fff', fontWeight: '800',
      padding: '8px 16px', borderRadius: '10px', zIndex: 8, fontSize: '14px',
      pointerEvents: 'none', animation: 'fade 0.3s ease',
    });
    this.root.append(t);
    setTimeout(() => t.remove(), 1100);
  }
}
