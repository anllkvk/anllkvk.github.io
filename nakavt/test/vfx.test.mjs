import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Particles } from '../src/render/particles.js';
import { Camera } from '../src/render/camera.js';

test('particles: emit activates a slot; update expires it after max life', () => {
  const p = new Particles(16);
  assert.equal(p.activeCount, 0);
  p.emit({ x: 0, y: 0, max: 0.5 });
  assert.equal(p.activeCount, 1);
  for (let i = 0; i < 40; i++) p.update(1 / 60); // ~0.66s > 0.5
  assert.equal(p.activeCount, 0, 'particle expired');
});

test('particles: burst spawns exactly n and pool never exceeds capacity', () => {
  const p = new Particles(32);
  p.burst(10, 10, 12);
  assert.equal(p.activeCount, 12);
  // overflow: request more than capacity; active count is capped at pool size
  p.burst(0, 0, 100);
  assert.ok(p.activeCount <= 32, 'never exceeds pool capacity');
});

test('particles: allocation-free — pool array length is fixed', () => {
  const p = new Particles(20);
  const before = p.pool.length;
  for (let k = 0; k < 5; k++) { p.burst(0, 0, 30); for (let i = 0; i < 30; i++) p.update(0.05); }
  assert.equal(p.pool.length, before, 'pool size stays constant (no growth)');
});

test('particles: clear deactivates everything', () => {
  const p = new Particles(16);
  p.burst(0, 0, 8);
  p.clear();
  assert.equal(p.activeCount, 0);
});

test('camera: zoomTo eases the base zoom toward the target', () => {
  const c = new Camera(390, 844);
  c.zoomTo(1.2, 3);
  const z0 = c.baseZoom;
  for (let i = 0; i < 60; i++) c.update(1 / 60);
  assert.ok(c.baseZoom > z0 && c.baseZoom <= 1.2 + 1e-6);
  assert.ok(Math.abs(c.baseZoom - 1.2) < 0.02, 'converges near target within 1s');
});

test('camera: punch adds transient zoom that decays back to base', () => {
  const c = new Camera(390, 844);
  c.punch(0.06);
  assert.ok(c.zoom > 1.0, 'punch raises effective zoom immediately');
  for (let i = 0; i < 60; i++) c.update(1 / 60);
  assert.ok(c.punchAmt < 0.005, 'punch decays away');
});

test('camera: shake produces bounded offsets and settles to zero', () => {
  const c = new Camera(390, 844);
  c.shake(8, 0.2);
  let maxOff = 0;
  for (let i = 0; i < 6; i++) { c.update(1 / 60); maxOff = Math.max(maxOff, Math.abs(c.ox), Math.abs(c.oy)); }
  assert.ok(maxOff <= 8 + 1e-9, 'offset within amplitude');
  for (let i = 0; i < 30; i++) c.update(1 / 60);
  assert.equal(c.ox, 0); assert.equal(c.oy, 0);
});

test('camera: reset restores neutral state', () => {
  const c = new Camera(390, 844);
  c.zoomTo(1.3); c.punch(0.1); c.update(0.1);
  c.reset();
  assert.equal(c.targetZoom, 1); assert.equal(c.baseZoom, 1); assert.equal(c.punchAmt, 0);
});
