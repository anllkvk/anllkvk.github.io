/**
 * AE1 — character rig scaffold. The rig is the pure layer between gameplay state and the
 * renderer; these tests pin its proportions, its pose channels, the new stanceWidth /
 * hipDrop channels, and — most importantly — that resolving a pose still produces exactly
 * the joints the old inline renderer produced (the "visual parity" acceptance for AE1).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  heightScale, rigDims, basePose, generatePose, makeSkeleton, resolveRig, STRIDE_POSES,
} from '../src/core/rig.js';
import { ANIM, makeAnimState, updateAnim } from '../src/core/anim.js';

const near = (a, b, eps = 1e-9, msg = '') => assert.ok(Math.abs(a - b) < eps, `${msg} ${a} !== ${b}`);

test('heightScale maps the three height classes', () => {
  assert.equal(heightScale('big'), 1.2);
  assert.equal(heightScale('tall'), 1.08);
  assert.equal(heightScale('normal'), 1);
  assert.equal(heightScale(undefined), 1);
});

test('rigDims scales linearly with draw scale', () => {
  const a = rigDims(1, 'normal');
  const b = rigDims(2, 'normal');
  for (const k of ['bodyW', 'bodyH', 'headR', 'hipDx', 'legL1', 'armL1', 'footY', 'shoulderDx']) {
    near(b[k], a[k] * 2);
  }
});

test('rigDims writes into a caller-supplied object (no allocation per frame)', () => {
  const out = {};
  const r = rigDims(1.4, 'tall', out);
  assert.equal(r, out);
  assert.ok(out.bodyH > 0);
});

test('basePose is neutral: no stride, no lean, neutral stance', () => {
  const p = basePose();
  assert.equal(p.swing, 0);
  assert.equal(p.lean, 0);
  assert.equal(p.running, false);
  assert.equal(p.stanceWidth, 1);
  assert.equal(p.hipDrop, 0);
  assert.equal(p.armMode, 'hang');
});

test('generatePose marks exactly the stride poses as running', () => {
  for (const name of STRIDE_POSES) {
    assert.equal(generatePose(name, 0.3, 1, 1).running, true, name);
  }
  for (const name of ['idle', 'aim', 'shoot', 'celebrate', 'knockout', 'dribble']) {
    assert.equal(generatePose(name, 0.3, 1, 1).running, false, name);
  }
});

test('generatePose: shoot ramps armUp to full extension and holds', () => {
  const early = generatePose('shoot', 0.1, 1, 1);
  const late = generatePose('shoot', 0.9, 1, 1);
  assert.ok(late.armUp > early.armUp);
  assert.equal(generatePose('shoot', 5, 1, 1).armUp, 1);
  assert.equal(late.armMode, 'shoot');
});

test('generatePose: the knee bend follows facing', () => {
  assert.equal(generatePose('run', 0.2, 1, 1).bendLeg, 1);
  assert.equal(generatePose('run', 0.2, -1, 1).bendLeg, -1);
});

test('resolveRig: a running stride is asymmetric (one leg forward, one back)', () => {
  const dims = rigDims(1, 'normal');
  // pick a phase where the stride is clearly off-centre
  const p = generatePose('run', 0.1, 1, 1);
  assert.ok(Math.abs(p.swing) > 0.5, 'need a non-neutral stride phase');
  const sk = resolveRig(dims, p);
  const fwdR = sk.foot.r.x - sk.hip.r.x;
  const fwdL = sk.foot.l.x - sk.hip.l.x;
  assert.ok(fwdR * fwdL < 0, 'feet should swing in opposite directions');
  assert.notEqual(sk.foot.r.y, sk.foot.l.y, 'one foot lifts while the other stays down');
});

test('resolveRig: standing, the pose is symmetric about the centre line', () => {
  const dims = rigDims(1, 'normal');
  const sk = resolveRig(dims, generatePose('idle', 0, 1, 1));
  near(sk.foot.r.x, -sk.foot.l.x);
  near(sk.foot.r.y, sk.foot.l.y);
  near(sk.hip.r.x, -sk.hip.l.x);
  near(sk.shoulder.r.x, -sk.shoulder.l.x);
});

test('stanceWidth widens the base without moving the feet off the floor', () => {
  const dims = rigDims(1, 'normal');
  const p = generatePose('idle', 0, 1, 1);
  const narrow = resolveRig(dims, p, makeSkeleton());
  p.stanceWidth = 1.8;
  const wide = resolveRig(dims, p, makeSkeleton());
  assert.ok(wide.foot.r.x > narrow.foot.r.x, 'right foot moves outward');
  assert.ok(wide.foot.l.x < narrow.foot.l.x, 'left foot moves outward');
  assert.ok(wide.hip.r.x > narrow.hip.r.x, 'hips widen with the stance');
  near(wide.foot.r.y, narrow.foot.r.y);
  near(wide.foot.l.y, narrow.foot.l.y);
});

test('hipDrop sinks the pelvis while the feet stay planted (knees absorb it)', () => {
  const dims = rigDims(1, 'normal');
  const p = generatePose('idle', 0, 1, 1);
  const up = resolveRig(dims, p, makeSkeleton());
  p.hipDrop = 6;
  const down = resolveRig(dims, p, makeSkeleton());
  near(down.pelvis.y, up.pelvis.y + 6);
  near(down.hip.l.y, up.hip.l.y + 6);
  near(down.hip.r.y, up.hip.r.y + 6);
  near(down.foot.l.y, up.foot.l.y);
  near(down.foot.r.y, up.foot.r.y);
});

test('resolveRig reuses the skeleton object (allocation-free per frame)', () => {
  const dims = rigDims(1, 'normal');
  const sk = makeSkeleton();
  const footR = sk.foot.r, handL = sk.hand.l;
  const out = resolveRig(dims, generatePose('run', 0.4, 1, 1), sk);
  assert.equal(out, sk);
  assert.equal(out.foot.r, footR, 'sub-objects are mutated, not replaced');
  assert.equal(out.hand.l, handL);
});

test('the shooting hand extends further as the release progresses', () => {
  const dims = rigDims(1, 'normal');
  const gather = resolveRig(dims, generatePose('shoot', 0.05, 1, 1), makeSkeleton());
  const release = resolveRig(dims, generatePose('shoot', 0.9, 1, 1), makeSkeleton());
  assert.ok(release.hand.r.y < gather.hand.r.y, 'shooting hand rises toward the release');
});

test('facing -1 mirrors which arm shoots', () => {
  const dims = rigDims(1, 'normal');
  const right = resolveRig(dims, generatePose('shoot', 0.9, 1, 1), makeSkeleton());
  const left = resolveRig(dims, generatePose('shoot', 0.9, -1, 1), makeSkeleton());
  assert.ok(right.hand.r.x > 0, 'facing right, the right hand releases');
  assert.ok(left.hand.l.x < 0, 'facing left, the left hand releases');
});

/**
 * Visual-parity guard for AE1. These are the exact formulas the renderer used inline
 * before the rig existed; if the rig ever drifts from them, AE1's "look unchanged"
 * promise is broken and this fails.
 */
function legacyJoints(scale, heightClass, poseName, phase, facing) {
  const s = scale;
  const big = heightClass === 'big' ? 1.2 : heightClass === 'tall' ? 1.08 : 1;
  const bodyW = 25 * s * big, bodyH = 34 * s * big, headR = 13.5 * s * big;
  let armUp = 0;
  if (poseName === 'shoot') armUp = Math.min(1, phase * 1.7);
  if (poseName === 'aim') armUp = 0.5 + Math.sin(phase * 6) * 0.04;
  if (poseName === 'celebrate') armUp = 1;

  const hipY = -5 * s, hipDx = 5.4 * s * big, footY = 13.5 * s;
  const running = poseName === 'run' || poseName === 'rebound' || poseName === 'walk';
  const strideHz = poseName === 'walk' ? 10 : 14;
  const swing = running ? Math.sin(phase * strideHz) : 0;
  const tuck = (poseName === 'shoot' ? armUp : poseName === 'aim' ? 0.4 : 0) * 2.5 * s;

  const foot = (side) => {
    const ph = side === 1 ? swing : -swing;
    return {
      x: side * hipDx + (running ? ph * 7 * s * facing : side * 1.5 * s),
      y: footY - (running ? Math.max(0, ph * facing) * 5 * s : 0) - tuck,
    };
  };

  const shoulderY = -bodyH * 0.82;
  const shoL = { x: -bodyW * 0.46, y: shoulderY }, shoR = { x: bodyW * 0.46, y: shoulderY };
  let handL = { x: shoL.x - 5 * s, y: shoulderY + 17 * s };
  let handR = { x: shoR.x + 5 * s, y: shoulderY + 17 * s };
  let bendL = -1, bendR = 1;
  if (running) {
    handL = { x: shoL.x - 4 * s - swing * 6 * s * facing, y: shoulderY + 14 * s - Math.abs(swing) * 3 * s };
    handR = { x: shoR.x + 4 * s + swing * 6 * s * facing, y: shoulderY + 14 * s - Math.abs(swing) * 3 * s };
  } else if (poseName === 'celebrate') {
    handL = { x: shoL.x - 8 * s, y: shoulderY - 21 * s };
    handR = { x: shoR.x + 8 * s, y: shoulderY - 21 * s };
  } else if (poseName === 'knockout') {
    handL = { x: shoL.x - 15 * s, y: shoulderY + 8 * s };
    handR = { x: shoR.x + 15 * s, y: shoulderY + 8 * s };
  } else if (poseName === 'aim' || poseName === 'shoot') {
    const rel = poseName === 'shoot' ? armUp : 0.5;
    const relPt = { x: facing * bodyW * 0.42, y: shoulderY - 20 * s * rel - 8 * s };
    const guidePt = { x: facing * bodyW * 0.10, y: shoulderY - 9 * s * rel + 1 * s };
    if (facing >= 0) { handR = relPt; handL = guidePt; bendL = 1; } else { handL = relPt; handR = guidePt; bendR = -1; }
  }
  return {
    hipL: { x: -hipDx, y: hipY }, hipR: { x: hipDx, y: hipY },
    footL: foot(-1), footR: foot(1),
    shoL, shoR, handL, handR, bendL, bendR,
    bendLeg: facing >= 0 ? 1 : -1,
    head: { x: 0, y: -bodyH - headR * 0.4 },
  };
}

const PARITY_POSES = ['idle', 'miss', 'dribble', 'walk', 'run', 'rebound', 'aim', 'shoot', 'celebrate', 'knockout'];
const PARITY_PHASES = [0, 0.17, 0.43, 0.6, 1.3, 2.7];
const PARITY_HEIGHTS = ['normal', 'tall', 'big'];
const PARITY_SCALES = [0.86, 0.95, 1.4];

/** Every (height, scale, pose, phase, facing) case the parity sweep covers. */
function* parityCases() {
  for (const h of PARITY_HEIGHTS) {
    for (const scale of PARITY_SCALES) {
      const dims = rigDims(scale, h);
      for (const name of PARITY_POSES) {
        for (const phase of PARITY_PHASES) {
          for (const facing of [1, -1]) {
            // Lean is zeroed: AE1 applied it as a whole-body canvas translate, AE2 moved it
            // into the rig so the pelvis carries over the planted feet. That difference is
            // covered by its own test below; this sweep pins everything else.
            const pose = generatePose(name, phase, facing, scale);
            pose.lean = 0;
            yield {
              dims, h, scale, name, phase, facing,
              want: legacyJoints(scale, h, name, phase, facing),
              got: resolveRig(dims, pose, makeSkeleton()),
              tag: `${h}/${scale}/${name}/${phase}/${facing}`,
            };
          }
        }
      }
    }
  }
}

test('AE1 parity: the rig reproduces the old inline skeleton exactly', () => {
  let checked = 0;
  for (const { want, got, tag } of parityCases()) {
    near(got.hip.l.x, want.hipL.x); near(got.hip.l.y, want.hipL.y);
    near(got.hip.r.x, want.hipR.x); near(got.hip.r.y, want.hipR.y);
    near(got.foot.l.x, want.footL.x); near(got.foot.l.y, want.footL.y);
    near(got.foot.r.x, want.footR.x); near(got.foot.r.y, want.footR.y);
    near(got.shoulder.l.x, want.shoL.x); near(got.shoulder.l.y, want.shoL.y);
    near(got.shoulder.r.x, want.shoR.x); near(got.shoulder.r.y, want.shoR.y);
    near(got.head.x, want.head.x); near(got.head.y, want.head.y);
    assert.equal(got.bendArm.l, want.bendL, 'bendArm.l ' + tag);
    assert.equal(got.bendArm.r, want.bendR, 'bendArm.r ' + tag);
    assert.equal(got.bendLeg, want.bendLeg, 'bendLeg ' + tag);
    checked++;
  }
  assert.equal(checked, PARITY_HEIGHTS.length * PARITY_SCALES.length * PARITY_POSES.length * PARITY_PHASES.length * 2);
});

test('AE1 parity: shot, celebrate and knockout hands are unchanged by AE2', () => {
  // AE2 only clamps the locomotion/resting arms; the poses that genuinely extend keep
  // their exact old hand targets.
  const extended = new Set(['aim', 'shoot', 'celebrate', 'knockout']);
  let checked = 0;
  for (const { want, got, name, tag } of parityCases()) {
    if (!extended.has(name)) continue;
    near(got.hand.l.x, want.handL.x, 1e-9, 'handL.x ' + tag);
    near(got.hand.l.y, want.handL.y, 1e-9);
    near(got.hand.r.x, want.handR.x, 1e-9, 'handR.x ' + tag);
    near(got.hand.r.y, want.handR.y, 1e-9);
    checked++;
  }
  assert.ok(checked > 0);
});

test('AE2: lean carries the pelvis over the feet instead of sliding the whole body', () => {
  // The point of the change: the reference leans by passing the body over a planted foot,
  // so the hips must move while the feet stay exactly where they were put down.
  const dims = rigDims(1, 'normal');
  const upright = resolveRig(dims, Object.assign(generatePose('run', 0.3, 1, 1), { lean: 0 }), makeSkeleton());
  const leaned = resolveRig(dims, Object.assign(generatePose('run', 0.3, 1, 1), { lean: 6 }), makeSkeleton());
  near(leaned.hip.l.x, upright.hip.l.x + 6, 1e-9, 'left hip carries the lean');
  near(leaned.hip.r.x, upright.hip.r.x + 6, 1e-9, 'right hip carries the lean');
  near(leaned.pelvis.x, upright.pelvis.x + 6, 1e-9, 'pelvis carries the lean');
  near(leaned.foot.l.x, upright.foot.l.x, 1e-9, 'planted feet do NOT move');
  near(leaned.foot.r.x, upright.foot.r.x, 1e-9);
  assert.equal(leaned.lean, 6, 'the renderer is told how far to shift the upper body');
});

test('AE2: a faster run leans the body further over its feet', () => {
  const dims = rigDims(1, 'normal');
  const anim = makeAnimState();
  for (let i = 0; i < 60; i++) updateAnim(anim, { speed: 220, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
  const fast = resolveRig(dims, generatePose('run', 0.3, 1, 1, basePose(), anim), makeSkeleton());

  const slowAnim = makeAnimState();
  for (let i = 0; i < 60; i++) updateAnim(slowAnim, { speed: 40, maxSpeed: 220, facing: 1, lift: 0 }, 1 / 60);
  const slow = resolveRig(dims, generatePose('run', 0.3, 1, 1, basePose(), slowAnim), makeSkeleton());

  assert.ok(fast.lean > slow.lean, `sprint lean ${fast.lean} should exceed jog lean ${slow.lean}`);
});

test('AE2: the old resting/running hand targets were beyond full arm reach', () => {
  // This is the frame finding (1.0-6) reproduced as a test: the pre-AE2 hand targets sat
  // *outside* the arm, so the IK pinned the elbow straight and the arms read as sticks.
  const dims = rigDims(1, 'normal');
  const armLen = dims.armL1 + dims.armL2;
  const legacy = legacyJoints(1, 'normal', 'idle', 0, 1);
  const reach = Math.hypot(legacy.handR.x - legacy.shoR.x, legacy.handR.y - legacy.shoR.y);
  assert.ok(reach > armLen, `legacy rest reach ${reach} should exceed arm length ${armLen}`);
});

test('AE2: locomotion and resting hands are clamped inside full extension', () => {
  const dims = rigDims(1, 'normal');
  const armLen = dims.armL1 + dims.armL2;
  const max = armLen * ANIM.armReach;
  for (const name of ['idle', 'dribble', 'walk', 'run', 'rebound']) {
    for (const phase of [0, 0.2, 0.55, 1.1]) {
      const sk = resolveRig(dims, generatePose(name, phase, 1, 1), makeSkeleton());
      for (const k of ['l', 'r']) {
        const d = Math.hypot(sk.hand[k].x - sk.shoulder[k].x, sk.hand[k].y - sk.shoulder[k].y);
        assert.ok(d <= max + 1e-9, `${name}@${phase} hand.${k} reach ${d} > ${max}`);
      }
    }
  }
});
