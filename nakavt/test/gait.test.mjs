/**
 * AE3 — foot planting and the step cycle. The headline acceptance is "no foot-skating":
 * the planted foot must stay exactly where it was put down while the body travels over it.
 * Also covers the step trigger, the swing arc, the ankle angle (frame finding 1.0-1) and
 * the braking stance (finding 1.0-2).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAIT, makeGaitState, updateGait, gaitToLocal, brakeStance } from '../src/core/gait.js';
import { makeAnimState, updateAnim, ANIM } from '../src/core/anim.js';
import { rigDims, basePose, generatePose, makeSkeleton, resolveRig } from '../src/core/rig.js';

const HALF = 7;
const REACH = 20.6;   // a normal-height leg at draw scale 1
const ARC = REACH * GAIT.arcFrac;
const walk = (gait, { from, to, dt = 1 / 60, speed01 = 1, facing = 1, steps = 120 }) => {
  const seen = [];
  for (let i = 0; i < steps; i++) {
    const comX = from + (to - from) * (i / (steps - 1));
    updateGait(gait, { comX, facing, speed01, moving: true, halfWidth: HALF, legReach: REACH }, dt);
    seen.push({ comX, l: gait.foot.l.x, r: gait.foot.r.x, support: gait.support, swing: gait.swing });
  }
  return seen;
};

test('the first update plants both feet under the character, not at the origin', () => {
  const g = makeGaitState();
  updateGait(g, { comX: 500, facing: 1, speed01: 0, moving: false, halfWidth: HALF, legReach: REACH }, 1 / 60);
  assert.ok(g.ready);
  assert.equal(g.foot.l.x, 500 - HALF);
  assert.equal(g.foot.r.x, 500 + HALF);
});

test('NO SKATING: the planted foot never moves while it bears weight', () => {
  const g = makeGaitState();
  updateGait(g, { comX: 0, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
  let violations = 0, samples = 0;
  let prevSupport = g.support, prevX = g.foot[g.support].x;
  for (let i = 1; i <= 400; i++) {
    updateGait(g, { comX: i * 1.6, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
    if (g.support === prevSupport && g.swing !== g.support) {
      samples++;
      if (Math.abs(g.foot[g.support].x - prevX) > 1e-9) violations++;
    }
    prevSupport = g.support;
    prevX = g.foot[g.support].x;
  }
  assert.ok(samples > 100, `expected plenty of planted frames, got ${samples}`);
  assert.equal(violations, 0, `the plant foot moved on ${violations}/${samples} frames`);
});

test('the body travelling far enough forces a step', () => {
  const g = makeGaitState();
  const seen = walk(g, { from: 0, to: 300 });
  const steps = seen.filter((s, i) => i > 0 && s.support !== seen[i - 1].support).length;
  assert.ok(steps >= 4, `travelling 300px should take several steps, took ${steps}`);
});

test('the feet alternate — the same foot never steps twice in a row', () => {
  const g = makeGaitState();
  const seen = walk(g, { from: 0, to: 400 });
  const order = [];
  for (let i = 1; i < seen.length; i++) if (seen[i].support !== seen[i - 1].support) order.push(seen[i].support);
  assert.ok(order.length >= 4, 'need several steps to check alternation');
  for (let i = 1; i < order.length; i++) {
    assert.notEqual(order[i], order[i - 1], `foot ${order[i]} stepped twice in a row`);
  }
});

/** Drive a gait forward and capture how far ahead of the COM the first step is placed. */
function firstStepReach(speed01) {
  const g = makeGaitState();
  updateGait(g, { comX: 0, facing: 1, speed01, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
  for (let i = 1; i <= 300; i++) {
    const comX = i * 1.2;
    const before = g.swing;
    updateGait(g, { comX, facing: 1, speed01, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
    if (!before && g.swing) return g.to - comX; // the step was just launched
  }
  throw new Error('no step was taken');
}

test('a faster gait takes longer steps and swings them faster', () => {
  const slow = makeGaitState(), fast = makeGaitState();
  updateGait(slow, { comX: 0, facing: 1, speed01: 0, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
  updateGait(fast, { comX: 0, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
  assert.ok(fast.dur < slow.dur, `sprint swing ${fast.dur} should be quicker than ${slow.dur}`);
  assert.ok(firstStepReach(1) > firstStepReach(0), 'a sprint step is placed further ahead');
});

test('the swing foot arcs off the floor and lands back on it', () => {
  const g = makeGaitState();
  updateGait(g, { comX: 0, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
  let maxLift = 0, sawSwing = false;
  for (let i = 1; i <= 200; i++) {
    updateGait(g, { comX: i * 1.6, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
    if (g.swing) { sawSwing = true; maxLift = Math.max(maxLift, g.foot[g.swing].lift); }
    // the support foot is always flat on the floor
    assert.equal(g.foot[g.support].lift, 0);
  }
  assert.ok(sawSwing, 'expected at least one swing');
  assert.ok(maxLift > ARC * 0.5, `swing should lift clear of the floor, peaked at ${maxLift}`);
  assert.ok(maxLift <= ARC + 1e-9, 'and not higher than the arc allows');
});

test('ANKLE: the plant foot is flat, the swing foot points its toe (finding 1.0-1)', () => {
  const g = makeGaitState();
  updateGait(g, { comX: 0, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
  let maxToe = 0, sawSwing = false;
  for (let i = 1; i <= 200; i++) {
    updateGait(g, { comX: i * 1.6, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
    assert.equal(g.foot[g.support].ankle, 0, 'the planted foot stays flat');
    if (g.swing) { sawSwing = true; maxToe = Math.max(maxToe, g.foot[g.swing].ankle); }
  }
  assert.ok(sawSwing);
  assert.ok(maxToe > 0.1, `the swing foot should point its toe, peaked at ${maxToe}`);
});

test('the toe points hardest at push-off and unwinds through one swing', () => {
  const g = makeGaitState();
  updateGait(g, { comX: 0, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
  // Track a single swing from launch to landing — sampling across two different swings
  // would compare unrelated frames.
  let tracking = null;
  const samples = [];
  for (let i = 1; i <= 400; i++) {
    const before = g.swing;
    updateGait(g, { comX: i * 1.6, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
    if (!before && g.swing) tracking = g.swing;
    if (tracking && g.swing === tracking) samples.push({ t: g.t, ankle: g.foot[tracking].ankle });
    else if (tracking) break;
  }
  assert.ok(samples.length >= 4, `need several frames of one swing, got ${samples.length}`);
  const first = samples[0], last = samples[samples.length - 1];
  assert.ok(first.ankle > last.ankle, `toe should unwind: ${first.ankle} at t=${first.t} -> ${last.ankle} at t=${last.t}`);
  // and it should be monotonically unwinding until the heel lift kicks in at the very end
  const midway = samples.filter((x) => x.t <= 0.7);
  for (let i = 1; i < midway.length; i++) {
    assert.ok(midway[i].ankle <= midway[i - 1].ankle + 1e-9, 'the toe angle only decreases through the swing');
  }
});

test('the ankle mirrors with facing, so the toe always trails the body', () => {
  const right = makeGaitState(), left = makeGaitState();
  const sample = (g, facing) => {
    updateGait(g, { comX: 0, facing, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
    for (let i = 1; i <= 300; i++) {
      updateGait(g, { comX: facing * i * 1.6, facing, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
      if (g.swing && g.t > 0.05 && g.t < 0.2) return g.foot[g.swing].ankle;
    }
    return 0;
  };
  const a = sample(right, 1), b = sample(left, -1);
  assert.ok(a > 0 && b < 0, `expected opposite ankle signs, got ${a} and ${b}`);
});

test('standing settles the feet back under the hips', () => {
  const g = makeGaitState();
  walk(g, { from: 0, to: 200 });
  for (let i = 0; i < 90; i++) {
    updateGait(g, { comX: 200, facing: 1, speed01: 0, moving: false, halfWidth: HALF, legReach: REACH }, 1 / 60);
  }
  assert.ok(Math.abs(g.foot.l.x - (200 - HALF)) < 0.5, `left settled at ${g.foot.l.x}`);
  assert.ok(Math.abs(g.foot.r.x - (200 + HALF)) < 0.5, `right settled at ${g.foot.r.x}`);
  assert.ok(Math.abs(g.foot.l.lift) < 1e-3 && Math.abs(g.foot.r.lift) < 1e-3);
});

test('gaitToLocal converts world feet into body space without allocating', () => {
  const g = makeGaitState();
  updateGait(g, { comX: 500, facing: 1, speed01: 0, moving: false, halfWidth: HALF, legReach: REACH }, 1 / 60);
  const a = gaitToLocal(g, 500, 13.5);
  assert.equal(a, g.out, 'reuses the gait-owned output object');
  assert.equal(a.l.x, -HALF);
  assert.equal(a.r.x, HALF);
  assert.equal(a.l.y, 13.5, 'a grounded foot sits on the floor line');
  const b = gaitToLocal(g, 520, 13.5);
  assert.equal(b.l.x, -HALF - 20, 'moving the body shifts the feet in body space');
});

test('BRAKE: a hard stop widens the base and drops the centre of mass (finding 1.0-2)', () => {
  const none = brakeStance(0);
  assert.equal(none.stanceWidth, 1);
  assert.equal(none.hipDrop, 0);
  const hard = brakeStance(1);
  assert.ok(hard.stanceWidth > 1.5, `expected a wide base, got ${hard.stanceWidth}`);
  assert.ok(hard.hipDrop > 3, `expected the COM to drop, got ${hard.hipDrop}`);
});

test('decelerating raises the brake signal; holding a speed does not', () => {
  const stopping = makeAnimState(), steady = makeAnimState();
  for (let i = 0; i < 30; i++) {
    updateAnim(stopping, { speed: 220, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
    updateAnim(steady, { speed: 220, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
  }
  assert.ok(stopping.brake.v < 0.05, 'a steady sprint is not braking');
  for (let i = 0; i < 4; i++) {
    updateAnim(stopping, { speed: 0, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
    updateAnim(steady, { speed: 220, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
  }
  assert.ok(stopping.brake.v > 0.2, `slamming to a stop should brake, got ${stopping.brake.v}`);
  assert.ok(steady.brake.v < 0.05, `holding speed should not, got ${steady.brake.v}`);
});

test('the brake signal lets go again once the character has stopped', () => {
  const a = makeAnimState();
  for (let i = 0; i < 30; i++) updateAnim(a, { speed: 220, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
  updateAnim(a, { speed: 0, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
  assert.ok(a.brake.v > 0);
  for (let i = 0; i < 60; i++) updateAnim(a, { speed: 0, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
  assert.ok(a.brake.v < 0.01, `brake should unwind, got ${a.brake.v}`);
});

test('the rig uses planted feet when the gait supplies them, and the ankle rides along', () => {
  const dims = rigDims(1, 'normal');
  const g = makeGaitState();
  updateGait(g, { comX: 100, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
  for (let i = 1; i <= 40; i++) updateGait(g, { comX: 100 + i * 1.6, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
  const comX = 100 + 40 * 1.6;
  const pose = generatePose('run', 0.3, 1, 1, basePose());
  pose.feet = gaitToLocal(g, comX, dims.footY);
  const sk = resolveRig(dims, pose, makeSkeleton());
  assert.equal(sk.foot.l.x, pose.feet.l.x, 'the rig takes the planted foot verbatim');
  assert.equal(sk.foot.r.x, pose.feet.r.x);
  assert.equal(sk.ankle.l, pose.feet.l.ankle, 'and carries the ankle to the renderer');
  assert.equal(sk.ankle.r, pose.feet.r.ankle);
});

test('the feet never cross over to the wrong side of the body', () => {
  const g = makeGaitState();
  updateGait(g, { comX: 0, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
  let comX = 0, worst = -Infinity;
  for (let i = 1; i <= 400; i++) {
    comX += 1.6;
    updateGait(g, { comX, facing: 1, speed01: 1, moving: true, halfWidth: HALF, legReach: REACH }, 1 / 60);
    // measure the left foot relative to the right one along the body's own axis
    worst = Math.max(worst, g.foot.l.x - g.foot.r.x - 2 * HALF);
  }
  assert.ok(worst < 0, `the left foot crossed past the right by ${worst.toFixed(2)}px`);
});

test('a standing leg keeps slack so the knee can bend (no locked knees)', () => {
  for (const h of ['normal', 'tall', 'big']) {
    for (const scale of [0.86, 0.95, 1.55]) {
      const d = rigDims(scale, h);
      const span = d.footY - d.hipY;
      assert.ok(d.legReach > span, `${h}@${scale}: leg reach ${d.legReach} must exceed the ${span} hip-to-floor drop`);
    }
  }
});

test('REACHABLE: every planted foot stays inside the leg, so the IK never relocates it', () => {
  // If a foot is planted further away than the leg can extend, twoBoneIK clamps it and
  // draws it somewhere else — the plant silently becomes a slide. This is the guard.
  for (const h of ['normal', 'tall', 'big']) {
    for (const scale of [0.86, 0.95, 1.55]) {
      const dims = rigDims(scale, h);
      const bs = brakeStance(1);
      // the gait settles the feet under the *braked* hips, same as the scene does
      const halfWidth = dims.hipDx * bs.stanceWidth + dims.s * 1.5;
      const g = makeGaitState();
      const pose = basePose();
      let comX = 0, worst = 0;
      updateGait(g, { comX, facing: 1, speed01: 1, moving: true, halfWidth, legReach: dims.legReach }, 1 / 60);
      for (let i = 1; i <= 400; i++) {
        comX += 220 * (1 / 60) * 0.05;   // travel at sprint pace in draw-space units
        updateGait(g, { comX, facing: 1, speed01: 1, moving: true, halfWidth, legReach: dims.legReach }, 1 / 60);
        generatePose('run', i / 60, 1, scale, pose);
        pose.feet = gaitToLocal(g, comX, dims.footY);
        // worst case also carries the braking stance, which widens the hips
        pose.stanceWidth = bs.stanceWidth;
        pose.hipDrop = bs.hipDrop;
        const sk = resolveRig(dims, pose, makeSkeleton());
        for (const k of ['l', 'r']) {
          worst = Math.max(worst, Math.hypot(sk.foot[k].x - sk.hip[k].x, sk.foot[k].y - sk.hip[k].y));
        }
      }
      assert.ok(worst <= dims.legReach, `${h}@${scale}: foot reached ${worst.toFixed(2)} but the leg is only ${dims.legReach.toFixed(2)}`);
    }
  }
});

test('without a gait the rig still falls back to the sine stride', () => {
  const dims = rigDims(1, 'normal');
  const sk = resolveRig(dims, generatePose('run', 0.3, 1, 1), makeSkeleton());
  assert.equal(sk.ankle.l, 0, 'no gait means no ankle angle');
  assert.equal(sk.ankle.r, 0);
  assert.notEqual(sk.foot.l.x, sk.foot.r.x, 'but the legacy stride still splits the feet');
});

test('NO LOCKED KNEES: a sprinting body never over-extends its planted leg', () => {
  // Found in live in-game footage, not in the unit tests: a fast body outruns its own
  // swing, so the plant ends up far enough behind that the leg reaches full extension and
  // the knee draws as a straight stick. The lock-out trigger plus predictive foot placement
  // keep the stance leg inside a bend.
  for (const h of ['normal', 'tall', 'big']) {
    for (const scale of [0.86, 0.95, 1.6]) {
      const dims = rigDims(scale, h);
      const halfWidth = dims.hipDx + dims.s * 1.5;
      const g = makeGaitState();
      const pose = basePose();
      let comX = 0, worst = 0;
      const vx = 220 * scale;                   // full sprint
      updateGait(g, { comX, facing: 1, speed01: 1, moving: true, halfWidth, legReach: dims.legReach, vx }, 1 / 60);
      for (let i = 1; i <= 600; i++) {
        comX += vx * (1 / 60);
        updateGait(g, { comX, facing: 1, speed01: 1, moving: true, halfWidth, legReach: dims.legReach, vx }, 1 / 60);
        generatePose('run', i / 60, 1, scale, pose);
        pose.feet = gaitToLocal(g, comX, dims.footY);
        const sk = resolveRig(dims, pose, makeSkeleton());
        for (const k of ['l', 'r']) {
          worst = Math.max(worst, Math.hypot(sk.foot[k].x - sk.hip[k].x, sk.foot[k].y - sk.hip[k].y) / dims.legReach);
        }
      }
      assert.ok(worst < 0.99, `${h}@${scale}: leg reached ${(worst * 100).toFixed(1)}% of full extension`);
    }
  }
});
