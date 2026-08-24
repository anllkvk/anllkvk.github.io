/**
 * Gameplay scene v2 — HaxBall-style free movement + aim-and-power shooting.
 *
 * You control your baller directly: move around the court, hold SHOOT to charge
 * a power arc aimed at the hoop, release to shoot. Miss and the ball comes loose
 * on the floor — chase it down, grab it, and finish. First of the two duelists to
 * sink a basket wins the pairing; the pure KnockoutMatch still owns the rules.
 *
 * The human side is fully physical; the AI opponent runs on a (slower) stat-based
 * timeline and is shown as a moving avatar. AI-vs-AI pairings you're only watching
 * auto-resolve with a short readable beat.
 */
import { STATE, SHOT, STREAK, PACE, MOVE, SHOTPWR, EVENTS } from './config.js';
import { resolvePowerShot, idealPowerForDistance } from './core/shot.js';
import { resolveAiShot } from './core/shot.js';
import { analytics } from './core/events.js';
import { drawArenaScene, drawBall, invalidateArenaCache } from './render/arena.js';
import { drawCharacter } from './render/characters.js';

const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export class Scene {
  constructor(ctx, canvas, sfx, cb) {
    this.ctx = ctx; this.canvas = canvas; this.sfx = sfx; this.cb = cb;
    this.match = null; this.charsById = new Map(); this.arena = null;
    this.t = 0; this.finalDuel = false; this.flash = null; this.duel = null;
    this.state = STATE.PLAYING; this.stats = null; this.streak = 0;
    this.tutorialDone = false; this.tutorial = false;
    this.move = { x: 0, y: 0 }; this.shootHeld = false;
    this.dpr = 1;
  }

  start(match, arena, characters, opts = {}) {
    this.match = match; this.arena = arena;
    this.charsById = new Map(characters.map((c) => [c.id, c]));
    this.t = 0; this.finalDuel = false; this.state = STATE.COUNTDOWN;
    this.stats = { shots: 0, perfect: 0, knockouts: 0, made: 0, start: performance.now(), placement: null };
    this.streak = 0; this.tutorial = !opts.tutorialDone; this.countdown = 3.0;
    this.move = { x: 0, y: 0 }; this.shootHeld = false;
    this.flash = { text: '3', color: '#fff', ttl: 1, big: true };
    analytics.track(EVENTS.GAME_START, { arena: arena.id, difficulty: match.difficulty.key });
    this._layout(); this.sfx.startCrowd();
  }

  _layout() {
    const W = this.canvas.width / this.dpr, H = this.canvas.height / this.dpr;
    const floorY = H * 0.42;
    const hoopX = W * 0.5, hoopY = floorY + (H - floorY) * 0.16;
    const ftY = floorY + (H - floorY) * 0.66;
    this.layout = {
      W, H, floorY, hoopX, hoopY, ftY, lineX: W * 0.5,
      hoop: { x: hoopX, y: hoopY },
      court: { x0: W * 0.11, x1: W * 0.89, y0: hoopY + 62, y1: H * 0.95 },
      powerBar: { x: W * 0.5 - Math.min(150, W * 0.4), y: H * 0.9, w: Math.min(300, W * 0.8), h: 20 },
    };
  }

  resize(dpr) { this.dpr = dpr; this._layout(); invalidateArenaCache(); }

  // ---- input API (wired from main.js) ----
  setMove(x, y) { this.move.x = x; this.move.y = y; }
  shootDown() {
    this.sfx.ensure();
    const H = this.duel?.human;
    if (H && H.hasBall && H.ball.state === 'held' && !H.charging) {
      H.charging = true; H.power = 0; H.powerDir = 1;
      this.tutorial = false; this.tutorialDone = true;
    }
    this.shootHeld = true;
  }
  shootUp() {
    this.shootHeld = false;
    const H = this.duel?.human;
    if (H && H.charging) this._release(H);
  }
  /** legacy alias so a stray tap still charges/fires */
  handleTap() { if (!this.shootHeld) { this.shootDown(); } }

  // ---- duel lifecycle ----
  _beginDuel() {
    const d = this.match.duel();
    if (!d) return;
    const L = this.layout;
    if (d.humanInvolved) {
      const humanShooter = d.humanRole === 'front' ? d.front : d.chaser;
      const aiShooter = d.humanRole === 'front' ? d.chaser : d.front;
      this.duel = {
        info: d, mode: 'human', phase: 'intro', timer: PACE.intro, winner: null,
        human: this._makeHuman(humanShooter, d.humanRole),
        opp: this._makeAi(aiShooter, d.humanRole === 'front' ? 'chaser' : 'front'),
      };
      if (this.tutorial && !this.tutorialDone) {
        this.setFlash('MOVE + HOLD SHOOT', '#ffd23f', 2.4, false);
      }
    } else {
      // Watching: precompute the winner, play a short beat.
      const sim = this.match.simulateAiDuel(d);
      this.duel = {
        info: d, mode: 'auto', phase: 'auto', timer: 1.15 / PACE.autoScale, winner: null,
        simWinner: sim.winner,
        a: this._makeAi(d.front, 'front'), b: this._makeAi(d.chaser, 'chaser'),
      };
      this.duel.a.pos = { x: L.court.x0 + L.court.x1 * 0.32, y: L.ftY };
      this.duel.b.pos = { x: L.court.x1 * 0.9, y: L.ftY + 8 };
    }
  }

  _makeHuman(player, role) {
    const L = this.layout;
    const pos = { x: L.lineX, y: L.ftY };
    return {
      id: player.id, player, role, isHuman: true,
      pos, vel: { x: 0, y: 0 }, facing: 1,
      hasBall: true, charging: false, power: 0, powerDir: 1, attempts: 0,
      looseTimer: 0,
      ball: { state: 'held', pos: { ...pos }, vel: { x: 0, y: 0 }, z: 40, rot: 0, t: 0, from: null, to: null, quality: null, made: false },
    };
  }

  _makeAi(player, role) {
    const L = this.layout;
    return {
      id: player.id, player, role, isHuman: false,
      pos: { x: role === 'front' ? L.lineX + 70 : L.lineX - 70, y: L.ftY + 6 },
      vel: { x: 0, y: 0 }, drift: Math.random() * Math.PI * 2,
      state: 'wait', timer: this.match.aiReaction(player) + (role === 'chaser' ? 0.5 : 0),
      attempts: 0, ball: null,
    };
  }

  // ---- update ----
  update(dt) {
    this.t += dt;
    if (this.flash) { this.flash.ttl -= dt; if (this.flash.ttl <= 0) this.flash = null; }

    if (this.state === STATE.COUNTDOWN) {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt * 0.85; // slightly slower countdown
      const now = Math.ceil(this.countdown);
      if (now !== prev && now >= 1) { this.setFlash(String(now), '#fff', 1, true); this.sfx.countBeep(); }
      if (this.countdown <= 0) {
        this.setFlash('GO!', '#2ec16b', 0.8, true); this.sfx.whistle();
        this.state = STATE.PLAYING; this._beginDuel();
      }
      return;
    }
    if (this.state === STATE.VICTORY || this.state === STATE.GAME_OVER) return;
    if (!this.duel) return;

    const d = this.duel;
    if (d.phase === 'intro') {
      d.timer -= dt;
      if (d.timer <= 0) { d.phase = 'live'; if (this.finalDuel) this.setFlash('FINAL DUEL', '#ff3b4e', 1.4, true); }
      return;
    }
    if (d.phase === 'auto') {
      d.timer -= dt; this._animAi(d.a, dt); this._animAi(d.b, dt);
      if (d.timer <= 0) { d.winner = d.simWinner; this._finishDuel(); }
      return;
    }
    if (d.phase === 'resolve' || d.phase === 'ko') {
      d.timer -= dt;
      if (d.human) this._updateBall(d.human, dt);
      if (d.phase === 'ko' && d.koVictim) d.koVictim.koT = Math.min(1, (d.koVictim.koT || 0) + dt / PACE.koTime);
      if (d.timer <= 0) this._finishDuel();
      return;
    }

    // live
    this._updateHuman(d.human, dt);
    if (!d.winner) this._updateOpp(d.opp, dt);
    this._emitHud();
  }

  _updateHuman(H, dt) {
    // movement
    const L = this.layout;
    const ax = this.move.x * MOVE.accel, ay = this.move.y * MOVE.accel;
    H.vel.x += ax * dt; H.vel.y += ay * dt;
    // friction
    const f = Math.max(0, 1 - MOVE.friction * dt);
    if (this.move.x === 0) H.vel.x *= f;
    if (this.move.y === 0) H.vel.y *= f;
    const sp = Math.hypot(H.vel.x, H.vel.y);
    if (sp > MOVE.maxSpeed) { H.vel.x *= MOVE.maxSpeed / sp; H.vel.y *= MOVE.maxSpeed / sp; }
    H.pos.x += H.vel.x * dt; H.pos.y += H.vel.y * dt;
    H.pos.x = Math.max(L.court.x0, Math.min(L.court.x1, H.pos.x));
    H.pos.y = Math.max(L.court.y0, Math.min(L.court.y1, H.pos.y));
    if (Math.abs(this.move.x) > 0.1) H.facing = this.move.x > 0 ? 1 : -1;
    else if (H.charging || H.hasBall) H.facing = L.hoop.x >= H.pos.x ? 1 : -1;

    // charging
    if (H.charging) {
      H.power += (dt / SHOTPWR.chargeSeconds) * 2 * H.powerDir;
      if (H.power >= 1) { H.power = 1; H.powerDir = -1; }
      if (H.power <= 0) { H.power = 0; H.powerDir = 1; }
    }
    this._updateBall(H, dt);
  }

  _updateBall(H, dt) {
    const b = H.ball, L = this.layout;
    b.rot += dt * 7;
    if (b.state === 'held') {
      // ball sits at the hand, slightly toward the hoop
      const dir = L.hoop.x >= H.pos.x ? 1 : -1;
      b.pos.x = H.pos.x + 14 * dir; b.pos.y = H.pos.y - 30; b.z = 44;
      return;
    }
    if (b.state === 'flight') {
      b.t += dt;
      const p = Math.min(1, b.t / PACE.ballFlight);
      b.pos.x = b.from.x + (b.to.x - b.from.x) * p;
      b.pos.y = b.from.y + (b.to.y - b.from.y) * p;
      b.z = 44 + Math.sin(p * Math.PI) * (L.H * 0.30);
      if (p >= 1) { b.made ? this._onMake(H) : this._onMiss(H); }
      return;
    }
    if (b.state === 'loose') {
      // simple floor physics
      b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt;
      b.vel.x *= Math.max(0, 1 - 3.0 * dt); b.vel.y *= Math.max(0, 1 - 3.0 * dt);
      b.z = Math.max(0, b.z - 120 * dt);
      // bounce off court bounds
      if (b.pos.x < L.court.x0) { b.pos.x = L.court.x0; b.vel.x = Math.abs(b.vel.x) * 0.6; }
      if (b.pos.x > L.court.x1) { b.pos.x = L.court.x1; b.vel.x = -Math.abs(b.vel.x) * 0.6; }
      if (b.pos.y < L.court.y0) { b.pos.y = L.court.y0; b.vel.y = Math.abs(b.vel.y) * 0.6; }
      if (b.pos.y > L.court.y1) { b.pos.y = L.court.y1; b.vel.y = -Math.abs(b.vel.y) * 0.6; }
      // grab
      H.looseTimer += dt;
      if (dist2(H.pos, b.pos) < MOVE.grabRadius || H.looseTimer > PACE.looseTimeout) {
        b.state = 'held'; H.hasBall = true; H.looseTimer = 0;
        this.sfx.bounce();
        this.setFlash('GOT IT!', '#4dd0ff', 0.6, false);
      }
      return;
    }
    if (b.state === 'scored') { b.t += dt; b.z = Math.max(-10, b.z - 160 * dt); }
  }

  _release(H) {
    H.charging = false;
    if (!H.hasBall || H.ball.state !== 'held') return;
    const L = this.layout;
    const d = dist2(H.pos, L.hoop);
    const pressure = this._pressure();
    const ctx = { clutch: H.player.stats.clutch, pressure, fatigue: Math.min(0.35, H.attempts * 0.04) };
    const res = resolvePowerShot(H.power, d, ctx, this.match.rng);
    H.attempts++; this.stats.shots++;
    analytics.track(EVENTS.SHOT_ATTEMPT, { by: H.id, quality: res.quality, made: res.made });
    if (res.quality === SHOT.PERFECT) analytics.track(EVENTS.PERFECT_SHOT, { by: H.id });

    const from = { x: H.ball.pos.x, y: H.ball.pos.y };
    const to = res.made
      ? { x: L.hoop.x, y: L.hoop.y }
      : { x: L.hoop.x + (this.match.rng.next() < 0.5 ? -1 : 1) * (16 + this.match.rng.next() * 16), y: L.hoop.y - 4 };
    H.ball = { ...H.ball, state: 'flight', from, to, t: 0, made: res.made, quality: res.quality };
    H.hasBall = false;
    this.sfx.bounce();

    // streak bookkeeping happens on make/miss
    H._lastRes = res;
  }

  _onMake(H) {
    if (this.duel.winner) { return; }
    const res = H._lastRes || { quality: SHOT.GOOD };
    this.stats.made++;
    if (res.quality === SHOT.PERFECT) { this.streak++; this.stats.perfect++; this.sfx.perfect();
      if (this.streak === STREAK.hot) this.setFlash('🔥 HOT!', '#ff8c1a', 1.1, true);
      else if (this.streak >= STREAK.onFire) this.setFlash('🔥 ON FIRE!', '#ff3b3b', 1.1, true);
    } else { this.streak = 0; this.sfx.swish(); }
    H.ball.state = 'scored'; H.ball.pos = { ...this.layout.hoop };
    this.sfx.swish(); this.sfx.crowdSwell(0.18);
    this._score('human');
  }

  _onMiss(H) {
    if (this.duel.winner) return;
    this.streak = 0; this.sfx.rim();
    const b = H.ball;
    b.state = 'loose'; b.z = 30;
    // carom back toward the player's side of the court
    const ang = (Math.PI / 2) + (this.match.rng.next() - 0.5) * 1.6;
    const spd = 150 + this.match.rng.next() * 120;
    b.vel = { x: Math.cos(ang) * spd * (this.match.rng.next() < 0.5 ? -1 : 1), y: Math.sin(ang) * spd };
    H.looseTimer = 0;
    this.setFlash('REBOUND!', '#4dd0ff', 0.8, false);
  }

  // opponent (AI) timeline
  _updateOpp(O, dt) {
    this._animAi(O, dt);
    switch (O.state) {
      case 'wait':
        O.timer -= dt;
        if (O.timer <= 0) this._aiShoot(O);
        break;
      case 'ball': {
        O.ball.t += dt; O.ball.rot += dt * 7;
        const p = Math.min(1, O.ball.t / PACE.ballFlight);
        O.ball.pos.x = O.ball.from.x + (O.ball.to.x - O.ball.from.x) * p;
        O.ball.pos.y = O.ball.from.y + (O.ball.to.y - O.ball.from.y) * p;
        O.ball.z = 44 + Math.sin(p * Math.PI) * (this.layout.H * 0.28);
        if (p >= 1) {
          if (O.ball.made) { O.ball.state = 'scored'; this.sfx.swish(); this._score('opp'); }
          else { this.sfx.rim(); O.ball = null; O.state = 'rebound'; O.timer = this.match.aiRebound(O.player) + PACE.autoScale * 0.2; }
        }
        break;
      }
      case 'rebound':
        O.timer -= dt;
        if (O.timer <= 0) this._aiShoot(O);
        break;
      default: break;
    }
  }

  _aiShoot(O) {
    const pressure = this._pressure();
    const acc = this.match.aiAccuracy(O.player, pressure);
    const res = resolveAiShot(acc, { clutch: O.player.stats.clutch, pressure }, this.match.rng);
    O.attempts++;
    const from = { x: O.pos.x, y: O.pos.y - 30 };
    const to = res.made ? { ...this.layout.hoop }
      : { x: this.layout.hoop.x + (this.match.rng.next() < 0.5 ? -1 : 1) * 18, y: this.layout.hoop.y - 4 };
    O.ball = { state: 'ball', pos: { ...from }, from, to, t: 0, z: 44, rot: 0, made: res.made };
    O.state = 'ball';
    this.sfx.bounce();
  }

  _animAi(O, dt) {
    // gentle cosmetic drift so the avatar feels alive
    O.drift = (O.drift || 0) + dt * 1.5;
    const L = this.layout;
    O.pos.x += Math.cos(O.drift) * MOVE.aiMoveSpeed * 0.15 * dt;
    O.pos.y += Math.sin(O.drift * 0.7) * MOVE.aiMoveSpeed * 0.1 * dt;
    O.pos.x = Math.max(L.court.x0, Math.min(L.court.x1, O.pos.x));
    O.pos.y = Math.max(L.court.y0, Math.min(L.court.y1, O.pos.y));
  }

  _pressure() {
    const d = this.duel;
    if (!d) return 0;
    if (d.mode === 'human') return Math.min(0.55, (d.opp.attempts || 0) * 0.09);
    return 0;
  }

  _score(who) {
    if (this.duel.winner) return;
    const humanRole = this.duel.info.humanRole;
    // map who -> front/chaser role that made the basket
    let winnerRole;
    if (who === 'human') winnerRole = humanRole;
    else winnerRole = humanRole === 'front' ? 'chaser' : 'front';
    this.duel.winner = winnerRole;

    if (winnerRole === 'chaser') {
      // front is knocked out
      if (who === 'human') this.stats.knockouts++;
      this.duel.phase = 'ko'; this.duel.timer = PACE.koTime;
      this.duel.koVictim = who === 'human' ? this.duel.opp : this.duel.human; // the front loser
      if (this.duel.koVictim) this.duel.koVictim.koT = 0;
      this.setFlash('KNOCKED OUT!', '#ff3b4e', 1.2, true); this.sfx.knockout();
    } else {
      this.setFlash(who === 'human' ? 'SAFE!' : 'SAFE', '#2ec16b', 0.9, false);
      this.duel.phase = 'resolve'; this.duel.timer = PACE.resultHold;
    }
  }

  _finishDuel() {
    const winner = this.duel.winner;
    const preAlive = this.match.aliveCount;
    const humanRole = this.duel.info.humanRole;
    const res = this.match.resolve(winner);

    if (res.eliminatedId) {
      analytics.track(EVENTS.PLAYER_ELIMINATED, { id: res.eliminatedId, remaining: this.match.aliveCount });
      const humanEliminated = humanRole === 'front' && winner === 'chaser';
      if (humanEliminated) { this.stats.placement = preAlive; this._endGame(false); return; }
      this.cb.onElimination?.({ char: this.charsById.get(res.eliminatedId), remaining: this.match.aliveCount });
    }
    if (res.done) { this.stats.placement = 1; this._endGame(true); return; }
    if (res.finalDuel && !this.finalDuel) {
      this.finalDuel = true; this.state = STATE.FINAL_DUEL;
      analytics.track(EVENTS.FINAL_DUEL, {}); this.cb.onFinalDuel?.();
    }
    this.duel = null; this._beginDuel();
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
    return { shots: this.stats.shots, perfect: this.stats.perfect, knockouts: this.stats.knockouts,
      accuracy: this.stats.accuracy, timeMs: Math.round(this.stats.timeMs), placement: this.stats.placement };
  }

  setFlash(text, color, ttl, big) { this.flash = { text, color, ttl, big }; }

  /** Introspection for automated tests / debugging. */
  aimDebug() {
    const d = this.duel;
    if (!d || d.mode !== 'human' || !d.human) return { human: false };
    const H = d.human;
    return {
      human: true, phase: d.phase, hasBall: H.hasBall, ballState: H.ball.state,
      charging: H.charging, power: H.power,
      ideal: idealPowerForDistance(dist2(H.pos, this.layout.hoop)),
      role: d.info.humanRole,
    };
  }

  _emitHud() {
    const humanRole = this.duel?.info.humanRole;
    let label = 'WATCHING…';
    if (humanRole === 'front') label = 'SINK IT — STAY ALIVE';
    else if (humanRole === 'chaser') label = 'SCORE FIRST — KNOCK THEM OUT';
    this.cb.onHud?.({
      round: this.match.eliminated.length + 1, remaining: this.match.aliveCount,
      total: this.match.players.length, shots: this.stats.shots, streak: this.streak,
      roleLabel: label, finalDuel: this.finalDuel,
    });
  }

  // ---- render ----
  render() {
    const ctx = this.ctx, { W, H } = this.layout;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (this.finalDuel) { ctx.translate(W / 2, H * 0.55); ctx.scale(1.1, 1.1); ctx.translate(-W / 2, -H * 0.55); }

    drawArenaScene(ctx, this.layout, this.arena, {
      scoreboardY: H * 0.115,
      scoreboard: { top: this.arena.name.toUpperCase(), bottom: `${this.match.aliveCount} LEFT` },
    });

    // waiting queue
    const waiting = this.match.queue.slice(2);
    waiting.forEach((id, i) => {
      const ch = this.charsById.get(id);
      const x = W * 0.16 + i * (W * 0.68 / Math.max(1, waiting.length));
      drawCharacter(ctx, ch, x, H * 0.99, 0.5, 'idle', this.t + i, { dim: true });
    });

    const d = this.duel;
    if (d) {
      if (d.mode === 'auto') {
        this._drawAi(d.a); this._drawAi(d.b);
      } else {
        // aim arrow + arc under the player (drawn on floor first)
        if (d.human.hasBall && d.human.ball.state === 'held') this._drawAim(d.human);
        this._drawAi(d.opp);
        this._drawHuman(d.human);
        this._drawBall(d.human.ball, 10);
        if (d.opp.ball) this._drawBall(d.opp.ball, 9);
      }
    }

    if (this.streak >= STREAK.hot) {
      ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'left';
      ctx.fillStyle = this.streak >= STREAK.onFire ? '#ff3b3b' : '#ff8c1a';
      ctx.fillText(`🔥 ${this.streak}`, 12, H * 0.52);
    }

    ctx.restore();
    this._drawPowerBar();
    if (this.flash) this._drawFlash();
  }

  _drawHuman(H) {
    let pose = 'idle', phase = this.t;
    const moving = Math.hypot(H.vel.x, H.vel.y) > 20;
    if (H.charging) { pose = 'aim'; phase = this.t; }
    else if (H.ball.state === 'flight') { pose = 'shoot'; phase = Math.min(1, H.ball.t / 0.25); }
    else if (moving) { pose = 'run'; phase = this.t; }
    drawCharacter(this.ctx, this.charsById.get(H.id), H.pos.x, H.pos.y, 0.95, pose, phase, { facing: H.facing });
    // "YOU" marker
    const ctx = this.ctx;
    ctx.fillStyle = '#ffd23f'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('▼ YOU', H.pos.x, H.pos.y - 80);
  }

  _drawAi(O) {
    let pose = 'idle';
    if (O.state === 'ball' && O.ball) pose = 'shoot';
    else if (O.koT != null) pose = 'knockout';
    const sc = O.role === 'front' ? 0.92 : 0.86;
    drawCharacter(this.ctx, this.charsById.get(O.id), O.pos.x, O.pos.y, sc,
      pose, pose === 'knockout' ? O.koT : this.t + (O.drift || 0), { facing: this.layout.hoop.x >= O.pos.x ? 1 : -1 });
  }

  _drawBall(b, r) {
    if (!b) return;
    const y = b.pos.y - (b.z || 0);
    drawBall(this.ctx, b.pos.x, y, r, b.rot || 0, { shadowY: b.pos.y });
  }

  /** Dotted aim arc from the player to the hoop + a direction arrow (the "ok"). */
  _drawAim(H) {
    const ctx = this.ctx, L = this.layout;
    const from = { x: H.pos.x, y: H.pos.y - 34 };
    const to = L.hoop;
    const power = H.charging ? H.power : idealPowerForDistance(dist2(H.pos, L.hoop));
    const arcH = L.H * 0.30;
    ctx.save();
    ctx.setLineDash([5, 7]); ctx.lineWidth = 2.5;
    ctx.strokeStyle = H.charging ? 'rgba(255,210,63,0.9)' : 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const p = i / 20;
      const x = from.x + (to.x - from.x) * p;
      const yy = from.y + (to.y - from.y) * p - Math.sin(p * Math.PI) * arcH;
      i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // arrowhead near the hoop
    ctx.fillStyle = H.charging ? '#ffd23f' : 'rgba(255,255,255,0.6)';
    const a = Math.atan2(to.y - (to.y - arcH), to.x - from.x);
    ctx.save(); ctx.translate(to.x, to.y + 6);
    ctx.rotate(-Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  _drawPowerBar() {
    const d = this.duel;
    if (!d || d.mode !== 'human' || d.phase !== 'live') return;
    const H = d.human;
    if (!H.charging) return;
    const ctx = this.ctx, m = this.layout.powerBar;
    const ideal = idealPowerForDistance(dist2(H.pos, this.layout.hoop));
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    this._rr(m.x - 8, m.y - 20, m.w + 16, m.h + 42, 10); ctx.fill();
    // bar background
    ctx.fillStyle = '#39415a'; this._rr(m.x, m.y, m.w, m.h, m.h / 2); ctx.fill();
    // good band around ideal
    const gx0 = m.x + m.w * Math.max(0, ideal - SHOTPWR.goodTol);
    const gx1 = m.x + m.w * Math.min(1, ideal + SHOTPWR.goodTol);
    ctx.fillStyle = '#3aa76d'; ctx.fillRect(gx0, m.y, gx1 - gx0, m.h);
    // perfect band
    const px0 = m.x + m.w * Math.max(0, ideal - SHOTPWR.perfectTol);
    const px1 = m.x + m.w * Math.min(1, ideal + SHOTPWR.perfectTol);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(px0, m.y, px1 - px0, m.h);
    // current power marker
    const mx = m.x + m.w * H.power;
    ctx.fillStyle = '#fff'; ctx.fillRect(mx - 2.5, m.y - 6, 5, m.h + 12);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('RELEASE IN THE YELLOW', m.x + m.w / 2, m.y + m.h + 22);
    ctx.restore();
  }

  _drawFlash() {
    const ctx = this.ctx, { W, H } = this.layout, f = this.flash;
    const a = Math.min(1, f.ttl * 2.5);
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const size = f.big ? Math.min(60, W * 0.15) : Math.min(30, W * 0.072);
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.lineWidth = size * 0.12; ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(f.text, W / 2, H * 0.32);
    ctx.fillStyle = f.color; ctx.fillText(f.text, W / 2, H * 0.32);
    ctx.restore();
  }

  _rr(x, y, w, h, r) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
}
