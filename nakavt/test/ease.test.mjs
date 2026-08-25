import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  linear, easeInQuad, easeOutQuad, easeInOutQuad, easeOutCubic,
  easeOutBack, easeOutElastic, easeOutBounce, mix,
} from '../src/core/ease.js';

const fns = [linear, easeInQuad, easeOutQuad, easeInOutQuad, easeOutCubic, easeOutBack, easeOutElastic, easeOutBounce];

test('all easings anchor at f(0)=0 and f(1)=1', () => {
  for (const f of fns) {
    assert.ok(Math.abs(f(0) - 0) < 1e-9, `${f.name}(0)`);
    assert.ok(Math.abs(f(1) - 1) < 1e-9, `${f.name}(1)`);
  }
});

test('monotonic easings stay within [0,1]', () => {
  for (const f of [linear, easeInQuad, easeOutQuad, easeInOutQuad, easeOutCubic]) {
    for (let i = 0; i <= 10; i++) {
      const v = f(i / 10);
      assert.ok(v >= -1e-9 && v <= 1 + 1e-9, `${f.name}(${i / 10})=${v}`);
    }
  }
});

test('easeOutBack overshoots above 1 before settling', () => {
  let over = false;
  for (let i = 0; i <= 20; i++) if (easeOutBack(i / 20) > 1.02) over = true;
  assert.ok(over, 'easeOutBack should overshoot');
});

test('easeOut curves decelerate (front-loaded progress)', () => {
  // at t=0.5, an ease-out curve is already past halfway
  assert.ok(easeOutQuad(0.5) > 0.5);
  assert.ok(easeOutCubic(0.5) > 0.5);
});

test('mix interpolates linearly', () => {
  assert.equal(mix(0, 10, 0), 0);
  assert.equal(mix(0, 10, 1), 10);
  assert.equal(mix(0, 10, 0.5), 5);
});
