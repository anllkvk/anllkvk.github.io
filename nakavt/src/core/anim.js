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
  leanMax: 7,            // px of lean at full speed (was a flat 4)
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
});

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
    lean: makeDamped(0),      // smoothed signed lean in px
    lift: 0,                  // last frame's jump height, px
    liftVel: 0,               // px/s
    land: 0,                  // 1 at touchdown, decaying to 0
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
    anim.lean.v = target01 * ANIM.leanMax * facing;
    anim.lift = input.lift || 0;
    anim.ready = true;
  }

  smoothDamp(anim.speed01, target01, ANIM.speedSmooth, dt);
  smoothDamp(anim.lean, target01 * ANIM.leanMax * facing, ANIM.leanSmooth, dt);

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
