/**
 * AE2 — momentum layer. Covers the critically-damped spring, the per-character momentum
 * state (speed -> lean / stride / cadence), squash-stretch from vertical motion, the
 * elbow-reach clamp and the limb lag that gives follow-through.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIM, makeDamped, smoothDamp, makeAnimState, updateAnim,
  strideScale, strideCadence, clampReach, applyLimbLag, leanTarget,
} from '../src/core/anim.js';
import { makeSkeleton } from '../src/core/rig.js';

const step = (fn, n, dt = 1 / 60) => { for (let i = 0; i < n; i++) fn(dt); };

test('smoothDamp converges to the target and settles', () => {
  const d = makeDamped(0);
  step((dt) => smoothDamp(d, 10, 0.1, dt), 120);
  assert.ok(Math.abs(d.v - 10) < 1e-3, `converged to ${d.v}`);
  assert.ok(Math.abs(d.vel) < 1e-2, 'spring velocity settles');
});

test('smoothDamp never overshoots the target', () => {
  const d = makeDamped(0);
  let maxSeen = 0;
  step((dt) => { maxSeen = Math.max(maxSeen, smoothDamp(d, 1, 0.08, dt)); }, 200);
  assert.ok(maxSeen <= 1 + 1e-9, `overshot to ${maxSeen}`);
});

test('smoothDamp: a shorter smoothTime converges faster', () => {
  const fast = makeDamped(0), slow = makeDamped(0);
  step((dt) => { smoothDamp(fast, 1, 0.05, dt); smoothDamp(slow, 1, 0.4, dt); }, 10);
  assert.ok(fast.v > slow.v, `${fast.v} should lead ${slow.v}`);
});

test('smoothDamp is a no-op on a zero timestep', () => {
  const d = makeDamped(3);
  assert.equal(smoothDamp(d, 99, 0.1, 0), 3);
  assert.equal(d.v, 3);
});

test('updateAnim seeds on the first frame instead of swooping in', () => {
  const a = makeAnimState();
  updateAnim(a, { speed: 200, maxSpeed: 200, facing: 1, lift: 0 }, 1 / 60);
  assert.ok(a.ready);
  assert.ok(a.speed01.v > 0.9, `seeded to ${a.speed01.v}, not 0`);
});

test('speed drives lean, and the lean follows facing', () => {
  const right = makeAnimState(), left = makeAnimState();
  step((dt) => {
    updateAnim(right, { speed: 220, maxSpeed: 220, facing: 1, lift: 0 }, dt);
    updateAnim(left, { speed: 220, maxSpeed: 220, facing: -1, lift: 0 }, dt);
  }, 60);
  assert.ok(right.lean.v > 0, 'leans toward +x when facing right');
  assert.ok(left.lean.v < 0, 'leans toward -x when facing left');
  assert.ok(Math.abs(right.lean.v) > 1, 'a full-speed lean is substantial');
});

test('lean is proportional to speed, not just on/off', () => {
  const slow = makeAnimState(), fast = makeAnimState();
  step((dt) => {
    updateAnim(slow, { speed: 60, maxSpeed: 220, facing: 1, lift: 0 }, dt);
    updateAnim(fast, { speed: 220, maxSpeed: 220, facing: 1, lift: 0 }, dt);
  }, 60);
  assert.ok(fast.lean.v > slow.lean.v * 2, 'a sprint leans much further than a jog');
});

test('momentum outlives the input: the lean decays rather than snapping', () => {
  const a = makeAnimState();
  step((dt) => updateAnim(a, { speed: 220, maxSpeed: 220, facing: 1, lift: 0 }, dt), 60);
  const running = a.lean.v;
  updateAnim(a, { speed: 0, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
  assert.ok(a.lean.v > 0, 'still leaning one frame after the input stops');
  assert.ok(a.lean.v < running, 'but already unwinding');
});

test('stride amplitude and cadence both scale with speed', () => {
  const slow = makeAnimState(), fast = makeAnimState();
  step((dt) => {
    updateAnim(slow, { speed: 40, maxSpeed: 220, facing: 1, lift: 0 }, dt);
    updateAnim(fast, { speed: 220, maxSpeed: 220, facing: 1, lift: 0 }, dt);
  }, 60);
  assert.ok(strideScale(fast) > strideScale(slow), 'longer stride at speed');
  assert.ok(strideCadence(fast) > strideCadence(slow), 'faster cadence at speed');
  assert.ok(strideScale(slow) >= ANIM.strideMin - 1e-9);
  assert.ok(strideScale(fast) <= ANIM.strideMax + 1e-9);
});

test('rising stretches the body; touching down squashes it', () => {
  const a = makeAnimState();
  updateAnim(a, { speed: 0, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
  updateAnim(a, { speed: 0, maxSpeed: 220, facing: 1, lift: 6 }, 1 / 60);
  assert.ok(a.sy > 1, `rising should stretch, got sy=${a.sy}`);
  assert.ok(a.sx < 1, 'and narrow');

  // now come back down and land
  updateAnim(a, { speed: 0, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
  assert.ok(a.sy < 1, `landing should squash, got sy=${a.sy}`);
  assert.ok(a.sx > 1, 'and widen');
});

test('the landing squash unwinds back to neutral', () => {
  const a = makeAnimState();
  updateAnim(a, { speed: 0, maxSpeed: 220, facing: 1, lift: 10 }, 1 / 60);
  updateAnim(a, { speed: 0, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
  assert.ok(a.sy < 1);
  step((dt) => updateAnim(a, { speed: 0, maxSpeed: 220, facing: 1, lift: 0 }, dt), 40);
  assert.ok(Math.abs(a.sy - 1) < 1e-6, `settled to ${a.sy}`);
  assert.ok(Math.abs(a.sx - 1) < 1e-6);
});

test('clampReach pulls an over-extended hand back inside the arm', () => {
  const shoulder = { x: 0, y: 0 };
  const hand = { x: 100, y: 0 };
  clampReach(shoulder, hand, 20, 0.9);
  assert.ok(Math.abs(Math.hypot(hand.x, hand.y) - 18) < 1e-9, `clamped to ${hand.x}`);
});

test('clampReach leaves a hand that is already inside the arm alone', () => {
  const shoulder = { x: 0, y: 0 };
  const hand = { x: 3, y: 4 };
  clampReach(shoulder, hand, 20, 0.9);
  assert.equal(hand.x, 3);
  assert.equal(hand.y, 4);
});

test('clampReach preserves the direction of the reach', () => {
  const shoulder = { x: 5, y: 5 };
  const hand = { x: 5, y: 105 };
  clampReach(shoulder, hand, 20, 0.5);
  assert.equal(hand.x, 5, 'straight down stays straight down');
  assert.ok(hand.y > 5, 'and still below the shoulder');
});

test('limb lag makes the hands trail a moving target (follow-through)', () => {
  const a = makeAnimState();
  const sk = makeSkeleton();
  sk.hand.r.x = 0; sk.hand.r.y = 0;
  applyLimbLag(a, sk, 1 / 60);          // seeds on the first frame
  // (the first applyLimbLag call above seeded the damped hands)
  sk.hand.r.x = 40; sk.hand.r.y = 0;    // target jumps away
  applyLimbLag(a, sk, 1 / 60);
  assert.ok(sk.hand.r.x < 40, 'the drawn hand has not caught up yet');
  assert.ok(sk.hand.r.x > 0, 'but it is on its way');
});

test('limb lag seeds on the first draw even though updateAnim already ran', () => {
  // Regression: the lag used to seed off anim.ready, which updateAnim sets before any
  // draw happens — so the damped hands started at the origin and swooped into place.
  const a = makeAnimState();
  updateAnim(a, { speed: 100, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
  assert.ok(a.ready, 'updateAnim has already marked the momentum state ready');
  const sk = makeSkeleton();
  sk.hand.r.x = -31; sk.hand.r.y = 12;
  sk.hand.l.x = 17; sk.hand.l.y = -4;
  applyLimbLag(a, sk, 1 / 60);
  assert.equal(sk.hand.r.x, -31, 'the first draw puts the hand exactly on target');
  assert.equal(sk.hand.r.y, 12);
  assert.equal(sk.hand.l.x, 17);
  assert.equal(sk.hand.l.y, -4);
});

test('limb lag caps how far a hand may trail, so a pose swap cannot smear the arm', () => {
  const a = makeAnimState();
  const sk = makeSkeleton();
  applyLimbLag(a, sk, 1 / 60);
  // (the first applyLimbLag call above seeded the damped hands)
  sk.hand.l.x = 10000; sk.hand.l.y = 0;
  const target = { x: 10000, y: 0 };
  applyLimbLag(a, sk, 1 / 60);
  const trail = Math.hypot(sk.hand.l.x - target.x, sk.hand.l.y - target.y);
  assert.ok(trail <= ANIM.handLagMax + 1e-9, `trailed ${trail}, cap ${ANIM.handLagMax}`);
});

test('limb lag converges: a held pose ends up exactly on target', () => {
  const a = makeAnimState();
  const sk = makeSkeleton();
  applyLimbLag(a, sk, 1 / 60);
  // (the first applyLimbLag call above seeded the damped hands)
  for (let i = 0; i < 120; i++) { sk.hand.r.x = 25; sk.hand.r.y = -8; applyLimbLag(a, sk, 1 / 60); }
  assert.ok(Math.abs(sk.hand.r.x - 25) < 1e-3, `settled at ${sk.hand.r.x}`);
  assert.ok(Math.abs(sk.hand.r.y + 8) < 1e-3);
});

test('AE10: lean is a different angle for each locomotion state', () => {
  // A single speed-proportional number cannot distinguish a jog from a sprint from a hard
  // start from a stop; the reference plainly uses a different torso angle for each. Assert
  // the ORDERING rather than the constants, so the feel can be tuned without breaking this.
  const L = (s, a, b) => leanTarget(s, a, b, 1);
  const idle = L(0, 0, 0), walk = L(0.35, 0, 0), run = L(0.7, 0, 0), sprint = L(1, 0, 0);

  assert.equal(idle, 0, 'a standing body does not lean');
  assert.ok(walk > idle && run > walk && sprint > run, `not monotonic: ${walk}, ${run}, ${sprint}`);
  // superlinear: the second half of the speed range must add more lean than the first,
  // or a sprint just looks like a slightly faster jog
  assert.ok(sprint - run > run - idle - (run - walk), 'lean arrives linearly, so sprint reads like a jog');

  // Accelerating leans further than holding the same speed...
  assert.ok(L(0.6, 1, 0) > L(0.6, 0, 0), 'no extra lean into an acceleration');
  assert.ok(L(0.6, 1, 0) > sprint * 0.95, 'the start of a run should lean like a sprint');
  // ...and braking brings the body back over its feet, past upright.
  assert.ok(L(0.7, 0, 0.6) < walk, 'braking does not straighten the body');
  assert.ok(L(0.2, 0, 1) < 0, 'a hard stop should settle the mass BEHIND the feet');

  // Direction follows facing, always.
  assert.ok(leanTarget(1, 0, 0, -1) < 0, 'lean does not mirror with facing');
});

test('AE10: acceleration is tracked, and only its positive half', () => {
  const anim = makeAnimState();
  updateAnim(anim, { speed: 0, maxSpeed: 200, facing: 1, lift: 0 }, 1 / 60);
  for (let i = 0; i < 6; i++) updateAnim(anim, { speed: 200, maxSpeed: 200, facing: 1, lift: 0 }, 1 / 60);
  assert.ok(anim.accel01.v > 0.2, `accelerating hard registered only ${anim.accel01.v.toFixed(2)}`);
  // Slowing down must never RAISE the acceleration channel — shedding speed is the brake
  // envelope's job. The envelope releases rather than snapping, so the property to assert
  // is that it only ever falls from here, and has unwound once the release is over.
  let prev = anim.accel01.v, peakBrake = 0;
  for (let i = 0; i < 40; i++) {
    updateAnim(anim, { speed: 0, maxSpeed: 200, facing: 1, lift: 0 }, 1 / 60);
    assert.ok(anim.accel01.v <= prev + 1e-9, 'deceleration re-attacked the acceleration channel');
    prev = anim.accel01.v;
    peakBrake = Math.max(peakBrake, anim.brake.v);
  }
  assert.ok(anim.accel01.v < 0.05, 'accel01 is still up well past its release: ' + anim.accel01.v.toFixed(2));
  // The brake is an envelope too: it fires ON the stop and releases. Its PEAK across the
  // window is the signal, not its value once the body has been standing still for 0.67s.
  assert.ok(peakBrake > 0.1, 'the brake envelope did not fire on a hard stop');
  assert.ok(anim.brake.v < 0.05, 'the brake envelope never released');
});
