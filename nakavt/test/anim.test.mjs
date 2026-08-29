/**
 * AE2 — momentum layer. Covers the critically-damped spring, the per-character momentum
 * state (speed -> lean / stride / cadence), squash-stretch from vertical motion, the
 * elbow-reach clamp and the limb lag that gives follow-through.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANIM, makeDamped, smoothDamp, makeAnimState, updateAnim,
  strideScale, strideCadence, clampReach, applyLimbLag,
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
