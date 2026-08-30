/**
 * AE4 — the jump shot as a timed chain. The old shot was one ramped value; this pins the
 * sequence the reference actually shows: anticipation (dip) before the explosive move,
 * a readable release, a HELD follow-through, and a landing the knees absorb.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOT, shotChain, gatherPose } from '../src/core/shotchain.js';
import { rigDims, basePose, generatePose, makeSkeleton, resolveRig } from '../src/core/rig.js';

const at = (t) => shotChain(t, {});

test('the chain walks through its phases in order and then finishes', () => {
  const order = ['drive', 'extend', 'release', 'follow', 'land', 'done'];
  const seen = [];
  for (let t = 0; t <= 1.0; t += 1 / 240) {
    const ph = at(t).phase;
    if (seen[seen.length - 1] !== ph) seen.push(ph);
  }
  assert.deepEqual(seen, order);
});

test('ANTICIPATION: a deeper charge gathers lower and wider (down before up)', () => {
  const none = gatherPose(0, {}), half = gatherPose(0.5, {}), full = gatherPose(1, {});
  assert.equal(none.hipDrop, 0);
  assert.ok(half.hipDrop > 0, 'a partial charge already dips');
  assert.ok(full.hipDrop > half.hipDrop, 'and a full charge dips further');
  assert.ok(full.stanceWidth > half.stanceWidth, 'the base widens with the gather');
  assert.ok(full.stanceWidth > 1);
});

test('the gather is a set point, not an extension', () => {
  assert.ok(gatherPose(1, {}).armExt < 1, 'the arm has not extended during the gather');
  assert.equal(gatherPose(1, {}).wrist, 0, 'and the wrist has not snapped');
});

test('the arm extends to full and STAYS there through the follow-through', () => {
  const drive = at(SHOT.driveEnd * 0.5);
  const extended = at(SHOT.extendEnd + 0.001);
  const holding = at((SHOT.releaseEnd + SHOT.followEnd) / 2);
  assert.ok(extended.armExt > drive.armExt, 'the arm drives up');
  assert.equal(extended.armExt, 1);
  assert.equal(holding.armExt, 1, 'and holds, rather than dropping at the release');
});

test('FOLLOW-THROUGH: the hold flag is set for the whole held window', () => {
  assert.equal(at(SHOT.extendEnd * 0.5).hold, 0, 'not before the release');
  assert.equal(at((SHOT.releaseEnd + SHOT.followEnd) / 2).hold, 1);
  assert.equal(at(SHOT.followEnd + 0.01).hold, 0, 'and it ends when the arm comes down');
});

test('WRIST: nothing until the release, then it snaps over and holds', () => {
  assert.equal(at(0).wrist, 0);
  assert.equal(at(SHOT.extendEnd - 0.001).wrist, 0, 'the wrist is quiet through the extension');
  assert.ok(at(SHOT.releaseEnd - 0.001).wrist > 0, 'it snaps during the release window');
  assert.equal(at((SHOT.releaseEnd + SHOT.followEnd) / 2).wrist, SHOT.wristMax, 'and stays flopped over');
});

test('the wrist snap is monotonic through the release window', () => {
  let prev = -1;
  for (let t = SHOT.extendEnd; t <= SHOT.releaseEnd; t += 0.005) {
    const w = at(t).wrist;
    assert.ok(w >= prev - 1e-9, `wrist went backwards at t=${t}`);
    prev = w;
  }
});

test('the jump rises to an apex and is back on the floor before the chain ends', () => {
  assert.equal(at(0).lift, 0);
  const apex = at(SHOT.jumpLand / 2).lift;
  assert.ok(apex > SHOT.liftMax * 0.8, `apex should be near the max, got ${apex}`);
  assert.equal(at(SHOT.jumpLand).lift, 0, 'feet are down when the jump ends');
  assert.equal(at(SHOT.landEnd + 0.1).lift, 0);
});

test('the lift never exceeds the configured maximum', () => {
  let max = 0;
  for (let t = 0; t <= 1.2; t += 1 / 240) max = Math.max(max, at(t).lift);
  assert.ok(max <= SHOT.liftMax + 1e-9, `lift peaked at ${max}`);
});

test('LANDING ABSORB: touching down drops the hips and widens the base', () => {
  const air = at(SHOT.jumpLand / 2);
  const touchdown = at(SHOT.jumpLand + 0.001);
  assert.equal(air.hipDrop, 0, 'no absorb while still in the air');
  assert.ok(touchdown.hipDrop > 4, `the knees should absorb, got ${touchdown.hipDrop}`);
  assert.ok(touchdown.stanceWidth > 1, 'and the base widens to take the load');
});

test('the landing absorb unwinds back to a neutral stance', () => {
  const done = at(SHOT.landEnd + 0.05);
  assert.equal(done.hipDrop, 0);
  assert.equal(done.stanceWidth, 1);
  assert.equal(done.phase, 'done');
});

test('shotChain writes into a caller-supplied object (no allocation per frame)', () => {
  const out = {};
  assert.equal(shotChain(0.1, out), out);
  assert.equal(gatherPose(0.5, out), out);
});

test('negative or zero time is handled as the start of the chain', () => {
  assert.equal(at(-5).phase, 'drive');
  assert.equal(at(-5).lift, 0);
  assert.equal(at(0).phase, 'drive');
});

test('REACHABLE: the shooting and guide hands always stay inside the arm', () => {
  // Regression: the release point used to be an absolute offset ~44px from a ~27px arm,
  // so the IK clamped it and the extension ramp was invisible — the arm sat pinned at max
  // reach from the first frame of the shot. Polar targets cannot drift out of reach.
  for (const h of ['normal', 'tall', 'big']) {
    for (const scale of [0.86, 0.95, 1.6]) {
      const dims = rigDims(scale, h);
      const armLen = dims.armL1 + dims.armL2;
      for (const facing of [1, -1]) {
        for (let t = 0; t <= 1.0; t += 0.02) {
          const sk = resolveRig(dims, generatePose('shoot', 0, facing, scale, basePose(), null, t), makeSkeleton());
          for (const k of ['l', 'r']) {
            const d = Math.hypot(sk.hand[k].x - sk.shoulder[k].x, sk.hand[k].y - sk.shoulder[k].y);
            assert.ok(d <= armLen, `${h}@${scale} t=${t.toFixed(2)} hand.${k} reached ${d.toFixed(2)} of ${armLen.toFixed(2)}`);
          }
        }
        for (let c = 0; c <= 1; c += 0.05) {
          const sk = resolveRig(dims, generatePose('aim', 0, facing, scale, basePose(), null, 0, c), makeSkeleton());
          for (const k of ['l', 'r']) {
            const d = Math.hypot(sk.hand[k].x - sk.shoulder[k].x, sk.hand[k].y - sk.shoulder[k].y);
            assert.ok(d <= armLen, `gather ${h}@${scale} c=${c} hand.${k} reached ${d.toFixed(2)}`);
          }
        }
      }
    }
  }
});

test('the shooting arm visibly sweeps upward as the shot extends', () => {
  const dims = rigDims(1, 'normal');
  const ang = (t) => {
    const sk = resolveRig(dims, generatePose('shoot', 0, 1, 1, basePose(), null, t), makeSkeleton());
    return Math.atan2(sk.hand.r.y - sk.shoulder.r.y, sk.hand.r.x - sk.shoulder.r.x);
  };
  const reach = (t) => {
    const sk = resolveRig(dims, generatePose('shoot', 0, 1, 1, basePose(), null, t), makeSkeleton());
    return Math.hypot(sk.hand.r.x - sk.shoulder.r.x, sk.hand.r.y - sk.shoulder.r.y);
  };
  assert.ok(ang(0.20) < ang(0.0), 'the arm angle rises through the extension');
  assert.ok(reach(0.20) > reach(0.0), 'and the arm actually extends rather than staying clamped');
});

test('the rig lands the gather as a real crouch: hips down, feet still planted', () => {
  const dims = rigDims(1, 'normal');
  const relaxed = resolveRig(dims, generatePose('aim', 0, 1, 1, basePose(), null, 0, 0), makeSkeleton());
  const charged = resolveRig(dims, generatePose('aim', 0, 1, 1, basePose(), null, 0, 1), makeSkeleton());
  assert.ok(charged.pelvis.y > relaxed.pelvis.y, 'the pelvis sinks into the gather');
  assert.ok(Math.abs(charged.foot.r.x) > Math.abs(relaxed.foot.r.x), 'and the base widens');
  assert.equal(charged.foot.r.y, relaxed.foot.r.y, 'while the feet stay on the floor');
});

test('the rig lands the landing absorb the same way', () => {
  const dims = rigDims(1, 'normal');
  const air = resolveRig(dims, generatePose('shoot', 0, 1, 1, basePose(), null, SHOT.jumpLand / 2), makeSkeleton());
  const down = resolveRig(dims, generatePose('shoot', 0, 1, 1, basePose(), null, SHOT.jumpLand + 0.01), makeSkeleton());
  assert.ok(down.pelvis.y > air.pelvis.y, 'the pelvis drops to absorb the landing');
});
