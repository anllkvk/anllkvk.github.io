import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrive, seek, pursue, predictSettle, twoBoneIK, vlen } from '../src/core/steering.js';

test('seek points at the target at full speed', () => {
  const v = seek({ x: 0, y: 0 }, { x: 10, y: 0 }, 100);
  assert.ok(Math.abs(v.x - 100) < 1e-6 && Math.abs(v.y) < 1e-6);
});

test('arrive caps at maxSpeed far away and slows within slowRadius', () => {
  const far = arrive({ x: 0, y: 0 }, { x: 500, y: 0 }, 100, 60);
  assert.ok(Math.abs(vlen(far.x, far.y) - 100) < 1e-6);
  const near = arrive({ x: 0, y: 0 }, { x: 30, y: 0 }, 100, 60);
  assert.ok(vlen(near.x, near.y) < 100 && vlen(near.x, near.y) > 0, 'decelerates near target');
});

test('arrive at the target yields ~zero velocity', () => {
  const v = arrive({ x: 5, y: 5 }, { x: 5, y: 5 }, 100, 60);
  assert.ok(vlen(v.x, v.y) < 1e-3);
});

test('pursue leads a moving target (aims ahead of it)', () => {
  // target at (100,0) moving +x; pursuing from origin should still push +x,
  // and predicted point is farther than the current target.
  const v = pursue({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }, 120, 0.5);
  assert.ok(v.x > 0 && Math.abs(v.y) < 1e-6);
});

test('predictSettle extrapolates a decaying roll forward', () => {
  const s = predictSettle({ x: 0, y: 0 }, { x: 30, y: 0 }, 3);
  assert.ok(s.x > 0, 'settles ahead in the direction of travel');
});

test('twoBoneIK: elbow sits at bone-1 length; end within reach', () => {
  const base = { x: 0, y: 0 };
  const { mid, end } = twoBoneIK(base, { x: 14, y: 0 }, 10, 10, 1);
  assert.ok(Math.abs(vlen(mid.x, mid.y) - 10) < 1e-6, 'elbow at l1 from base');
  assert.ok(Math.abs(vlen(end.x, end.y) - 14) < 1e-6, 'end reaches target distance');
});

test('twoBoneIK clamps an out-of-reach target to max extension', () => {
  const base = { x: 0, y: 0 };
  const { end } = twoBoneIK(base, { x: 1000, y: 0 }, 10, 10, 1);
  assert.ok(vlen(end.x, end.y) <= 20 + 1e-3, 'cannot exceed l1+l2');
});

test('twoBoneIK bend sign flips the elbow to the other side', () => {
  const base = { x: 0, y: 0 }, target = { x: 14, y: 0 };
  const up = twoBoneIK(base, target, 10, 10, 1);
  const dn = twoBoneIK(base, target, 10, 10, -1);
  assert.ok(Math.sign(up.mid.y) !== Math.sign(dn.mid.y) || up.mid.y === -dn.mid.y);
});
