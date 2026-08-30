/**
 * Momentum layer for the character animation engine (AE2).
 *
 * The frame analysis (docs/CHARACTER_ANIMATION_R&D.md §1.0) says the reference reads real
 * because the body carries momentum: it leans into acceleration, the stride grows with
 * speed, the limbs trail the torso, and every landing is absorbed. None of that is a pose —
 * it is state that persists between frames. This module owns that state.
 *
 * Everything here is pure math on caller-owned objects: no canvas, no DOM, no allocation
 * per frame. Original implementations of public-domain algorithms (critically-damped
 * spring / "SmoothDamp", Game Programming Gems 4); see docs/OSS_ADOPTIONS.md.
 */

/** Animation-engine tuning. Cosmetic only — none of this touches gameplay. */
export const ANIM = Object.freeze({
  speedSmooth: 0.14,     // s, how fast the body "believes" a speed change
  leanSmooth: 0.10,      // s, lean settles slightly faster than speed
  // AE10: lean is no longer one number times speed. The reference uses a different torso
  // angle for walking, running, sprinting, accelerating and braking, and a single
  // speed-proportional shift cannot say any of that. Speed sets the baseline (superlinear,
  // so a sprint is distinctly more than a jog rather than just a bit more), acceleration
  // adds to it, and braking subtracts — hard enough to bring the body back upright over
  // the feet, which is what a stop actually looks like.
  leanMax: 10,           // px of lean at a steady full sprint
  leanCurve: 1.2,        // >1 so the lean arrives late, at the sprint end of the range
  leanAccel: 5.5,        // px of extra lean while actively gaining speed
  leanBrake: 11,         // px removed while braking — enough to go past upright
  accelRef: 1500,        // px/s^2 that counts as full acceleration
  accelRelease: 0.20,    // s, how slowly the lean-into-a-start unwinds
  strideMin: 0.45,       // stride amplitude at a crawl
  strideMax: 1.25,       // stride amplitude at full speed
  cadenceMin: 9,         // stride Hz at a crawl
  cadenceMax: 16,        // stride Hz at full speed
  handLagSmooth: 0.055,  // s, how far the hands trail their target (follow-through)
  handLagMax: 9,         // px, cap so a big pose change cannot smear the arm
  stretchApex: 0.10,     // vertical stretch while rising/at apex
  squashLand: 0.18,      // vertical squash on touchdown
  landTime: 0.20,        // s, how long the landing squash takes to unwind
  liftVelRef: 90,        // px/s of lift that counts as "fully rising"
  armReach: 0.86,        // fraction of full arm length a locomotion hand may reach
  brakeRelease: 0.26,    // s, how slowly the braking crouch stands back up (AE3)
  brakeRef: 2600,        // px/s^2 of deceleration that counts as a full stop (AE3)
});

/**
 * Signed lean in px for a given speed / acceleration / braking state (AE10).
 *
 *   idle          0
 *   walk, run     the speed baseline, curved so it arrives at the sprint end
 *   acceleration  baseline + an acceleration term: leaning into the start
 *   sprint        the full baseline
 *   deceleration  the brake term pulls the body back over its feet...
 *   stop          ...and past upright for an instant, which is the recovery
 *
 * Exported so a test can assert the ORDERING of those states rather than the constants.
 */
export function leanTarget(speed01, accel01, brake01, facing) {
  const base = Math.pow(Math.max(0, speed01), ANIM.leanCurve) * ANIM.leanMax;
  return (base + accel01 * ANIM.leanAccel - brake01 * ANIM.leanBrake) * facing;
}

/** A damped scalar: current value + its spring velocity. */
export function makeDamped(value = 0) {
  return { v: value, vel: 0 };
}

/**
 * Critically-damped spring toward `target` (the classic SmoothDamp). Mutates `d` and
 * returns the new value. Never overshoots, and is stable at any dt.
 */
export function smoothDamp(d, target, smoothTime, dt, maxSpeed = Infinity) {
  if (dt <= 0) return d.v;
  const st = Math.max(1e-4, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  // Padé approximation of exp(-x): cheaper than Math.exp and accurate over our range.
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const goal = target;
  let change = d.v - target;
  const maxChange = maxSpeed * st;
  change = Math.max(-maxChange, Math.min(maxChange, change));
  target = d.v - change;
  const temp = (d.vel + omega * change) * dt;
  d.vel = (d.vel - omega * temp) * exp;
  let out = target + (change + temp) * exp;
  // Clamp the overshoot the approximation can produce near the goal.
  if ((goal - d.v > 0) === (out > goal)) {
    out = goal;
    d.vel = (out - goal) / dt;
  }
  d.v = out;
  return out;
}

/** Per-character animation state. Create once per entity, update once per frame. */
export function makeAnimState() {
  return {
    speed01: makeDamped(0),   // smoothed 0..1 speed — drives lean, stride, cadence
    accel01: makeDamped(0),   // smoothed 0..1 acceleration — the extra lean into a start
    lean: makeDamped(0),      // smoothed signed lean in px
    lift: 0,                  // last frame's jump height, px
    liftVel: 0,               // px/s
    land: 0,                  // 1 at touchdown, decaying to 0
    brake: makeDamped(0),     // 0..1 how hard the character is decelerating (AE3)
    stance: null,             // { stanceWidth, hipDrop } from gait.brakeStance(), set by the caller
    rawSpeed: 0,              // last frame's unsmoothed speed, for the brake signal
    sx: 1,                    // squash/stretch, applied by the renderer
    sy: 1,
    hand: {                   // damped hand positions — the limb lag / follow-through
      l: { x: makeDamped(0), y: makeDamped(0) },
      r: { x: makeDamped(0), y: makeDamped(0) },
    },
    // The caller attaches a rig skeleton here (makeSkeleton()) so each character keeps
    // its own resolved joints frame to frame — the limb lag needs that continuity.
    sk: null,
    ready: false,             // false until the first frame seeds the damped values
    handReady: false,         // same, for the limb lag (seeded on the first *draw*)
  };
}

/**
 * Advance the momentum state one frame.
 *
 * `input` = { speed, maxSpeed, facing, lift } in gameplay units. Returns `anim`.
 */
export function updateAnim(anim, input, dt) {
  const maxSpeed = input.maxSpeed || 1;
  const target01 = Math.max(0, Math.min(1, (input.speed || 0) / maxSpeed));
  const facing = input.facing || 1;

  if (!anim.ready) {
    // Seed on the first frame so a character never swoops in from a stale pose.
    anim.speed01.v = target01;
    anim.lean.v = leanTarget(target01, 0, 0, facing);
    anim.lift = input.lift || 0;
    anim.rawSpeed = input.speed || 0;
    anim.ready = true;
  }

  smoothDamp(anim.speed01, target01, ANIM.speedSmooth, dt);

  // Braking: how hard the character is shedding speed. AE3 turns this into the wide, low,
  // both-feet-planted stop the reference actually uses (doc 1.0 finding 2).
  //
  // This is an attack/release envelope, not a plain damp. A stop is an *impulse* — the
  // deceleration exists for a frame or two and is then gone — so damping toward it would
  // barely register. Instead the crouch snaps on and unwinds slowly, which is also how the
  // real motion works: you drop fast and stand back up gradually.
  const speed = input.speed || 0;
  const prevSpeed = anim.rawSpeed;
  const decel = dt > 0 ? Math.max(0, (anim.rawSpeed - speed) / dt) : 0;
  anim.rawSpeed = speed;
  const hit = Math.min(1, decel / ANIM.brakeRef);
  if (hit > anim.brake.v) { anim.brake.v = hit; anim.brake.vel = 0; }
  else smoothDamp(anim.brake, 0, ANIM.brakeRelease, dt);

  // Acceleration, as a 0..1 of how hard the body is gaining speed. Only the positive half:
  // shedding speed is the brake envelope's job above.
  //
  // Like the brake, this is an attack/release envelope rather than a damp, and for the same
  // reason — a change of speed is an IMPULSE. It exists for a frame or two and is then
  // gone, so a value damping TOWARD it never gets anywhere near it (measured: 0.10 of a
  // full-scale start). Snapping up and unwinding slowly is also the real shape: you lean
  // into the first strides of a run and straighten up as it settles.
  const accel = dt > 0 ? (speed - prevSpeed) / dt : 0;
  const gain = Math.max(0, Math.min(1, accel / ANIM.accelRef));
  if (gain > anim.accel01.v) { anim.accel01.v = gain; anim.accel01.vel = 0; }
  else smoothDamp(anim.accel01, 0, ANIM.accelRelease, dt);
  // Lean now depends on the brake envelope, so it is resolved here rather than above.
  smoothDamp(anim.lean, leanTarget(anim.speed01.v, anim.accel01.v, anim.brake.v, facing), ANIM.leanSmooth, dt);

  // Vertical momentum: stretch while rising, squash on touchdown.
  const lift = input.lift || 0;
  anim.liftVel = dt > 0 ? (lift - anim.lift) / dt : 0;
  const wasAirborne = anim.lift > 0.5;
  anim.lift = lift;
  if (wasAirborne && lift <= 0.5) anim.land = 1;
  anim.land = Math.max(0, anim.land - dt / ANIM.landTime);

  const rise = Math.max(0, Math.min(1, anim.liftVel / ANIM.liftVelRef));
  const stretch = rise * ANIM.stretchApex;
  const squash = anim.land * ANIM.squashLand;
  anim.sy = 1 + stretch - squash;
  anim.sx = 1 - stretch * 0.7 + squash * 0.7;
  return anim;
}

/** Stride amplitude for the current speed (1 = the old fixed amplitude). */
export function strideScale(anim) {
  return ANIM.strideMin + (ANIM.strideMax - ANIM.strideMin) * anim.speed01.v;
}

/** Stride cadence in Hz for the current speed. */
export function strideCadence(anim) {
  return ANIM.cadenceMin + (ANIM.cadenceMax - ANIM.cadenceMin) * anim.speed01.v;
}

/**
 * Clamp a hand target so the elbow never straightens.
 *
 * Frame finding §1.0-6: through the whole reference the arms hold a bend and swing from
 * the shoulder; a fully extended arm is what makes procedural running read as flailing.
 * Mutates `hand` and returns it.
 */
export function clampReach(shoulder, hand, armLength, frac = ANIM.armReach) {
  const dx = hand.x - shoulder.x, dy = hand.y - shoulder.y;
  const d = Math.hypot(dx, dy);
  const max = armLength * frac;
  if (d > max && d > 1e-6) {
    hand.x = shoulder.x + (dx / d) * max;
    hand.y = shoulder.y + (dy / d) * max;
  }
  return hand;
}

/**
 * Secondary motion: let the hands trail their rig targets by a damped offset, so the arms
 * lag the torso and hold through after a fast move. Mutates `sk.hand` in place.
 */
export function applyLimbLag(anim, sk, dt) {
  // Seeded independently of anim.ready: updateAnim runs before the first draw, so keying
  // off that flag would leave the damped hands sitting at the origin and swooping in.
  const seed = !anim.handReady;
  anim.handReady = true;
  for (const k of ['l', 'r']) {
    const target = sk.hand[k], d = anim.hand[k];
    if (seed) { d.x.v = target.x; d.y.v = target.y; d.x.vel = 0; d.y.vel = 0; }
    smoothDamp(d.x, target.x, ANIM.handLagSmooth, dt);
    smoothDamp(d.y, target.y, ANIM.handLagSmooth, dt);
    // Cap the trailing distance: a pose swap should lag, never smear.
    const ox = d.x.v - target.x, oy = d.y.v - target.y;
    const o = Math.hypot(ox, oy);
    if (o > ANIM.handLagMax) {
      d.x.v = target.x + (ox / o) * ANIM.handLagMax;
      d.y.v = target.y + (oy / o) * ANIM.handLagMax;
    }
    target.x = d.x.v;
    target.y = d.y.v;
  }
  return sk;
}
