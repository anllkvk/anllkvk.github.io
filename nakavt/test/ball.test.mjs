/**
 * AE5 — the ball/body relationship. Doc §1.5: the tell of amateur animation is a ball at a
 * fixed body offset with no hand near it. These pin the two halves of the fix: a shared
 * carry point (so the ball and the hand cannot disagree) and hands that are posed TO the
 * ball wherever it actually is, plus the head that stabilises and aims at it (§1.0-5).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rigDims, basePose, generatePose, makeSkeleton, resolveRig,
  ballCarry, handsToBall, HEAD_STABILISE,
} from '../src/core/rig.js';

const dims = rigDims(1, 'normal');
const ARM = dims.armL1 + dims.armL2;

test('the carry point is on the ball side and follows facing', () => {
  const right = ballCarry(dims, 'idle', 1, {});
  const left = ballCarry(dims, 'idle', -1, {});
  assert.ok(right.x > 0, 'carried toward +x when facing right');
  assert.ok(left.x < 0, 'and toward -x when facing left');
  assert.equal(right.x, -left.x, 'symmetric');
  assert.equal(right.y, left.y);
});

test('the carry point differs per pose: a dribble is low, a gather is up at the chest', () => {
  const dribble = ballCarry(dims, 'dribble', 1, {});
  const gather = ballCarry(dims, 'aim', 1, {});
  const carry = ballCarry(dims, 'idle', 1, {});
  assert.ok(dribble.y > carry.y, 'a dribble is held lower than a plain carry');
  assert.ok(gather.y < carry.y, 'a gather brings it up to the set point');
});

test('REACHABLE: every carry point is inside the arm from the near shoulder', () => {
  // If the ball sits where the hand cannot go, the hand cannot be posed to it and we are
  // back to a decal at a fixed offset — the exact problem AE5 removes.
  for (const h of ['normal', 'tall', 'big']) {
    for (const scale of [0.86, 0.95, 1.6]) {
      const d = rigDims(scale, h);
      const arm = d.armL1 + d.armL2;
      for (const pose of ['idle', 'dribble', 'aim', 'run']) {
        for (const facing of [1, -1]) {
          const c = ballCarry(d, pose, facing, {});
          const shoulder = { x: facing >= 0 ? d.shoulderDx : -d.shoulderDx, y: d.shoulderY };
          const dist = Math.hypot(c.x - shoulder.x, c.y - shoulder.y);
          assert.ok(dist <= arm, `${h}@${scale}/${pose}/${facing}: carry is ${dist.toFixed(2)} from a ${arm.toFixed(2)} arm`);
        }
      }
    }
  }
});

test('handsToBall puts the near hand exactly on a ball within reach', () => {
  const sk = makeSkeleton();
  resolveRig(dims, generatePose('idle', 0, 1, 1), sk);
  const ball = ballCarry(dims, 'idle', 1, {});
  handsToBall(dims, sk, ball, 1, false);
  assert.equal(sk.hand.r.x, ball.x, 'the hand IS on the ball, not near it');
  assert.equal(sk.hand.r.y, ball.y);
});

test('two-handed puts the off hand on the other side of the ball', () => {
  const sk = makeSkeleton();
  resolveRig(dims, generatePose('idle', 0, 1, 1), sk);
  const ball = ballCarry(dims, 'aim', 1, {});
  handsToBall(dims, sk, ball, 1, true);
  assert.ok(sk.hand.l.x < ball.x, 'the guide hand cups it from the far side');
  assert.ok(Math.hypot(sk.hand.l.x - ball.x, sk.hand.l.y - ball.y) < ARM * 0.5, 'and stays near it');
});

test('a ball out of reach is REACHED toward, not teleported to', () => {
  const sk = makeSkeleton();
  resolveRig(dims, generatePose('idle', 0, 1, 1), sk);
  const far = { x: 400, y: -200 };
  handsToBall(dims, sk, far, 1, false);
  const d = Math.hypot(sk.hand.r.x - sk.shoulder.r.x, sk.hand.r.y - sk.shoulder.r.y);
  assert.ok(d <= ARM && d > ARM * 0.9, `the arm extends nearly fully toward it (${d} of ${ARM})`);
  const toBall = Math.atan2(far.y - sk.shoulder.r.y, far.x - sk.shoulder.r.x);
  const toHand = Math.atan2(sk.hand.r.y - sk.shoulder.r.y, sk.hand.r.x - sk.shoulder.r.x);
  assert.ok(Math.abs(toBall - toHand) < 1e-9, 'and points straight at it');
});

test('handsToBall is a no-op without a ball', () => {
  const sk = makeSkeleton();
  resolveRig(dims, generatePose('idle', 0, 1, 1), sk);
  const before = { x: sk.hand.r.x, y: sk.hand.r.y };
  assert.equal(handsToBall(dims, sk, null, 1), false);
  assert.equal(sk.hand.r.x, before.x);
  assert.equal(sk.hand.r.y, before.y);
});

test('the rig poses the hands to a ball passed through the pose', () => {
  const pose = generatePose('dribble', 0, 1, 1, basePose());
  pose.ballAt = ballCarry(dims, 'dribble', 1, {});
  pose.twoHanded = false;
  const sk = resolveRig(dims, pose, makeSkeleton());
  assert.equal(sk.hand.r.x, pose.ballAt.x);
  assert.equal(sk.hand.r.y, pose.ballAt.y);
});

test('the shot keeps its own arm — the ball does not hijack the release', () => {
  const pose = generatePose('shoot', 0, 1, 1, basePose(), null, 0.2);
  const withoutBall = resolveRig(dims, pose, makeSkeleton());
  pose.ballAt = { x: -30, y: 20 };
  const withBall = resolveRig(dims, pose, makeSkeleton());
  assert.equal(withBall.hand.r.x, withoutBall.hand.r.x, 'the shooting arm is owned by the chain');
  assert.equal(withBall.hand.r.y, withoutBall.hand.r.y);
});

test('HEAD: the neck cancels part of the torso lean so the head stays level', () => {
  const pose = generatePose('run', 0.3, 1, 1, basePose());
  pose.lean = 10;
  const sk = resolveRig(dims, pose, makeSkeleton());
  assert.ok(Math.abs(sk.headStab + 10 * HEAD_STABILISE) < 1e-9, 'the head counters the lean');
  assert.ok(sk.headStab < 0, 'countering means moving back against it');
  assert.ok(Math.abs(sk.headStab) < 10, 'but only partly — the head still travels with the body');
});

test('HEAD: the gaze aims at the ball, and its sign follows which side it is on', () => {
  const pose = generatePose('idle', 0, 1, 1, basePose());
  pose.ballAt = { x: 30, y: -20 };
  const right = resolveRig(dims, pose, makeSkeleton());
  assert.ok(right.headAim > 0, 'looks right when the ball is right');
  pose.ballAt = { x: -30, y: -20 };
  const left = resolveRig(dims, pose, makeSkeleton());
  assert.ok(left.headAim < 0, 'and left when it is left');
  assert.ok(Math.abs(right.headAim) <= 1 && Math.abs(left.headAim) <= 1, 'normalised');
});

test('HEAD: no ball means no gaze offset', () => {
  const sk = resolveRig(dims, generatePose('idle', 0, 1, 1, basePose()), makeSkeleton());
  assert.equal(sk.headAim, 0);
});
