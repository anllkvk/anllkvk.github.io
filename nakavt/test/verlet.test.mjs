/**
 * AE7 — Verlet strands for jersey/hair secondary motion. The properties that matter are
 * that it stays attached, keeps its length, settles when left alone, and trails the body
 * rather than leading it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { VERLET, makeStrand, resetStrand, updateStrand, strandLength } from '../src/core/verlet.js';

const DT = 1 / 60;
const settle = (s, x, y, frames = 200, wind = 0) => {
  for (let i = 0; i < frames; i++) updateStrand(s, x, y, DT, wind);
  return s;
};

test('a new strand hangs straight down from its anchor', () => {
  const s = makeStrand(4, 5, 10, 20);
  assert.equal(s.pts[0].x, 10);
  assert.equal(s.pts[0].y, 20);
  assert.equal(s.pts[3].y, 20 + 3 * 5);
  assert.ok(Math.abs(strandLength(s) - 3 * 5) < 1e-9);
});

test('the anchor is pinned exactly where it is put', () => {
  const s = makeStrand(4, 5);
  updateStrand(s, 77, -33, DT);
  assert.equal(s.pts[0].x, 77);
  assert.equal(s.pts[0].y, -33);
  settle(s, 77, -33, 50);
  assert.equal(s.pts[0].x, 77);
  assert.equal(s.pts[0].y, -33);
});

test('the strand keeps its length EXACTLY while being whipped around', () => {
  const s = makeStrand(5, 6, 0, 0);
  const want = 4 * 6;
  for (let i = 0; i < 300; i++) {
    updateStrand(s, Math.sin(i * 0.3) * 40, Math.cos(i * 0.21) * 25, DT, Math.sin(i * 0.4) * 900);
    const len = strandLength(s);
    assert.ok(Math.abs(len - want) < 1e-6, `length drifted to ${len.toFixed(4)} (want exactly ${want})`);
  }
});

test('left alone it settles hanging below the anchor', () => {
  const s = makeStrand(4, 6, 0, 0);
  settle(s, 0, 0, 400);
  const tip = s.pts[3];
  assert.ok(Math.abs(tip.x) < 0.5, `should hang straight, x=${tip.x}`);
  assert.ok(tip.y > 0, 'and below the anchor');
});

test('it comes to rest — no perpetual jitter', () => {
  const s = makeStrand(4, 6, 0, 0);
  settle(s, 0, 0, 400);
  const before = { x: s.pts[3].x, y: s.pts[3].y };
  settle(s, 0, 0, 30);
  const moved = Math.hypot(s.pts[3].x - before.x, s.pts[3].y - before.y);
  assert.ok(moved < 0.05, `still twitching by ${moved.toFixed(4)}px`);
});

test('the strand TRAILS the anchor rather than leading it', () => {
  const s = makeStrand(4, 6, 0, 0);
  settle(s, 0, 0, 200);
  // yank the anchor to the right; the tip should still be behind it
  for (let i = 0; i < 6; i++) updateStrand(s, i * 8, 0, DT);
  assert.ok(s.pts[3].x < s.pts[0].x, 'the tip lags behind the anchor it is being dragged by');
});

test('wind pushes the strand the way it blows', () => {
  const left = makeStrand(4, 6, 0, 0);
  const right = makeStrand(4, 6, 0, 0);
  settle(left, 0, 0, 60, -1200);
  settle(right, 0, 0, 60, 1200);
  assert.ok(left.pts[3].x < 0, 'blown left');
  assert.ok(right.pts[3].x > 0, 'blown right');
});

test('a huge timestep cannot explode the simulation', () => {
  const s = makeStrand(4, 6, 0, 0);
  for (let i = 0; i < 20; i++) updateStrand(s, 0, 0, 5, 0); // 5-second steps
  for (const p of s.pts) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'points stayed finite');
  }
  const len = strandLength(s);
  assert.ok(len < 3 * 6 * 2, `length stayed sane at ${len.toFixed(2)}`);
});

test('a zero or negative timestep is a no-op', () => {
  const s = makeStrand(4, 6, 3, 4);
  settle(s, 3, 4, 30);
  const snap = s.pts.map((p) => ({ x: p.x, y: p.y }));
  updateStrand(s, 3, 4, 0);
  updateStrand(s, 3, 4, -1);
  s.pts.forEach((p, i) => {
    assert.equal(p.x, snap[i].x);
    assert.equal(p.y, snap[i].y);
  });
});

test('resetStrand re-pins it with no motion', () => {
  const s = makeStrand(4, 6, 0, 0);
  settle(s, 0, 0, 60, 900);
  resetStrand(s, 100, 50);
  assert.equal(s.pts[0].x, 100);
  assert.equal(s.pts[3].y, 50 + 3 * 6);
  for (const p of s.pts) {
    assert.equal(p.x, p.px, 'no residual velocity');
    assert.equal(p.y, p.py);
  }
});

test('updateStrand allocates nothing per frame', () => {
  const s = makeStrand(4, 6);
  const pts = s.pts.slice();
  updateStrand(s, 1, 2, DT);
  s.pts.forEach((p, i) => assert.equal(p, pts[i], 'points are mutated, not replaced'));
});
