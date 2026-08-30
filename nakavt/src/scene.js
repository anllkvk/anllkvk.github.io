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
import { STATE, SHOT, STREAK, PACE, MOVE, SHOTPWR, EVENTS, COLORS, FX, PARTICLES, AI } from './config.js';
import { resolvePowerShot, idealPowerForDistance } from './core/shot.js';
import { resolveAiShot } from './core/shot.js';
import { analytics } from './core/events.js';
import { drawArenaScene, drawBall, drawVignette, invalidateArenaCache } from './render/arena.js';
import { drawCharacter } from './render/characters.js';
import { makeAnimState, updateAnim } from './core/anim.js';
import { makeSkeleton, rigDims, ballCarry } from './core/rig.js';
import { shotChain } from './core/shotchain.js';
import { makeBlendState } from './core/blend.js';
import { makeGaitState, updateGait, brakeStance } from './core/gait.js';

/** A character's persistent animation state plus its own rig skeleton (AE1/AE2). */
const _dimsScratch = {};
const _ballDims = {};
const _chainScratch = {};
const _carry = { x: 0, y: 0 };
const _ballLocal = { x: 0, y: 0 };

function newAnim() {
  const a = makeAnimState();
  a.sk = makeSkeleton();
  a.gait = makeGaitState();
  a.blend = makeBlendState();
  return a;
}
import { Camera } from './render/camera.js';
import { Particles } from './render/particles.js';
import { SpriteCache } from './render/sprites.js';
import { haptics } from './audio/haptics.js';
import { easeOutBack, easeOutCubic } from './core/ease.js';
import { shotPoints, KNOCKOUT_BONUS, SURVIVE_BONUS } from './core/score.js';
import { arrive, predictSettle } from './core/steering.js';

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
    // visual/game-feel layer (purely cosmetic; never touches gameplay state)
    this.cam = new Camera(1, 1);
    this.particles = new Particles(PARTICLES.max);
    this.sprites = new SpriteCache();
    this.floaters = [];
    this.rings = []; // expanding ring pulses (make / knockout)
    this.screenFlash = 0;
    this.quality = 1; // particle/effect multiplier (1 = full, lower = fewer)
  }

  setQuality(q) { this.quality = Math.max(0.2, Math.min(1, q)); }
  _pn(n) { return Math.max(2, Math.round(n * this.quality)); }

  start(match, arena, characters, opts = {}) {
    this.match = match; this.arena = arena;
    this.charsById = new Map(characters.map((c) => [c.id, c]));
    this.t = 0; this.finalDuel = false; this.state = STATE.COUNTDOWN;
    this.stats = { shots: 0, perfect: 0, knockouts: 0, made: 0, score: 0, start: performance.now(), placement: null };
    this.streak = 0; this.tutorial = !opts.tutorialDone; this.countdown = 3.0;
    this.move = { x: 0, y: 0 }; this.shootHeld = false;
    this.flash = { text: '3', color: '#fff', ttl: 1, max: 1, big: true };
    this.floaters.length = 0; this.rings.length = 0; this.screenFlash = 0; this.particles.clear();
    analytics.track(EVENTS.GAME_START, { arena: arena.id, difficulty: match.difficulty.key });
    this._layout();
    this.sprites.setDpr(this.dpr);
    this.cam.resize(this.layout.W, this.layout.H); this.cam.reset();
    this.sfx.startCrowd();
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

  resize(dpr) {
    this.dpr = dpr; this._layout(); invalidateArenaCache();
    this.sprites.setDpr(dpr);
    if (this.layout) this.cam.resize(this.layout.W, this.layout.H);
  }

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
      // Watching: the two rivals actually play it out live (see _aiStep).
      this.duel = {
        info: d, mode: 'auto', phase: 'auto', winner: null, safety: 0,
        a: this._makeAi(d.front, 'front'), b: this._makeAi(d.chaser, 'chaser'),
      };
      this.duel.a.pos = { x: L.court.x0 + L.court.x1 * 0.32, y: L.ftY };
      this.duel.b.pos = { x: L.court.x1 * 0.9, y: L.ftY + 8 };
    }
  }

  /**
   * Advance a character's momentum state (AE2). Speed is measured from how far the entity
   * actually moved, so it works for the human (velocity-driven) and the AI (steering
   * writes straight to pos) without either needing to report a velocity.
   */
  _animStep(E, dt, lift = 0) {
    if (!E || !E.anim || dt <= 0) return;
    if (!E.animPrev) E.animPrev = { x: E.pos.x, y: E.pos.y };
    const speed = Math.hypot(E.pos.x - E.animPrev.x, E.pos.y - E.animPrev.y) / dt;
    E.animPrev.x = E.pos.x; E.animPrev.y = E.pos.y;
    const facing = E.facing || 1;
    updateAnim(E.anim, { speed, maxSpeed: MOVE.maxSpeed, facing, lift }, dt);
    // AE3: the step cycle runs in world space so a planted foot can genuinely stay put
    // while the body travels over it. scale is the draw scale used for this entity.
    const ch = this.charsById.get(E.id);
    const dims = rigDims(this._drawScale(E), ch && ch.height, _dimsScratch);
    // One braking stance per frame, shared by the gait and the draw pass: the wide,
    // low stop only reads if the FEET widen too, not just the hips (doc 1.0 finding 2).
    E.anim.stance = brakeStance(E.anim.brake.v);
    updateGait(E.anim.gait, {
      comX: E.pos.x,
      facing,
      speed01: E.anim.speed01.v,
      moving: speed > 12,
      halfWidth: dims.hipDx * E.anim.stance.stanceWidth + dims.s * 1.5,
      legReach: dims.legReach,
    }, dt);
  }

  /** The draw scale an entity is rendered at. Shared by the gait and the draw pass. */
  _drawScale(E) {
    if (E.isHuman) return 0.95;
    return E.role === 'front' ? 0.92 : 0.86;
  }

  /**
   * Seconds since this character's shot left the hand, or null if it is not shooting.
   * The human's in-flight ball is state 'flight'; an AI's is state 'ball'.
   */
  _shotT(E) {
    if (!E || !E.ball) return null;
    if (E.isHuman) return E.ball.state === 'flight' ? E.ball.t : null;
    return E.state === 'ball' ? E.ball.t : null;
  }

  /** Jump height in px, straight off the shot chain so every layer agrees on it (AE4). */
  _shotLift(E) {
    const t = this._shotT(E);
    return t == null ? 0 : shotChain(t, _chainScratch).lift;
  }

  /**
   * The human's current animation pose. Decided once and used by BOTH the ball update and
   * the draw pass: if they disagreed the ball would sit where no hand is, which is exactly
   * the failure AE5 exists to remove.
   */
  _humanPose(H) {
    if (H.charging) return 'aim';
    if (H.ball.state === 'flight') return 'shoot';
    if (Math.hypot(H.vel.x, H.vel.y) > 20) return 'run';
    if (H.hasBall && H.ball.state === 'held') return 'dribble';
    return 'idle';
  }

  _makeHuman(player, role) {
    const L = this.layout;
    const pos = { x: L.lineX, y: L.ftY };
    return {
      id: player.id, player, role, isHuman: true,
      pos, vel: { x: 0, y: 0 }, facing: 1,
      anim: newAnim(), animPrev: { x: pos.x, y: pos.y },
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
      vel: { x: 0, y: 0 }, drift: Math.random() * Math.PI * 2, facing: 1,
      anim: newAnim(), animPrev: null,
      state: 'wait', timer: this.match.aiReaction(player) + (role === 'chaser' ? 0.5 : 0),
      attempts: 0, ball: null, looseTimer: 0,
    };
  }

  // ---- update ----
  update(dt) {
    this.t += dt;
    this._dt = dt; // the draw pass needs it to advance the limb lag
    if (this.flash) { this.flash.ttl -= dt; if (this.flash.ttl <= 0) this.flash = null; }
    // cosmetic layer (never gates gameplay)
    this.cam.zoomTo(this.finalDuel ? FX.camZoomFinal : 1, 3);
    this.cam.update(dt);
    this.particles.update(dt);
    if (this.screenFlash > 0) this.screenFlash = Math.max(0, this.screenFlash - dt * 2.2);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.ttl -= dt; f.y += f.vy * dt;
      if (f.ttl <= 0) this.floaters.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt;
      if (r.t >= r.max) this.rings.splice(i, 1);
    }

    if (this.state === STATE.COUNTDOWN) {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt * 0.85; // slightly slower countdown
      const now = Math.ceil(this.countdown);
      if (now !== prev && now >= 1) { this.setFlash(String(now), '#fff', 1, true); this.sfx.countBeep(); this.cam.punch(0.03); }
      if (this.countdown <= 0) {
        this.setFlash('NAKAVT!', COLORS.secondary, 0.9, true); this.sfx.whistle(); this.cam.punch(0.06);
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
      // Watchable AI-vs-AI duel: both rivals actually shoot (ball flight, make/miss,
      // rebound) so you can see the field playing while you wait your turn.
      d.safety = (d.safety || 0) + dt;
      this._aiStep(d.a, dt, PACE.autoScale, () => this._autoMake(d.a));
      if (!d.winner) this._aiStep(d.b, dt, PACE.autoScale, () => this._autoMake(d.b));
      this._animStep(d.a, dt, this._shotLift(d.a));
      this._animStep(d.b, dt, this._shotLift(d.b));
      // Safety (rare): if it drags AND no shot is mid-air, resolve deterministically
      // (better shooter wins) — no RNG, so seeded runs stay reproducible.
      if (!d.winner && d.safety > 8 && !d.a.ball && !d.b.ball) {
        const w = this.match.aiAccuracy(d.a.player) >= this.match.aiAccuracy(d.b.player) ? 'front' : 'chaser';
        this._autoScore(w);
      }
      this._emitHud();
      return;
    }
    if (d.phase === 'resolve' || d.phase === 'ko') {
      d.timer -= dt;
      if (d.human) {
        this._updateBall(d.human, dt);
        this._animStep(d.human, dt, this._shotLift(d.human));
      }
      this._animStep(d.opp, dt, this._shotLift(d.opp));
      if (d.phase === 'ko' && d.koVictim) d.koVictim.koT = Math.min(1, (d.koVictim.koT || 0) + dt / PACE.koTime);
      if (d.timer <= 0) this._finishDuel();
      return;
    }

    // live
    this._updateHuman(d.human, dt);
    if (!d.winner) this._aiStep(d.opp, dt, 1, () => { this.sfx.swish(); this._score('opp'); });
    this._animStep(d.human, dt, this._shotLift(d.human));
    this._animStep(d.opp, dt, this._shotLift(d.opp));
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
    // First shot is a free throw: you can't cross the free-throw line until you've
    // taken your first attempt (after that, chase the rebound anywhere).
    if (H.attempts === 0) H.pos.y = Math.max(L.ftY, H.pos.y);
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
      // AE5: the ball sits at the carry point the rig will pose the hand to (rig.ballCarry),
      // not at a fixed body offset that no hand was ever near. z is 0 because the carry
      // point already carries the height.
      const dir = L.hoop.x >= H.pos.x ? 1 : -1;
      const ch = this.charsById.get(H.id);
      const dims = rigDims(this._drawScale(H), ch && ch.height, _ballDims);
      const c = ballCarry(dims, this._humanPose(H), dir, _carry);
      b.pos.x = H.pos.x + c.x; b.pos.y = H.pos.y + c.y; b.z = 0;
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
    const hoop = this.layout.hoop;
    if (res.quality === SHOT.PERFECT) {
      this.streak++; this.stats.perfect++; this.sfx.perfect();
      // juice: camera punch, screen flash, gold sparkle burst, floating text, haptic
      this.cam.punch(FX.camPunchPerfect); this.screenFlash = FX.flashPerfect;
      this.particles.burst(hoop.x, hoop.y, this._pn(PARTICLES.perfectBurst), { color: COLORS.perfect, shape: 'spark', speed: 150, size: 3, max: 0.7 });
      this._ring(hoop.x, hoop.y, COLORS.perfect, 70);
      this._floater('PERFECT!', H.pos.x, H.pos.y - 96, COLORS.perfect);
      haptics.perfect();
      if (this.streak === STREAK.hot) this.setFlash('🔥 HOT!', COLORS.hot, 1.1, true);
      else if (this.streak === STREAK.onFire) this.setFlash('🔥 ON FIRE!', COLORS.onFire, 1.1, true);
      else if (this.streak >= STREAK.inferno) this.setFlash('🔥 UNSTOPPABLE!', COLORS.danger, 1.2, true);
    } else {
      this.streak = 0; this.sfx.swish();
      this.cam.punch(FX.camPunchGood);
      this.particles.burst(hoop.x, hoop.y, this._pn(PARTICLES.goodBurst), { color: '#fff', speed: 90, size: 2, max: 0.5 });
      haptics.score();
    }
    // arcade points (cosmetic): a lone perfect scores the base; the multiplier
    // rewards each ADDITIONAL perfect in the streak (streak was already ++'d above).
    const pts = shotPoints(res.quality, this.streak - 1);
    this.stats.score += pts;
    this._floater(`+${pts}`, hoop.x + 30, hoop.y - 6, res.quality === SHOT.PERFECT ? COLORS.perfect : '#fff', 18);
    H.ball.state = 'scored'; H.ball.pos = { ...hoop };
    this.sfx.swish(); this.sfx.crowdSwell(0.18);
    this._score('human');
  }

  _floater(text, x, y, color, size) {
    this.floaters.push({ text, x, y, vy: -34, ttl: 0.9, max: 0.9, color, size: size || 26 });
  }

  _ring(x, y, color, r1 = 60) {
    this.rings.push({ x, y, t: 0, max: 0.5, color, r0: 6, r1 });
  }

  _onMiss(H) {
    if (this.duel.winner) return;
    this.streak = 0; this.sfx.rim();
    this.cam.shake(FX.camShakeMiss, FX.camShakeMissDur);
    this.particles.burst(this.layout.hoop.x, this.layout.hoop.y, 5, { color: 'rgba(255,120,60,0.8)', speed: 70, size: 2, max: 0.4, grav: 200 });
    const b = H.ball;
    b.state = 'loose'; b.z = 30;
    // carom back toward the player's side of the court
    const ang = (Math.PI / 2) + (this.match.rng.next() - 0.5) * 1.6;
    const spd = 150 + this.match.rng.next() * 120;
    b.vel = { x: Math.cos(ang) * spd * (this.match.rng.next() < 0.5 ? -1 : 1), y: Math.sin(ang) * spd };
    H.looseTimer = 0;
    this.setFlash('REBOUND!', '#4dd0ff', 0.8, false);
  }

  // ---- unified AI controller ----------------------------------------------
  // One code path drives every CPU baller — the live opponent AND the rivals you
  // only watch. It is genuinely physical: shoot → (miss) loose ball with floor
  // physics → RUN to the predicted rebound using steering → grab → shoot again
  // (a layup bonus for finishing close). `scale` speeds up watched AI-vs-AI duels;
  // `onScore` fires the instant this baller sinks it.
  _aiStep(O, dt, scale, onScore) {
    if (this.duel.winner) return;
    const sdt = dt * scale, L = this.layout;
    switch (O.state) {
      case 'wait':
        this._aiIdle(O, dt);
        O.timer -= sdt;
        if (O.timer <= 0) this._aiLaunch(O);
        break;
      case 'ball': {
        this._aiIdle(O, dt);
        const b = O.ball; b.t += sdt; b.rot += sdt * 7;
        const p = Math.min(1, b.t / PACE.ballFlight);
        b.pos.x = b.from.x + (b.to.x - b.from.x) * p;
        b.pos.y = b.from.y + (b.to.y - b.from.y) * p;
        b.z = 44 + Math.sin(p * Math.PI) * (L.H * 0.28);
        if (p >= 1) {
          if (b.made) { b.state = 'scored'; b.pos = { ...L.hoop }; onScore(); }
          else this._aiToLoose(O);
        }
        break;
      }
      case 'chase': {
        const b = O.ball;
        this._looseStep(b, sdt);
        // steer to where the ball will settle (Reynolds "arrive"), speed by stat
        const target = predictSettle(b.pos, b.vel, 3.0);
        const spd = MOVE.aiMoveSpeed * (0.72 + O.player.stats.speed * 0.7) * scale;
        const v = arrive(O.pos, target, spd, 46);
        O.pos.x += v.x * dt; O.pos.y += v.y * dt;
        O.pos.x = Math.max(L.court.x0, Math.min(L.court.x1, O.pos.x));
        O.pos.y = Math.max(L.court.y0, Math.min(L.court.y1, O.pos.y));
        O.facing = b.pos.x >= O.pos.x ? 1 : -1;
        O.looseTimer += sdt;
        if (dist2(O.pos, b.pos) < MOVE.grabRadius || O.looseTimer > PACE.looseTimeout) {
          O.ball = null; O.state = 'wait';
          O.timer = this.match.aiRebound(O.player) * 0.45 + AI.betweenAttempt * 0.4;
          this.sfx.bounce();
        }
        break;
      }
      default: break;
    }
  }

  /** A CPU baller lines up and releases a shot from wherever it stands. */
  _aiLaunch(O) {
    const pressure = this._pressure();
    const from = { x: O.pos.x, y: O.pos.y - 30 };
    // Finishing close is easier (layup) — reward a good rebound chase.
    const dHoop = dist2(from, this.layout.hoop);
    const near = Math.max(0, 1 - dHoop / (this.layout.H * 0.5));
    const acc = Math.min(0.98, this.match.aiAccuracy(O.player, pressure) + near * 0.25);
    const res = resolveAiShot(acc, { clutch: O.player.stats.clutch, pressure }, this.match.rng);
    O.attempts++;
    O.facing = this.layout.hoop.x >= O.pos.x ? 1 : -1;
    const to = res.made ? { ...this.layout.hoop }
      : { x: this.layout.hoop.x + (this.match.rng.next() < 0.5 ? -1 : 1) * 18, y: this.layout.hoop.y - 4 };
    O.ball = { state: 'ball', pos: { ...from }, from, to, t: 0, z: 44, rot: 0, made: res.made };
    O.state = 'ball';
    this.sfx.bounce();
  }

  /** A missed CPU shot becomes a real loose ball; the baller enters LIVE_CHASE. */
  _aiToLoose(O) {
    this.sfx.rim();
    const b = O.ball;
    b.state = 'loose'; b.z = 30;
    const ang = (Math.PI / 2) + (this.match.rng.next() - 0.5) * 1.5;
    const spd = 140 + this.match.rng.next() * 120;
    b.vel = { x: Math.cos(ang) * spd * (this.match.rng.next() < 0.5 ? -1 : 1), y: Math.sin(ang) * spd };
    O.state = 'chase'; O.looseTimer = 0;
  }

  /** Shared loose-ball floor physics (friction, drop, court-bound bounces). */
  _looseStep(b, dt) {
    const L = this.layout;
    b.pos.x += b.vel.x * dt; b.pos.y += b.vel.y * dt;
    b.vel.x *= Math.max(0, 1 - 3.0 * dt); b.vel.y *= Math.max(0, 1 - 3.0 * dt);
    b.z = Math.max(0, (b.z || 0) - 120 * dt); b.rot += dt * 7;
    if (b.pos.x < L.court.x0) { b.pos.x = L.court.x0; b.vel.x = Math.abs(b.vel.x) * 0.6; }
    if (b.pos.x > L.court.x1) { b.pos.x = L.court.x1; b.vel.x = -Math.abs(b.vel.x) * 0.6; }
    if (b.pos.y < L.court.y0) { b.pos.y = L.court.y0; b.vel.y = Math.abs(b.vel.y) * 0.6; }
    if (b.pos.y > L.court.y1) { b.pos.y = L.court.y1; b.vel.y = -Math.abs(b.vel.y) * 0.6; }
  }

  /** Made-basket VFX for a watched AI-vs-AI duel, then resolve. */
  _autoMake(O) {
    this.sfx.swish();
    this.particles.burst(this.layout.hoop.x, this.layout.hoop.y, this._pn(5), { color: '#fff', speed: 80, size: 2, max: 0.4 });
    this._ring(this.layout.hoop.x, this.layout.hoop.y, this.arena.accent, 46);
    this._autoScore(O.role);
  }

  /** Resolve a watched AI duel (a=front, b=chaser). */
  _autoScore(role) {
    if (this.duel.winner) return;
    this.duel.winner = role;
    if (role === 'chaser') {
      const victim = this.duel.a; // the front rival is knocked out
      victim.ball = null; victim.state = 'ko'; // stop any in-flight shot so the KO anim shows
      this.duel.phase = 'ko'; this.duel.timer = PACE.koTime; this.duel.koVictim = victim; victim.koT = 0;
      this.setFlash('KNOCKED OUT!', COLORS.danger, 1.0, true);
      this.cam.shake(FX.camShakeKnockout * 0.6, FX.camShakeKnockoutDur); this.sfx.knockout();
      this.particles.burst(victim.pos.x, victim.pos.y - 28, this._pn(PARTICLES.knockoutBurst), { color: COLORS.danger, speed: 150, size: 3, max: 0.7, grav: 260 });
      this._ring(victim.pos.x, victim.pos.y - 24, COLORS.danger, 70);
    } else {
      // front sank it first — nobody out; drop the chaser's stray loose ball if any
      if (this.duel.b && this.duel.b.state === 'chase') { this.duel.b.ball = null; this.duel.b.state = 'wait'; }
      this.duel.phase = 'resolve'; this.duel.timer = PACE.resultHold;
    }
  }

  /** Gentle cosmetic drift so a standing/aiming baller feels alive (never during a chase). */
  _aiIdle(O, dt) {
    O.drift = (O.drift || 0) + dt * 1.5;
    const L = this.layout;
    O.pos.x += Math.cos(O.drift) * MOVE.aiMoveSpeed * 0.09 * dt;
    O.pos.y += Math.sin(O.drift * 0.7) * MOVE.aiMoveSpeed * 0.06 * dt;
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
      if (who === 'human') { this.stats.knockouts++; this.stats.score += KNOCKOUT_BONUS; }
      this.duel.phase = 'ko'; this.duel.timer = PACE.koTime;
      this.duel.koVictim = who === 'human' ? this.duel.opp : this.duel.human; // the front loser
      if (this.duel.koVictim) this.duel.koVictim.koT = 0;
      this.setFlash('KNOCKED OUT!', COLORS.danger, 1.2, true); this.sfx.knockout();
      // juice: short shake, burst at the victim, haptic
      this.cam.shake(FX.camShakeKnockout, FX.camShakeKnockoutDur);
      const v = this.duel.koVictim;
      if (v) { this.particles.burst(v.pos.x, v.pos.y - 30, this._pn(PARTICLES.knockoutBurst), { color: COLORS.danger, speed: 170, size: 3, max: 0.8, grav: 260 }); this.particles.dust(v.pos.x, v.pos.y, 8); this._ring(v.pos.x, v.pos.y - 24, COLORS.danger, 80); }
      haptics.knockout();
    } else {
      if (who === 'human') this.stats.score += SURVIVE_BONUS;
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
    if (won) { this.sfx.victory(); haptics.victory(); analytics.track(EVENTS.VICTORY, {}); this.cb.onVictory?.(this._finalStats()); }
    else { this.sfx.knockout(); haptics.knockout(); this.cb.onDefeat?.(this._finalStats()); }
    analytics.track(EVENTS.GAME_END, { won, placement: this.stats.placement });
  }

  _finalStats() {
    return { shots: this.stats.shots, perfect: this.stats.perfect, knockouts: this.stats.knockouts,
      accuracy: this.stats.accuracy, timeMs: Math.round(this.stats.timeMs), placement: this.stats.placement,
      score: this.stats.score };
  }

  setFlash(text, color, ttl, big) { this.flash = { text, color, ttl, max: ttl, big }; }

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
    else if (this.duel?.mode === 'auto' && this.duel.a && this.duel.b) {
      label = `WATCHING · ${this.charsById.get(this.duel.a.id).name} vs ${this.charsById.get(this.duel.b.id).name}`;
    }
    this.cb.onHud?.({
      round: this.match.eliminated.length + 1, remaining: this.match.aliveCount,
      total: this.match.players.length, shots: this.stats.shots, streak: this.streak,
      score: this.stats.score, roleLabel: label, finalDuel: this.finalDuel,
    });
  }

  // ---- render ----
  render() {
    const ctx = this.ctx, { W, H } = this.layout;
    ctx.clearRect(0, 0, W, H);

    // --- world (inside camera transform) ---
    this.cam.begin(ctx);

    drawArenaScene(ctx, this.layout, this.arena, {
      scoreboardY: H * 0.115,
      scoreboard: { top: this.arena.name.toUpperCase(), bottom: `${this.match.aliveCount} LEFT` },
    });

    // waiting queue — cached idle sprites (blit, not re-drawn)
    const waiting = this.match.queue.slice(2);
    waiting.forEach((id, i) => {
      const ch = this.charsById.get(id);
      const x = W * 0.16 + i * (W * 0.68 / Math.max(1, waiting.length));
      const bob = Math.sin(this.t * 3 + i) * 1.2;
      this.sprites.draw(ctx, ch, x, H * 0.99 + bob, 0.5, 'idle', { alpha: 0.82 });
    });

    const d = this.duel;
    if (d) {
      if (d.mode === 'auto') {
        this._drawAi(d.a); this._drawAi(d.b);
        if (d.a.ball) this._drawBall(d.a.ball, 9);
        if (d.b.ball) this._drawBall(d.b.ball, 9);
        this._nameTag(d.a); this._nameTag(d.b);
      } else {
        if (d.human.hasBall && d.human.ball.state === 'held') this._drawAim(d.human);
        this._drawAi(d.opp);
        this._drawHuman(d.human);
        this._drawBall(d.human.ball, 10);
        if (d.opp.ball) this._drawBall(d.opp.ball, 9);
      }
    }

    this._drawRings();
    this.particles.draw(ctx);
    this._drawFloaters();

    this.cam.end(ctx);

    // --- screen-space overlays ---
    if (this.screenFlash > 0.001) {
      ctx.save(); ctx.globalAlpha = this.screenFlash; ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H); ctx.restore();
    }
    drawVignette(ctx, W, H, this.finalDuel ? FX.vignetteFinal : FX.vignette);

    if (this.streak >= STREAK.hot) {
      ctx.font = '900 16px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = this.streak >= STREAK.onFire ? COLORS.onFire : COLORS.hot;
      ctx.fillText(`🔥 ${this.streak}`, 12, H * 0.5);
    }

    this._drawPowerBar();
    if (this.flash) this._drawFlash();
  }

  _drawRings() {
    const ctx = this.ctx;
    for (const r of this.rings) {
      const k = r.t / r.max;
      const rad = r.r0 + (r.r1 - r.r0) * easeOutCubic(k);
      ctx.save();
      ctx.globalAlpha = (1 - k) * 0.7;
      ctx.strokeStyle = r.color; ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  _drawFloaters() {
    const ctx = this.ctx;
    for (const f of this.floaters) {
      const k = 1 - f.ttl / f.max; // 0..1 appearance progress
      // pop in with an overshoot, then hold
      const scale = k < 0.35 ? 0.6 + easeOutBack(k / 0.35) * 0.5 : 1.1 - Math.min(0.1, (k - 0.35) * 0.16);
      const alpha = f.ttl > 0.3 ? 1 : f.ttl / 0.3;
      ctx.save();
      ctx.globalAlpha = alpha; ctx.translate(f.x, f.y); ctx.scale(scale, scale);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${f.size}px system-ui, sans-serif`;
      ctx.lineWidth = f.size * 0.16; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }

  _drawHuman(H) {
    const pose = this._humanPose(H);
    const shotT = this._shotT(H);
    let phase = this.t;
    const opts = {
      facing: H.facing, anim: H.anim, dt: this._dt || 0, comX: H.pos.x,
      // AE4: the shot chain runs off the ball's own clock, and the gather off the power sweep
      shotT: shotT || 0,
      charge: H.charging ? H.power : 0,
    };
    // Squash/stretch now comes from the momentum layer (AE2), which derives it from the
    // body's real vertical motion — stretch while rising, squash on touchdown — instead of
    // two hand-rolled cases that could not agree with each other.
    opts.sx = H.anim.sx; opts.sy = H.anim.sy;
    if (pose === 'shoot') phase = H.ball.t;
    // AE5: hand the ball over in local space whenever it is close enough to be worth
    // reaching for — held, loose at our feet, or coming down off the rim.
    const b = H.ball;
    if (b && b.state !== 'flight' && b.state !== 'scored') {
      _ballLocal.x = b.pos.x - H.pos.x;
      _ballLocal.y = (b.pos.y - (b.z || 0)) - H.pos.y;
      if (Math.hypot(_ballLocal.x, _ballLocal.y) < 90) {
        opts.ballAt = _ballLocal;
        // a dribble is one-handed; gathering to shoot or reaching for a loose ball is not
        opts.twoHanded = pose !== 'dribble';
      }
    }
    // streak aura
    if (this.streak >= STREAK.onFire) opts.glow = { color: 'rgba(255,59,59,0.7)', a: 0.6 };
    else if (this.streak >= STREAK.hot) opts.glow = { color: 'rgba(255,140,26,0.65)', a: 0.5 };
    drawCharacter(this.ctx, this.charsById.get(H.id), H.pos.x, H.pos.y, this._drawScale(H), pose, phase, opts);
    // "YOU" marker
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.secondary; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('▼ YOU', H.pos.x, H.pos.y - 82 - (opts.lift || 0));
  }

  _drawAi(O) {
    let pose = 'idle';
    if (O.koT != null) pose = 'knockout';
    else if (O.state === 'chase') pose = 'run';
    else if (O.state === 'ball' && O.ball) pose = 'shoot';
    const sc = this._drawScale(O);
    const facing = O.facing != null ? O.facing : (this.layout.hoop.x >= O.pos.x ? 1 : -1);
    drawCharacter(this.ctx, this.charsById.get(O.id), O.pos.x, O.pos.y, sc,
      pose, pose === 'knockout' ? O.koT : this.t + (O.drift || 0),
      {
        facing, anim: O.anim, dt: this._dt || 0, comX: O.pos.x,
        shotT: this._shotT(O) || 0, sx: O.anim.sx, sy: O.anim.sy,
      });
  }

  _nameTag(O) {
    const ctx = this.ctx;
    const ch = this.charsById.get(O.id);
    ctx.save();
    ctx.font = '900 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(ch.name, O.pos.x, O.pos.y - 66);
    ctx.fillStyle = O.koT != null ? COLORS.danger : 'rgba(255,255,255,0.9)';
    ctx.fillText(ch.name, O.pos.x, O.pos.y - 66);
    ctx.restore();
  }

  _drawBall(b, r) {
    if (!b) return;
    const ctx = this.ctx;
    const y = b.pos.y - (b.z || 0);
    const moving = b.state === 'flight' || b.state === 'ball' || b.state === 'loose';
    if (moving) {
      if (!b._trail) b._trail = [];
      b._trail.push({ x: b.pos.x, y });
      if (b._trail.length > FX.trailFrames) b._trail.shift();
      for (let i = 0; i < b._trail.length - 1; i++) {
        const p = b._trail[i], a = (i / b._trail.length) * 0.4;
        ctx.globalAlpha = a; ctx.fillStyle = '#ff9c4a';
        ctx.beginPath(); ctx.arc(p.x, p.y, r * (0.35 + (i / b._trail.length) * 0.5), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (b._trail) { b._trail.length = 0; }
    // squash when a loose ball is settled on the floor
    const grounded = b.state === 'loose' && (b.z || 0) < 6;
    if (grounded) { ctx.save(); ctx.translate(b.pos.x, y); ctx.scale(1.16, 0.84); ctx.translate(-b.pos.x, -y); }
    drawBall(ctx, b.pos.x, y, r, b.rot || 0, { shadowY: b.pos.y });
    if (grounded) ctx.restore();
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
    // current power marker — colored by how close to the ideal release
    const mx = m.x + m.w * H.power;
    const err = Math.abs(H.power - ideal);
    const mc = err <= SHOTPWR.perfectTol ? COLORS.perfect : err <= SHOTPWR.goodTol ? COLORS.success : '#fff';
    if (err <= SHOTPWR.perfectTol) { ctx.shadowColor = COLORS.perfect; ctx.shadowBlur = 10; }
    ctx.fillStyle = mc; ctx.fillRect(mx - 2.5, m.y - 6, 5, m.h + 12);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('RELEASE IN THE YELLOW', m.x + m.w / 2, m.y + m.h + 22);
    ctx.restore();
  }

  _drawFlash() {
    const ctx = this.ctx, { W, H } = this.layout, f = this.flash;
    const a = Math.min(1, f.ttl * 2.5);
    ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = f.big ? Math.min(60, W * 0.15) : Math.min(30, W * 0.072);
    // shrink to fit the screen width so long text (e.g. "KNOCKED OUT!") never clips
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    const maxW = W * 0.9;
    const tw = ctx.measureText(f.text).width;
    if (tw > maxW) { size *= maxW / tw; ctx.font = `900 ${size}px system-ui, sans-serif`; }
    // entrance pop with an overshoot (easeOutBack)
    const elapsed = (f.max || f.ttl) - f.ttl;
    const inP = Math.min(1, elapsed / 0.18);
    const pop = 0.72 + easeOutBack(inP) * 0.34;
    ctx.translate(W / 2, H * 0.32); ctx.scale(pop, pop);
    ctx.lineWidth = size * 0.12; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(f.text, 0, 0);
    ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
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
