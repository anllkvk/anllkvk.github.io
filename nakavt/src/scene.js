/**
 * Gameplay scene — the real-time layer on top of the pure KnockoutMatch.
 *
 * Both the FRONT and the CHASER of the current pairing run their own little
 * timeline in parallel; the first to SINK a basket wins the duel. When the human
 * is one of them, their side is driven by the tap-timing meter; the other side
 * (and both sides of AI-only pairings) runs on stat-based timers. Whoever the
 * scene decides won is fed back to match.resolve(), which owns the rules.
 */
import { STATE, SHOT, METER, STREAK } from './config.js';
import { classifyRelease, resolvePlayerShot, resolveAiShot } from './core/shot.js';
import { analytics } from './core/events.js';
import { EVENTS } from './config.js';
import { drawArena, drawCourt, drawBall } from './render/arena.js';
import { drawCharacter } from './render/characters.js';

const BALL_FLIGHT = 0.42; // seconds, human pace
const AUTO_SCALE = 2.3; // AI-only duels run much faster (keeps "watching" short)
const REBOUND_TAP_MAX = 0.7; // human auto-grab after this
const INTRO_TIME = 0.32;
const RESULT_HOLD = 0.45;
const KO_TIME = 0.7;

export class Scene {
  constructor(ctx, canvas, sfx, cb) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.sfx = sfx;
    this.cb = cb; // { onHud, onElimination, onFinalDuel, onVictory, onDefeat, onFlash }
    this.match = null;
    this.charsById = new Map();
    this.arena = null;
    this.t = 0;
    this.finalDuel = false;
    this.flash = null; // {text, color, ttl, big}
    this.duel = null;
    this.state = STATE.PLAYING;
    this.stats = null;
    this.streak = 0;
    this.tutorialDone = false;
    this.tutorial = false;
  }

  start(match, arena, characters, opts = {}) {
    this.match = match;
    this.arena = arena;
    this.charsById = new Map(characters.map((c) => [c.id, c]));
    this.t = 0;
    this.finalDuel = false;
    this.state = STATE.COUNTDOWN;
    this.stats = { shots: 0, perfect: 0, knockouts: 0, made: 0, start: performance.now(), placement: null };
    this.streak = 0;
    this.tutorial = !opts.tutorialDone;
    this.countdown = 3.0;
    this.flash = { text: '3', color: '#fff', ttl: 1, big: true };
    analytics.track(EVENTS.GAME_START, { arena: arena.id, difficulty: match.difficulty.key });
    this._layout();
    this.sfx.startCrowd();
  }

  _layout() {
    const W = this.canvas.width / (this.dpr || 1);
    const H = this.canvas.height / (this.dpr || 1);
    const floorY = H * 0.46;
    const hoopX = W * 0.5;
    const hoopY = floorY + (H - floorY) * 0.16;
    const ftY = floorY + (H - floorY) * 0.72;
    this.layout = {
      W, H, floorY, hoopX, hoopY, ftY, lineX: W * 0.5,
      frontSpot: { x: W * 0.5, y: ftY },
      chaserSpot: { x: W * 0.5 - Math.min(90, W * 0.22), y: ftY + Math.min(34, H * 0.03) },
      meter: { x: W * 0.12, y: H * 0.9, w: W * 0.76, h: 22 },
    };
  }

  resize(dpr) { this.dpr = dpr; this._layout(); }

  // ---- duel lifecycle -------------------------------------------------------

  _beginDuel() {
    const d = this.match.duel();
    if (!d) return;
    const timeScale = d.humanInvolved ? 1 : AUTO_SCALE;
    this.duel = {
      info: d,
      timeScale,
      phase: 'intro',
      timer: INTRO_TIME,
      front: this._makeShooter(d.front, 'front', d.humanRole === 'front'),
      chaser: this._makeShooter(d.chaser, 'chaser', d.humanRole === 'chaser'),
      winner: null,
    };
    // Chaser gets the ball a beat later.
    this.duel.chaser.timer += 0.28;
    if (d.humanInvolved && this.tutorial && !this.tutorialDone) {
      this.setFlash('TAP TO SHOOT', '#ffd23f', 2.2, false);
    }
  }

  _makeShooter(player, role, isHuman) {
    return {
      id: player.id, player, role, isHuman,
      state: 'wait', // wait -> aim -> ball -> made/miss -> rebound -> aim ...
      timer: 0.15,
      meterPos: 0, meterDir: 1,
      ball: null, attempts: 0, lastQuality: null,
    };
  }

  _shooterSpot(sh) {
    return sh.role === 'front' ? this.layout.frontSpot : this.layout.chaserSpot;
  }

  /** Launch a ball from a shooter toward the hoop with a made/miss outcome. */
  _launch(sh, made, quality) {
    const spot = this._shooterSpot(sh);
    const from = { x: spot.x, y: spot.y - 44 };
    const to = made
      ? { x: this.layout.hoopX, y: this.layout.hoopY }
      : { x: this.layout.hoopX + (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 14), y: this.layout.hoopY - 6 };
    sh.ball = { from, to, made, quality, t: 0, dur: BALL_FLIGHT, rot: 0, phase: 'flight', carom: null };
    sh.state = 'ball';
    this.stats && sh.isHuman && (this.stats.shots++);
    analytics.track(EVENTS.SHOT_ATTEMPT, { by: sh.id, quality, made });
    if (quality === SHOT.PERFECT) analytics.track(EVENTS.PERFECT_SHOT, { by: sh.id });
    this.sfx.bounce();
  }

  _humanRelease(sh) {
    const pos = sh.meterPos;
    const pressure = this._pressure(sh);
    const ctx = { clutch: sh.player.stats.clutch, pressure, fatigue: Math.min(0.4, sh.attempts * 0.05) };
    const res = resolvePlayerShot(pos, ctx, this.match.rng);
    sh.attempts++;
    sh.lastQuality = res.quality;
    if (res.quality === SHOT.PERFECT && res.made) {
      this.streak++;
      if (this.streak === STREAK.hot) this.setFlash('🔥 HOT!', '#ff8c1a', 1.2, true);
      else if (this.streak >= STREAK.onFire) this.setFlash('🔥 ON FIRE!', '#ff3b3b', 1.2, true);
      this.stats.perfect++;
    } else if (!res.made) {
      this.streak = 0;
    } else {
      this.stats.perfect += res.quality === SHOT.PERFECT ? 1 : 0;
    }
    if (res.made) { this.stats.made++; this.sfx.perfect(); }
    this._launch(sh, res.made, res.quality);
  }

  _aiTryShoot(sh) {
    const pressure = this._pressure(sh);
    const accEff = this.match.aiAccuracy(sh.player, pressure);
    const res = resolveAiShot(accEff, { clutch: sh.player.stats.clutch, pressure }, this.match.rng);
    sh.attempts++;
    sh.lastQuality = res.quality;
    this._launch(sh, res.made, res.quality);
  }

  /** Pressure rises for a shooter as the OTHER shooter racks up attempts. */
  _pressure(sh) {
    if (!this.duel) return 0;
    const other = sh.role === 'front' ? this.duel.chaser : this.duel.front;
    return Math.min(0.6, other.attempts * 0.09);
  }

  // ---- update ---------------------------------------------------------------

  update(dt) {
    this.t += dt;
    if (this.flash) { this.flash.ttl -= dt; if (this.flash.ttl <= 0) this.flash = null; }

    if (this.state === STATE.COUNTDOWN) {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt;
      const now = Math.ceil(this.countdown);
      if (now !== prev && now >= 1) { this.setFlash(String(now), '#fff', 1, true); this.sfx.countBeep(); }
      if (this.countdown <= 0) {
        this.setFlash('SHOOT!', '#2ec16b', 0.8, true);
        this.sfx.whistle();
        this.state = STATE.PLAYING;
        this._beginDuel();
      }
      return;
    }

    if (this.state === STATE.VICTORY || this.state === STATE.GAME_OVER) return;
    if (!this.duel) return;

    const d = this.duel;
    const sdt = dt * d.timeScale;

    if (d.phase === 'intro') {
      d.timer -= dt;
      if (d.timer <= 0) {
        d.phase = 'live';
        d.front.state = d.front.isHuman ? 'aim' : 'wait';
        d.chaser.state = d.chaser.isHuman ? 'aim' : 'wait';
        if (this.finalDuel) this.setFlash('FINAL DUEL', '#ff3b3b', 1.4, true);
      }
      return;
    }

    if (d.phase === 'resolve') {
      d.timer -= dt;
      this._updateBalls(sdt);
      if (d.timer <= 0) this._finishDuel();
      return;
    }

    if (d.phase === 'ko') {
      d.timer -= dt;
      this._updateBalls(sdt);
      if (d.timer <= 0) this._finishDuel();
      return;
    }

    // live: update both shooters until one makes.
    this._updateShooter(d.front, sdt);
    if (!d.winner) this._updateShooter(d.chaser, sdt);
    this._updateBalls(sdt);
    this._emitHud();
  }

  _updateShooter(sh, sdt) {
    if (this.duel.winner) return;
    switch (sh.state) {
      case 'wait':
        sh.timer -= sdt;
        if (sh.timer <= 0) {
          if (sh.isHuman) { sh.state = 'aim'; }
          else { this._aiTryShoot(sh); }
        }
        break;
      case 'aim':
        // human meter sweep (ping-pong)
        sh.meterPos += (sdt / METER.sweepSeconds) * 2 * sh.meterDir;
        if (sh.meterPos >= 1) { sh.meterPos = 1; sh.meterDir = -1; }
        if (sh.meterPos <= 0) { sh.meterPos = 0; sh.meterDir = 1; }
        break;
      case 'rebound':
        sh.timer -= sdt;
        if (sh.timer <= 0) {
          if (sh.isHuman) sh.state = 'aim';
          else this._aiTryShoot(sh);
        }
        break;
      default: break; // 'ball' handled by _updateBalls
    }
  }

  _updateBalls(sdt) {
    for (const sh of [this.duel.front, this.duel.chaser]) {
      const b = sh.ball;
      if (!b) continue;
      b.t += sdt;
      b.rot += sdt * 8;
      if (b.phase === 'flight' && b.t >= b.dur) {
        if (b.made) { this._onMake(sh); }
        else { this._onMiss(sh); }
      }
      if (b.phase === 'carom') {
        b.t += sdt * 0; // handled via carom timer below
      }
    }
  }

  _onMake(sh) {
    if (this.duel.winner) { sh.ball = null; return; }
    this.duel.winner = sh.role;
    sh.ball.phase = 'swish';
    this.sfx.swish();
    this.sfx.crowdSwell(sh.isHuman ? 0.18 : 0.1);
    // Decide outcome semantics for banner/stats.
    const humanRole = this.duel.info.humanRole;
    if (sh.role === 'chaser') {
      // front is knocked out
      if (humanRole === 'chaser') { this.stats.knockouts++; }
      this._enterKo(this.duel.front, humanRole === 'front');
    } else {
      // front safe, nobody out
      this.setFlash(sh.isHuman ? 'SAFE!' : 'SAFE', '#2ec16b', 0.9, false);
      this.duel.phase = 'resolve';
      this.duel.timer = RESULT_HOLD;
    }
  }

  _enterKo(victim, victimIsHuman) {
    this.duel.phase = 'ko';
    this.duel.timer = KO_TIME;
    this.duel.koVictim = victim;
    victim.state = 'ko';
    victim.koT = 0;
    this.setFlash('KNOCKED OUT!', '#ff3b3b', 1.2, true);
    this.sfx.knockout();
  }

  _onMiss(sh) {
    if (this.duel.winner) { sh.ball = null; return; }
    this.sfx.rim();
    sh.ball = null;
    if (sh.isHuman) {
      sh.state = 'rebound';
      sh.timer = REBOUND_TAP_MAX; // auto-grab if they don't tap
      this.setFlash('REBOUND — TAP!', '#4dd0ff', REBOUND_TAP_MAX, false);
    } else {
      sh.state = 'rebound';
      sh.timer = this.match.aiRebound(sh.player) + 0.15;
    }
  }

  _finishDuel() {
    const winner = this.duel.winner;
    const preAlive = this.match.aliveCount;
    const humanRole = this.duel.info.humanRole;
    const res = this.match.resolve(winner);

    if (res.eliminatedId) {
      const ch = this.charsById.get(res.eliminatedId);
      analytics.track(EVENTS.PLAYER_ELIMINATED, { id: res.eliminatedId, remaining: this.match.aliveCount });
      const humanEliminated = humanRole === 'front' && winner === 'chaser';
      if (humanEliminated) {
        this.stats.placement = preAlive; // finished in this place
        this._endGame(false);
        return;
      }
      this.cb.onElimination?.({ char: ch, remaining: this.match.aliveCount });
    }

    if (res.done) {
      // champion
      this.stats.placement = 1;
      this._endGame(true);
      return;
    }

    if (res.finalDuel && !this.finalDuel) {
      this.finalDuel = true;
      this.state = STATE.FINAL_DUEL;
      analytics.track(EVENTS.FINAL_DUEL, {});
      this.cb.onFinalDuel?.();
    }
    this.duel = null;
    this._beginDuel();
  }

  _endGame(won) {
    this.stats.timeMs = performance.now() - this.stats.start;
    this.stats.accuracy = this.stats.shots ? Math.round((this.stats.made / this.stats.shots) * 100) : 0;
    this.state = won ? STATE.VICTORY : STATE.GAME_OVER;
    this.sfx.stopCrowd();
    if (won) { this.sfx.victory(); analytics.track(EVENTS.VICTORY, {}); this.cb.onVictory?.(this._finalStats()); }
    else { this.sfx.knockout(); this.cb.onDefeat?.(this._finalStats()); }
    analytics.track(EVENTS.GAME_END, { won, placement: this.stats.placement });
  }

  _finalStats() {
    return {
      shots: this.stats.shots,
      perfect: this.stats.perfect,
      knockouts: this.stats.knockouts,
      accuracy: this.stats.accuracy,
      timeMs: Math.round(this.stats.timeMs),
      placement: this.stats.placement,
    };
  }

  /** Player tap: release the meter, or grab a rebound early. */
  handleTap() {
    this.sfx.ensure();
    if (!this.duel || this.state === STATE.COUNTDOWN) return;
    const human = this.duel.info.humanRole
      ? (this.duel.info.humanRole === 'front' ? this.duel.front : this.duel.chaser)
      : null;
    if (!human) return;
    if (human.state === 'aim') {
      this.tutorial = false; this.tutorialDone = true;
      this._humanRelease(human);
    } else if (human.state === 'rebound') {
      human.timer = 0.05; // grab now → back to aim fast
    }
  }

  setFlash(text, color, ttl, big) { this.flash = { text, color, ttl, big }; }

  _emitHud() {
    const roleLabel = this.duel?.info.humanRole
      ? (this.duel.info.humanRole === 'front' ? 'YOUR SHOT — STAY ALIVE' : 'CHASE — KNOCK THEM OUT')
      : 'WATCHING…';
    this.cb.onHud?.({
      round: this.match.eliminated.length + 1,
      remaining: this.match.aliveCount,
      total: this.match.players.length,
      shots: this.stats.shots,
      streak: this.streak,
      roleLabel,
      finalDuel: this.finalDuel,
    });
  }

  // ---- render ---------------------------------------------------------------

  render() {
    const ctx = this.ctx;
    const { W, H } = this.layout;
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (this.finalDuel) { // subtle camera zoom
      ctx.translate(W / 2, H * 0.55);
      ctx.scale(1.12, 1.12);
      ctx.translate(-W / 2, -H * 0.55);
    }

    drawArena(ctx, W, H, this.arena, this.t, {
      crowdCheer: this.state === STATE.VICTORY || this.finalDuel,
      scoreboardY: H * 0.115, // hang below the DOM HUD pill row
      scoreboard: {
        top: this.arena.name.toUpperCase(),
        bottom: `${this.match.aliveCount} LEFT`,
      },
    });
    drawCourt(ctx, this.layout, this.arena, this.t);

    // Waiting queue (players 3..N), receding along the bottom.
    const waiting = this.match.queue.slice(2);
    waiting.forEach((id, i) => {
      const ch = this.charsById.get(id);
      const x = W * 0.16 + i * (W * 0.68 / Math.max(1, waiting.length));
      const y = H * 0.99;
      const sc = 0.55;
      drawCharacter(ctx, ch, x, y, sc, 'idle', this.t + i);
    });

    // Active shooters
    if (this.duel) {
      const drawSh = (sh) => {
        const spot = this._shooterSpot(sh);
        let pose = 'idle', phase = this.t;
        if (sh.state === 'aim') { pose = 'idle'; }
        if (sh.state === 'ball' && sh.ball) { pose = 'shoot'; phase = Math.min(1, sh.ball.t / 0.3); }
        if (sh.state === 'rebound') { pose = 'run'; phase = this.t; }
        if (sh.state === 'ko') { pose = 'knockout'; phase = Math.min(1, (sh.koT += 0.03)); }
        const sc = sh.role === 'front' ? 0.95 : 0.8;
        drawCharacter(ctx, sh.player.charForRender || this.charsById.get(sh.id), spot.x, spot.y, sc, pose, phase);
        // role marker
        if (sh.isHuman && sh.state === 'aim') {
          ctx.fillStyle = '#ffd23f';
          ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
          ctx.fillText('▼ YOU', spot.x, spot.y - 78);
        }
      };
      // draw chaser first (behind), then front
      drawSh(this.duel.chaser);
      drawSh(this.duel.front);

      // balls
      for (const sh of [this.duel.front, this.duel.chaser]) {
        if (sh.ball) this._renderBall(sh);
      }
    }

    // Streak flame indicator
    if (this.streak >= STREAK.hot) {
      ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'left';
      ctx.fillStyle = this.streak >= STREAK.onFire ? '#ff3b3b' : '#ff8c1a';
      ctx.fillText(`🔥 ${this.streak}`, 12, H * 0.5);
    }

    ctx.restore(); // camera

    // Shot meter (human aiming) — drawn in screen space, above camera zoom.
    this._renderMeter();

    // Center flash text
    if (this.flash) this._renderFlash();
  }

  _renderBall(sh) {
    const b = sh.ball;
    const ctx = this.ctx;
    const p = Math.min(1, b.t / b.dur);
    const spot = this._shooterSpot(sh);
    const from = b.from;
    const to = b.to;
    let x = from.x + (to.x - from.x) * p;
    let y = from.y + (to.y - from.y) * p - Math.sin(p * Math.PI) * (this.layout.H * 0.28);
    if (b.phase === 'swish') { // drop through net
      const dp = Math.min(1, (b.t - b.dur) / 0.25);
      x = to.x; y = to.y + dp * 26;
    }
    drawBall(ctx, x, y, sh.role === 'front' ? 10 : 8, b.rot, { shadowY: this.layout.ftY });
  }

  _renderMeter() {
    if (!this.duel || this.duel.phase !== 'live') return;
    const human = this.duel.info.humanRole === 'front' ? this.duel.front
      : this.duel.info.humanRole === 'chaser' ? this.duel.chaser : null;
    if (!human || human.state !== 'aim') return;
    const ctx = this.ctx;
    const m = this.layout.meter;
    // track
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    this._rr(m.x - 6, m.y - 16, m.w + 12, m.h + 40, 10); ctx.fill();
    // zones
    const zone = (a, b, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(m.x + m.w * a, m.y, m.w * (b - a), m.h);
    };
    const gh = METER.goodHalfWidth, ph = METER.perfectHalfWidth;
    zone(0, 0.5 - gh, '#39415a');
    zone(0.5 - gh, 0.5 - ph, '#3aa76d');
    zone(0.5 - ph, 0.5 + ph, '#ffd23f');
    zone(0.5 + ph, 0.5 + gh, '#3aa76d');
    zone(0.5 + gh, 1, '#39415a');
    // marker
    const mx = m.x + m.w * human.meterPos;
    ctx.fillStyle = '#fff';
    ctx.fillRect(mx - 2, m.y - 6, 4, m.h + 12);
    // label
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('TAP TO RELEASE', m.x + m.w / 2, m.y + m.h + 24);
  }

  _renderFlash() {
    const ctx = this.ctx;
    const { W, H } = this.layout;
    const f = this.flash;
    const a = Math.min(1, f.ttl * 2.5);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const size = f.big ? Math.min(64, W * 0.16) : Math.min(34, W * 0.08);
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.lineWidth = size * 0.12; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(f.text, W / 2, H * 0.34);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, W / 2, H * 0.34);
    ctx.restore();
  }

  _rr(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
