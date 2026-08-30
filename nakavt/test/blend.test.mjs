/**
 * AE6 — pose blending and turning. The acceptance is "no pose popping, smooth turns", so
 * the tests measure exactly that: the largest single-frame jump any joint makes across a
 * state change, and that a turn passes through the middle instead of flipping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLEND, makeBlendState, blendPose, updateTurn, turnScales } from '../src/core/blend.js';
import { rigDims, basePose, generatePose, makeSkeleton, resolveRig } from '../src/core/rig.js';

const dims = rigDims(1, 'normal');
const DT = 1 / 60;

/** Resolve a pose into a fresh skeleton. */
const poseSk = (name, phase = 0.3, shotT = 0) =>
  resolveRig(dims, generatePose(name, phase, 1, 1, basePose(), null, shotT), makeSkeleton());

/** The largest distance any blended joint moves in one frame across a pose change. */
function biggestJump(fromPose, toPose, { blended }) {
  const state = makeBlendState();
  let prev = null, worst = 0;
  const run = (name, frames) => {
    for (let i = 0; i < frames; i++) {
      const sk = poseSk(name);
      if (blended) blendPose(state, sk, name, DT);
      if (prev) {
        for (const g of ['shoulder', 'hand', 'hip']) {
          for (const k of ['l', 'r']) {
            worst = Math.max(worst, Math.hypot(sk[g][k].x - prev[g][k].x, sk[g][k].y - prev[g][k].y));
          }
        }
      }
      prev = JSON.parse(JSON.stringify(sk));
    }
  };
  run(fromPose, 20);
  run(toPose, 20);
  return worst;
}

test('blending removes the pop: a state change moves joints far less per frame', () => {
  const raw = biggestJump('idle', 'celebrate', { blended: false });
  const smooth = biggestJump('idle', 'celebrate', { blended: true });
  assert.ok(raw > 10, `the unblended swap should be a big jump, was ${raw.toFixed(2)}`);
  assert.ok(smooth < raw * 0.5, `blended ${smooth.toFixed(2)} should be well under raw ${raw.toFixed(2)}`);
});

test('the first pose a character ever takes is not blended in from nothing', () => {
  const state = makeBlendState();
  const sk = poseSk('idle');
  const want = { x: sk.hand.r.x, y: sk.hand.r.y };
  blendPose(state, sk, 'idle', DT);
  assert.equal(sk.hand.r.x, want.x, 'no swoop-in on the very first frame');
  assert.equal(sk.hand.r.y, want.y);
});

test('a blend completes and then leaves the pose alone', () => {
  const state = makeBlendState();
  blendPose(state, poseSk('idle'), 'idle', DT);
  for (let i = 0; i < 60; i++) blendPose(state, poseSk('celebrate'), 'celebrate', DT);
  assert.equal(state.active, false, 'the blend finished');
  const sk = poseSk('celebrate');
  const target = { x: sk.hand.r.x, y: sk.hand.r.y };
  blendPose(state, sk, 'celebrate', DT);
  assert.ok(Math.abs(sk.hand.r.x - target.x) < 1e-9, 'settled exactly on the target pose');
  assert.ok(Math.abs(sk.hand.r.y - target.y) < 1e-9);
});

test('the blend is monotonic — it never runs backwards toward the old pose', () => {
  const state = makeBlendState();
  blendPose(state, poseSk('idle'), 'idle', DT);
  const target = poseSk('celebrate').hand.r;
  let prevDist = Infinity;
  for (let i = 0; i < 30; i++) {
    const sk = poseSk('celebrate');
    blendPose(state, sk, 'celebrate', DT);
    const d = Math.hypot(sk.hand.r.x - target.x, sk.hand.r.y - target.y);
    assert.ok(d <= prevDist + 1e-9, `moved away from the target at frame ${i}`);
    prevDist = d;
  }
});

test('the FEET are never blended — the gait owns them (no re-introduced skating)', () => {
  const state = makeBlendState();
  blendPose(state, poseSk('idle'), 'idle', DT);
  const sk = poseSk('run');
  const want = { lx: sk.foot.l.x, ly: sk.foot.l.y, rx: sk.foot.r.x, ry: sk.foot.r.y };
  blendPose(state, sk, 'run', DT);
  assert.equal(sk.foot.l.x, want.lx);
  assert.equal(sk.foot.l.y, want.ly);
  assert.equal(sk.foot.r.x, want.rx);
  assert.equal(sk.foot.r.y, want.ry);
});

test('a mid-blend interruption blends from where the body actually is', () => {
  const state = makeBlendState();
  blendPose(state, poseSk('idle'), 'idle', DT);
  for (let i = 0; i < 4; i++) blendPose(state, poseSk('celebrate'), 'celebrate', DT);
  const midway = { x: state.from.hand.r.x, y: state.from.hand.r.y };
  const sk = poseSk('knockout');
  blendPose(state, sk, 'knockout', DT);
  const moved = Math.hypot(sk.hand.r.x - midway.x, sk.hand.r.y - midway.y);
  assert.ok(moved < 6, `should start from the interrupted pose, jumped ${moved.toFixed(2)}`);
});

test('TURN: the facing swings through the middle instead of flipping', () => {
  const state = makeBlendState(1);
  const seen = [];
  for (let i = 0; i < 40; i++) { updateTurn(state, -1, DT); seen.push(state.turn); }
  assert.ok(seen.some((v) => Math.abs(v) < 0.5), 'the body passes through side-on');
  assert.ok(Math.abs(state.turn - -1) < 1e-9, 'and arrives at the new facing');
});

test('TURN: it is monotonic and takes about the configured time', () => {
  const state = makeBlendState(1);
  let frames = 0, prev = 1;
  while (state.turning || frames === 0) {
    updateTurn(state, -1, DT);
    assert.ok(state.turn <= prev + 1e-9, 'the turn never reverses');
    prev = state.turn;
    if (++frames > 600) break;
  }
  const secs = frames * DT;
  assert.ok(Math.abs(secs - BLEND.turnTime) < 0.05, `took ${secs.toFixed(3)}s, expected ~${BLEND.turnTime}s`);
});

test('TURN: the shoulders trail the hips through the turn, and catch up at rest', () => {
  const state = makeBlendState(1);
  let sawLag = false;
  for (let i = 0; i < 40; i++) {
    updateTurn(state, -1, DT);
    if (state.turning && Math.abs(state.turnSh - state.turn) > 0.05) sawLag = true;
  }
  assert.ok(sawLag, 'the shoulders should be behind the hips mid-turn');
  assert.ok(Math.abs(state.turnSh - state.turn) < 1e-9, 'and level with them once it settles');
});

test('TURN: the body never collapses to zero width mid-turn', () => {
  const state = makeBlendState(1);
  for (let i = 0; i < 60; i++) {
    const t = updateTurn(state, -1, DT);
    assert.ok(Math.abs(t.hips) >= BLEND.turnMin - 1e-9, `hips scale ${t.hips} too narrow`);
    assert.ok(Math.abs(t.shoulders) >= BLEND.turnMin - 1e-9, `shoulder scale ${t.shoulders} too narrow`);
  }
});

test('TURN: settled scales are full width with the right sign', () => {
  const right = turnScales(1, 1);
  const left = turnScales(-1, -1);
  assert.equal(right.hips, 1);
  assert.equal(right.shoulders, 1);
  assert.equal(left.hips, -1);
  assert.equal(left.shoulders, -1);
});

test('TURN: holding a facing does nothing at all', () => {
  const state = makeBlendState(1);
  for (let i = 0; i < 30; i++) updateTurn(state, 1, DT);
  assert.equal(state.turn, 1);
  assert.equal(state.turnSh, 1);
  assert.equal(state.turning, false);
});

test('updateTurn writes into a caller-supplied object (no allocation per frame)', () => {
  const state = makeBlendState(1);
  const out = { hips: 0, shoulders: 0 };
  assert.equal(updateTurn(state, 1, DT, out), out);
});
