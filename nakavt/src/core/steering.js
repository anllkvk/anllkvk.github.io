/**
 * Steering behaviors (Craig Reynolds, 1999) + a small 2-bone IK solver — original
 * implementations of public-domain algorithms. Pure vector math, no DOM, unit-tested.
 * Used to give AI real rebound-chasing movement and to pose articulated limbs.
 */

const len = (x, y) => Math.hypot(x, y);

/**
 * Arrive: desired velocity toward `target`, decelerating within `slowRadius`.
 * Returns a velocity vector (magnitude ≤ maxSpeed).
 */
export function arrive(pos, target, maxSpeed, slowRadius = 60) {
  const dx = target.x - pos.x, dy = target.y - pos.y;
  const d = len(dx, dy);
  if (d < 1e-4) return { x: 0, y: 0 };
  const speed = d < slowRadius ? maxSpeed * (d / slowRadius) : maxSpeed;
  return { x: (dx / d) * speed, y: (dy / d) * speed };
}

/** Seek: full-speed desired velocity toward a target (no slowdown). */
export function seek(pos, target, maxSpeed) {
  const dx = target.x - pos.x, dy = target.y - pos.y;
  const d = len(dx, dy) || 1;
  return { x: (dx / d) * maxSpeed, y: (dy / d) * maxSpeed };
}

/**
 * Pursue: intercept a moving target by aiming at its predicted position.
 * `lead` scales how far ahead to predict (seconds-ish).
 */
export function pursue(pos, target, targetVel, maxSpeed, lead = 0.4) {
  const predicted = { x: target.x + targetVel.x * lead, y: target.y + targetVel.y * lead };
  return arrive(pos, predicted, maxSpeed, 40);
}

/**
 * Predict where a ballistic ground target settles: given a position, planar velocity
 * and a per-second friction (0..1 retained/sec), the eventual resting point.
 * settle = pos + vel/friction_decay. Simple, good enough for rebound targeting.
 */
export function predictSettle(pos, vel, damping = 3.0) {
  // x(t)=x0+v/k*(1-e^{-kt}); as t→∞ → x0 + v/k
  return { x: pos.x + vel.x / damping, y: pos.y + vel.y / damping };
}

/**
 * 2-bone inverse kinematics in 2D. Solve elbow/knee (mid joint) so the chain
 * base→mid→end reaches `target` (clamped to reachable range). `bend` = +1/-1 chooses
 * which way the joint flexes. Returns { mid, end }.
 */
export function twoBoneIK(base, target, l1, l2, bend = 1) {
  let dx = target.x - base.x, dy = target.y - base.y;
  let d = len(dx, dy);
  const dmax = l1 + l2 - 1e-3, dmin = Math.abs(l1 - l2) + 1e-3;
  d = Math.max(dmin, Math.min(dmax, d));
  const a = Math.atan2(dy, dx);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const angA = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const mid = { x: base.x + Math.cos(a + bend * angA) * l1, y: base.y + Math.sin(a + bend * angA) * l1 };
  const end = { x: base.x + Math.cos(a) * d, y: base.y + Math.sin(a) * d };
  return { mid, end };
}

export const vlen = len;
