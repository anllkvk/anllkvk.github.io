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
import { LEG_PROFILE } from '../src/render/characters.js';
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

test('generatePose: the shot pose reads its extension from the shot chain', () => {
  const p0 = basePose(), p1 = basePose(), p2 = basePose();
  const early = generatePose('shoot', 0, 1, 1, p0, null, 0.01);
  const peak = generatePose('shoot', 0, 1, 1, p1, null, 0.30);
  assert.ok(peak.armUp > early.armUp, 'the arm extends as the chain runs');
  assert.equal(peak.armUp, 1, 'and reaches full extension through the follow-through');
  assert.equal(peak.armMode, 'shoot');
  const done = generatePose('shoot', 0, 1, 1, p2, null, 1.5);
  assert.ok(done.armUp < 0.2, 'and comes back down once the chain finishes');
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

test('the shooting hand rises through the chain toward the release', () => {
  const dims = rigDims(1, 'normal');
  const drive = resolveRig(dims, generatePose('shoot', 0, 1, 1, basePose(), null, 0.01), makeSkeleton());
  const release = resolveRig(dims, generatePose('shoot', 0, 1, 1, basePose(), null, 0.25), makeSkeleton());
  assert.ok(release.hand.r.y < drive.hand.r.y, 'shooting hand rises toward the release');
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

// 'aim' and 'shoot' are deliberately absent: AE4 replaced their single ramped value with
// the timed shot chain, so there is nothing left to hold parity with. They have their own
// tests in shotchain.test.mjs.
const PARITY_POSES = ['idle', 'miss', 'dribble', 'walk', 'run', 'rebound', 'celebrate', 'knockout'];
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

/**
 * AE1's parity sweep is retired here, deliberately. It existed to prove AE1 was a pure
 * refactor and then guarded AE2–AE7 against accidental proportion drift, and it did both.
 * AE8 changes the proportions ON PURPOSE — the old figure was 2.9 heads tall with two
 * thirds of its leg hidden behind the shorts — so there is no longer an "old skeleton" to
 * hold parity with. What replaces it is a guard on the proportions that matter, which is
 * the thing the sweep was really protecting.
 */
test('AE8 proportions: the figure is athletic-chibi, not baby-chibi', () => {
  for (const h of ['normal', 'tall', 'big']) {
    const d = rigDims(1, h);
    const total = d.footY - (d.headY - d.headR);
    const headsTall = total / (2 * d.headR);
    assert.ok(headsTall > 3.4 && headsTall < 4.6, `${h}: ${headsTall.toFixed(2)} heads tall`);
  }
});

test('AE8 proportions: the legs are a real fraction of the height', () => {
  for (const h of ['normal', 'tall', 'big']) {
    const d = rigDims(1, h);
    const total = d.footY - (d.headY - d.headR);
    const legFrac = (d.footY - d.hipY) / total;
    assert.ok(legFrac > 0.35, `${h}: legs are only ${(legFrac * 100).toFixed(0)}% of height`);
  }
});

test('AE8: the shorts leave most of the leg visible, so the gait can be seen', () => {
  // The old shorts ran to +7s against a +13.5s floor, hiding two thirds of the leg — and
  // with it every knee bend and foot plant AE3 produces. This is the regression guard.
  for (const h of ['normal', 'tall', 'big']) {
    const d = rigDims(1, h);
    const shortsBottom = d.hipY - 1 + 10;       // matches the renderer: hipY - 1s, height 10s
    const visible = d.footY - shortsBottom;
    assert.ok(visible / d.legReach > 0.4, `${h}: only ${((visible / d.legReach) * 100).toFixed(0)}% of the leg is visible`);
  }
});

test('AE8: there is a neck between the torso and the head', () => {
  const d = rigDims(1, 'normal');
  assert.ok(d.headY < d.neckY, 'the head centre sits above the collar line');
  assert.ok(d.headY + d.headR > d.neckY - 9, 'and overlaps it, so the silhouette has no gap');
  assert.ok(d.neckW > 0 && d.neckW < d.bodyW * 0.5, 'the neck is narrower than the torso');
});

test('AE8: arms stay proportionate to the taller torso', () => {
  const d = rigDims(1, 'normal');
  const arm = d.armL1 + d.armL2;
  const torso = d.bodyH * 0.82;
  assert.ok(arm > torso * 0.55, `arm ${arm.toFixed(1)} is too short for a ${torso.toFixed(1)} torso`);
});

test('celebrate raises both hands overhead; knockout throws them out and down', () => {
  // Retired along with the parity sweep (AE8 moved the shoulders), so this now pins the
  // INTENT of those two poses rather than their exact pre-AE1 pixel targets.
  const dims = rigDims(1, 'normal');
  const cel = resolveRig(dims, generatePose('celebrate', 0.5, 1, 1), makeSkeleton());
  assert.ok(cel.hand.l.y < cel.shoulder.l.y, 'left hand is above the shoulder');
  assert.ok(cel.hand.r.y < cel.shoulder.r.y, 'right hand is above the shoulder');

  const ko = resolveRig(dims, generatePose('knockout', 0.5, 1, 1), makeSkeleton());
  assert.ok(ko.hand.l.y > ko.shoulder.l.y, 'knocked out, the hands fall below the shoulders');
  assert.ok(ko.hand.l.x < ko.shoulder.l.x && ko.hand.r.x > ko.shoulder.r.x, 'and splay outward');
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

test('AE2: the old resting/running hand targets were beyond the old arm reach', () => {
  // Frame finding 1.0-6 reproduced as a test. Compared against the arm length OF THAT
  // BUILD (8.5+8.5 = 17*s) — AE8 later lengthened the arm, which would mask the original
  // defect if this compared against today's geometry.
  const LEGACY_ARM = 17;
  const legacy = legacyJoints(1, 'normal', 'idle', 0, 1);
  const reach = Math.hypot(legacy.handR.x - legacy.shoR.x, legacy.handR.y - legacy.shoR.y);
  assert.ok(reach > LEGACY_ARM, `legacy rest reach ${reach.toFixed(2)} should exceed the ${LEGACY_ARM} arm of that build`);
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

test('AE9: the shorts are a visible garment, not hidden under the jersey', () => {
  // Live QA caught this and the whole AE8 proportion suite missed it, because every guard
  // measured the SKELETON while the defect was in the DRAW ORDER: the shorts were drawn
  // first, then the jersey was drawn over them down to -0.18*bodyH — 8s below the shorts
  // waist, covering 8 of their 10s. The figure read as one green tunic from collar to
  // thigh with no waist anywhere in the silhouette. The reference is three stacked blocks:
  // jersey, shorts, leg. Guard the band each one actually occupies on screen.
  for (const h of ['reg', 'tall', 'big']) {
    const d = rigDims(1, h);
    const jerseyBand = d.jerseyHemY - d.shoulderY;
    const shortsBand = d.shortsY + d.shortsH - d.jerseyHemY;   // what is left uncovered
    const legBand = d.footY - (d.shortsY + d.shortsH);

    assert.ok(d.jerseyHemY < d.shortsY + d.shortsH,
      `${h}: the jersey hem (${d.jerseyHemY}) hangs past the shorts hem — the shorts vanish`);
    assert.ok(d.jerseyHemY > d.shortsY,
      `${h}: the jersey stops above the waistband and leaves a bare gap at the hip`);
    assert.ok(shortsBand > 0.28 * jerseyBand,
      `${h}: only ${shortsBand.toFixed(1)} of shorts show under ${jerseyBand.toFixed(1)} of jersey`);
    assert.ok(legBand > shortsBand,
      `${h}: more shorts (${shortsBand.toFixed(1)}) than bare leg (${legBand.toFixed(1)})`);
  }
});

/* ── AE10: character silhouette and locomotion polish ─────────────────────────────── */

test('AE10: the arms swing OPPOSITE the legs', () => {
  // The single reason a run reads as a run. Both hands used to be driven by +pose.swing,
  // mirrored only by which side of the body they hang from, so the arms opened and closed
  // together — a symmetric flap — and were unrelated to what the legs were doing.
  const dims = rigDims(1, 'reg');
  const sk = makeSkeleton();
  const anim = makeAnimState();
  for (let i = 0; i < 40; i++) updateAnim(anim, { speed: 200, maxSpeed: 200, facing: 1, lift: 0 }, 1 / 60);

  let checked = 0;
  for (let i = 0; i < 60; i++) {
    const P = generatePose('run', i * 0.01, 1, 1, undefined, anim, 0, 0);
    resolveRig(dims, P, sk);
    if (Math.abs(P.swing) < 0.35) continue;            // mid-stride: no side is "forward"
    // Measure each limb against its OWN root, not in absolute x: the feet are planted a
    // stance width apart, so comparing foot.r.x with foot.l.x mostly reports which side of
    // the body a foot is on, and only reports the stride once the stride exceeds the stance.
    const rightFootFwd = (sk.foot.r.x - sk.hip.r.x) > (sk.foot.l.x - sk.hip.l.x);
    // On this near-front camera the swing is lateral, so the arm at the FRONT of its cycle
    // is the raised one — height is the cue, not screen x. (A fore-and-aft x test would
    // only re-measure which side of the body each arm hangs on.)
    const leftHandFwd = (sk.hand.l.y - sk.shoulder.l.y) < (sk.hand.r.y - sk.shoulder.r.y);
    assert.equal(leftHandFwd, rightFootFwd,
      `swing ${P.swing.toFixed(2)}: right foot forward=${rightFootFwd} but left hand forward=${leftHandFwd}`);
    checked++;
  }
  assert.ok(checked > 20, `only ${checked} usable phases in the cycle`);
});

test('AE10: the swinging elbow never straightens or collapses', () => {
  // The hand used to be placed by independent x and y offsets, so its distance from the
  // shoulder — which IS the elbow angle, for a two-bone chain — changed through the cycle
  // and the arm pumped straight at the ends of the swing. Placing it at a fixed reach and
  // varying the angle holds the bend; the small remaining variation is the forward hand
  // rising toward the chest, which is in the reference.
  const dims = rigDims(1, 'reg');
  const arm = dims.armL1 + dims.armL2;
  const sk = makeSkeleton();
  const anim = makeAnimState();
  for (let i = 0; i < 40; i++) updateAnim(anim, { speed: 200, maxSpeed: 200, facing: 1, lift: 0 }, 1 / 60);

  let min = Infinity, max = 0;
  for (let i = 0; i < 60; i++) {
    const P = generatePose('run', i * 0.01, 1, 1, undefined, anim, 0, 0);
    resolveRig(dims, P, sk);
    for (const k of ['l', 'r']) {
      const d = Math.hypot(sk.hand[k].x - sk.shoulder[k].x, sk.hand[k].y - sk.shoulder[k].y);
      min = Math.min(min, d); max = Math.max(max, d);
    }
  }
  assert.ok(max < arm * 0.80, `arm reaches ${(max / arm).toFixed(2)} of full length — that is a straight arm`);
  assert.ok(min > arm * 0.55, `arm folds to ${(min / arm).toFixed(2)} of full length`);
  assert.ok(max - min < arm * 0.16, `reach swings by ${(max - min).toFixed(1)}px — the elbow is pumping`);
});

test('AE10: the swing grows with speed', () => {
  const dims = rigDims(1, 'reg');
  const sk = makeSkeleton();
  const span = (speed) => {
    const anim = makeAnimState();
    for (let i = 0; i < 60; i++) updateAnim(anim, { speed, maxSpeed: 200, facing: 1, lift: 0 }, 1 / 60);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 60; i++) {
      const P = generatePose('run', i * 0.01, 1, 1, undefined, anim, 0, 0);
      resolveRig(dims, P, sk);
      const x = sk.hand.r.x - sk.shoulder.r.x;
      lo = Math.min(lo, x); hi = Math.max(hi, x);
    }
    return hi - lo;
  };
  assert.ok(span(200) > span(80) * 1.5, 'a sprint swings the arms barely more than a jog');
});

test('AE10: the leg reads thigh -> knee -> calf -> ankle, not as a tube', () => {
  // A monotonic taper can only ever narrow. The reference silhouette has a calf BELLY that
  // is wider than the knee above it, then a hard narrowing into the ankle; without that
  // non-monotonic step the leg is a tube however carefully it is shaded.
  const P = LEG_PROFILE;
  assert.ok(P.hip > P.knee, 'the thigh carries more mass than the knee');
  assert.ok(P.calf > 1, 'the calf belly widens the shank rather than tapering it');
  assert.ok(P.knee * P.calf > P.knee, 'the widest calf point is wider than the knee');
  assert.ok(P.ankle < P.knee, 'the ankle is narrower than the knee');
  assert.ok(P.ankle < P.hip * 0.55, `the ankle is ${(P.ankle / P.hip).toFixed(2)} of the thigh — too thick to read`);
  assert.ok(P.calfAt > 0.15 && P.calfAt < 0.5, 'the calf belly sits in the upper half of the shank');
});

test('AE10: the torso tilts with the lean instead of only sliding', () => {
  const dims = rigDims(1, 'reg');
  const sk = makeSkeleton();
  const anim = makeAnimState();
  for (let i = 0; i < 60; i++) updateAnim(anim, { speed: 200, maxSpeed: 200, facing: 1, lift: 0 }, 1 / 60);
  const P = generatePose('run', 0.2, 1, 1, undefined, anim, 0, 0);
  resolveRig(dims, P, sk);
  assert.ok(sk.leanAngle > 0.1, `sprint tilt is only ${sk.leanAngle.toFixed(3)} rad`);
  assert.ok(Math.abs(sk.leanAngle) <= 0.30, 'the tilt is clamped');
  // and it reverses with facing, so a body never leans backwards into its own run
  const P2 = generatePose('run', 0.2, -1, 1, undefined,
    (() => { const a = makeAnimState(); for (let i = 0; i < 60; i++) updateAnim(a, { speed: 200, maxSpeed: 200, facing: -1, lift: 0 }, 1 / 60); return a; })(), 0, 0);
  resolveRig(dims, P2, sk);
  assert.ok(sk.leanAngle < -0.1, 'the tilt does not follow facing');
});
