/**
 * Character rig — the pure skeleton + pose math behind the animation engine (AE1).
 *
 * Layer split this file exists to create:
 *
 *   gameplay state  ->  ANIMATION STATE  ->  RIG (here)  ->  pose  ->  blend  ->  render
 *
 * Until now drawCharacter computed every joint inline while drawing, so there was
 * nowhere to put a centre of gravity, a planted foot or a blend weight. Everything here
 * is pure (no canvas, no DOM, no globals), reuses caller-supplied output objects so a
 * frame costs no allocations, and is unit-tested — the renderer just draws what it gets.
 *
 * Coordinate space is the character's local space: origin at the feet, +y downward,
 * +x toward facing = 1. AE1 reproduces the previous renderer's joints exactly (visual
 * parity); the stanceWidth / hipDrop channels are wired and tested here but left
 * neutral until AE2/AE3 drive them.
 */

import { strideScale, strideCadence, clampReach } from './anim.js';
import { shotChain, gatherPose } from './shotchain.js';

/**
 * How much of its full length a standing leg uses. Below 1 so the knee keeps a bend at
 * rest — a locked knee is the single clearest "this is a drawing" tell (doc §1.0).
 *
 * It also sets how far a foot can be planted sideways before the leg runs out: with the hip
 * h above the floor and the leg h/REST_EXTENSION long, the horizontal room is
 * sqrt(R² - h²) = R·sqrt(1 - REST_EXTENSION²). At 0.9 that was only 0.44R of room and a
 * standing leg was ALREADY 90% extended, so a normal stride pushed straight past full
 * extension and the knee locked. 0.82 gives 0.57R of room and a visibly bent standing knee,
 * which is what the reference shows in every grounded frame.
 */
export const REST_EXTENSION = 0.82;

/** How much of the torso's lean the neck cancels so the head stays level (AE5). */
export const HEAD_STABILISE = 0.4;

/** Height class -> overall size multiplier. */
export function heightScale(heightClass) {
  return heightClass === 'big' ? 1.2 : heightClass === 'tall' ? 1.08 : 1;
}

/**
 * Body proportions at a given draw scale. These are the numbers the renderer has always
 * used, lifted out of the draw call so pose generation can reason about the body.
 */
export function rigDims(scale, heightClass, out = {}) {
  const s = scale, big = heightScale(heightClass);
  const bodyW = 25 * s * big, bodyH = 38 * s * big, headR = 8.8 * s * big;
  out.s = s; out.big = big;
  out.bodyW = bodyW;
  out.bodyH = bodyH;
  out.headR = headR;
  // AE8 proportions. The hips used to sit at -5s, which put them *below* the shorts and
  // left only 6.5s of a 18.5s leg visible — roughly a third. Every knee bend, foot plant
  // and ankle angle AE3 produces was hidden behind the shorts. Raising the hips both
  // lengthens the leg (bones are derived from this span) and exposes the thigh.
  out.hipY = -14 * s;
  out.hipDx = 5.4 * s * big;
  out.footY = 13.5 * s;
  // Leg bones are derived from the hip-to-floor span rather than hard-coded, so the knee
  // always has slack to bend. The old fixed 9*s*big bones were SHORTER than that span for
  // normal-height characters (18*s of leg for an 18.5*s drop), which pinned every knee
  // straight and made the IK place the foot short of its target — fatal once AE3 asks the
  // foot to stay exactly where it was planted. REST_EXTENSION < 1 keeps a standing knee
  // softly bent, which is also what the reference shows in every grounded frame.
  const legSpan = out.footY - out.hipY;
  out.legL1 = out.legL2 = (legSpan * 0.5) / REST_EXTENSION;
  out.legReach = out.legL1 + out.legL2;
  out.legW = 4.4 * s * big;
  // AE9 garment lines. The shorts run hipY-1s to hipY+9s, but the jersey was drawn AFTER
  // them and hung to -0.18*bodyH — which is BELOW the shorts waist by 8s of their 10s
  // height. The shorts were therefore 98% hidden and the figure read as one green tunic
  // from collar to thigh, with no waist. The reference silhouette is three blocks: jersey,
  // shorts, leg. Pin the jersey hem here so the renderer and the tests agree on it.
  out.shortsY = out.hipY - 1 * s;
  out.shortsH = 10 * s;
  out.jerseyHemY = out.hipY + 0.5 * s;   // overlaps the waistband, then stops
  out.shoulderY = -bodyH * 0.82;
  out.shoulderDx = bodyW * 0.46;
  out.armL1 = 11 * s * big;
  out.armL2 = 11 * s * big;
  out.armW = 3.9 * s * big;
  // A neck gap, so the head reads as sitting ON shoulders rather than fused to a box.
  out.neckY = -bodyH + 1.5 * s;
  out.neckW = bodyW * 0.30;
  out.headY = -bodyH - headR * 0.62;
  return out;
}

/** Gameplay poses that drive a stride cycle. */
export const STRIDE_POSES = ['run', 'rebound', 'walk'];

/** A neutral pose: every animation channel at rest. Reused frame to frame. */
export function basePose(out = {}) {
  out.facing = 1;
  out.running = false;
  out.swing = 0;          // stride phase, -1..1 (positive = right leg forward)
  out.strideHz = 0;
  out.lean = 0;           // px the body shifts along facing
  out.bob = 0;            // px vertical body offset (negative = up)
  out.crouch = 0;         // px the whole body sinks (feet included)
  out.tuck = 0;           // px the feet pull up toward the hips
  out.armUp = 0;          // 0..1 shot extension
  out.shootRel = 0;       // 0..1 release progress used to place the shooting hand
  out.fall = 0;           // 0..1 knockout fall
  out.spin = 0;           // knockout rotation
  out.armMode = 'hang';   // hang | swing | celebrate | knockout | shoot
  out.bendArmL = -1;      // elbow side
  out.bendArmR = 1;
  out.bendLeg = 1;        // knee side (leads toward facing)
  // --- channels introduced by AE1, driven from AE2/AE3 (frame finding 1.0-3) ---
  out.stanceWidth = 1;    // multiplies hip separation + the resting foot offset
  out.hipDrop = 0;        // px the pelvis sinks while the feet stay planted
  out.strideScale = 1;    // AE2: stride amplitude multiplier (speed-driven)
  out.wrist = 0;          // AE4: 0..1 wrist snap past the release
  out.shotLift = 0;       // AE4: px of jump the shot chain asks for
  // AE3: when set, { l:{x,y,ankle}, r:{...} } local-space feet from the gait state. These
  // win over the sine stride, because they are the planted positions — see core/gait.js.
  out.feet = null;
  // AE5: the ball in local space, when this character is holding or reaching for one.
  // The hands are posed TO it; it is never posed to them.
  out.ballAt = null;
  out.twoHanded = true;
  return out;
}

/**
 * Pose generation: gameplay pose name + phase -> animation channels.
 * Split out of the renderer so the same curves can later be blended between states.
 *
 * `anim` (AE2, optional) is the per-character momentum state from core/anim.js. With it,
 * lean and stride scale with the smoothed speed instead of being fixed per pose. Without
 * it the output is exactly the AE1 pose, which is what the parity test pins.
 */
// Scratch objects for the shot chain: pose generation runs once per character per
// frame and must not allocate.
const _chain = {};
const _gather = {};

export function generatePose(poseName, phase, facing, s, out = basePose(), anim = null, shotT = 0, charge = 0) {
  basePose(out);
  out.facing = facing;

  if (poseName === 'idle' || poseName === 'miss') out.bob = Math.sin(phase * 3) * 1.1 * s;
  if (poseName === 'dribble') out.bob = Math.sin(phase * 4) * 1.2 * s;
  if (poseName === 'walk') { out.bob = Math.abs(Math.sin(phase * 10)) * 2 * s; out.lean = 2 * s * facing; }
  if (poseName === 'run' || poseName === 'rebound') { out.bob = Math.abs(Math.sin(phase * 14)) * 3 * s; out.lean = 4 * s * facing; }
  // AE4: shoot and aim are driven by the shot chain (core/shotchain.js) rather than a
  // single ramped value. shotT is seconds since the ball left the hand; charge is 0..1
  // through the power sweep. Both come from gameplay clocks that already existed.
  if (poseName === 'shoot') {
    const c = shotChain(shotT, _chain);
    out.armUp = c.armExt;
    out.wrist = c.wrist;
    out.shotLift = c.lift * s;
    out.hipDrop = c.hipDrop * s;
    out.stanceWidth = c.stanceWidth;
    out.bob = -c.armExt * 2 * s;
  }
  if (poseName === 'aim') {
    const g = gatherPose(charge, _gather);
    out.armUp = g.armExt;
    out.hipDrop = g.hipDrop * s;
    out.stanceWidth = g.stanceWidth;
    // a small live tremor so a held gather is a moving hold, never a frozen frame
    out.armUp += Math.sin(phase * 6) * 0.03;
  }
  if (poseName === 'celebrate') { out.armUp = 1; out.bob = -Math.abs(Math.sin(phase * 8)) * 7 * s; }
  if (poseName === 'knockout') { out.fall = Math.min(1, phase); out.spin = phase * 1.1; }

  out.running = STRIDE_POSES.includes(poseName);
  out.strideHz = poseName === 'walk' ? 10 : 14;
  out.swing = out.running ? Math.sin(phase * out.strideHz) : 0;
  out.tuck = 0; // AE4: the shot's vertical travel is the jump lift, not a foot tuck
  out.bendLeg = facing >= 0 ? 1 : -1;

  // AE2 momentum: the body leans into the direction it is actually moving, and the stride
  // grows in both length and cadence with speed, instead of every run looking identical.
  if (anim) {
    out.strideScale = strideScale(anim);
    if (out.running) {
      out.strideHz = strideCadence(anim);
      out.swing = Math.sin(phase * out.strideHz);
      out.lean = anim.lean.v;
    } else if (Math.abs(anim.lean.v) > Math.abs(out.lean)) {
      // Momentum outlives the pose: a player who just stopped still carries the lean.
      out.lean = anim.lean.v;
    }
  }

  if (out.running) out.armMode = 'swing';
  else if (poseName === 'celebrate') out.armMode = 'celebrate';
  else if (poseName === 'knockout') out.armMode = 'knockout';
  else if (poseName === 'aim' || poseName === 'shoot') {
    out.armMode = 'shoot';
    out.shootRel = out.armUp;
  }
  return out;
}

const pt = () => ({ x: 0, y: 0 });

/** A resolved skeleton. Allocate once per character and reuse. */
export function makeSkeleton() {
  return {
    pelvis: pt(),
    hip: { l: pt(), r: pt() },
    foot: { l: pt(), r: pt() },
    shoulder: { l: pt(), r: pt() },
    hand: { l: pt(), r: pt() },
    head: pt(),
    bendArm: { l: -1, r: 1 },
    bendLeg: 1,
    lean: 0,               // px the upper body carries ahead of the feet (AE2)
    hipDrop: 0,            // px the upper body sinks over planted feet (AE3/AE4)
    accomDrop: 0,          // extra sink so a wide plant stays reachable (AE8)
    ankle: { l: 0, r: 0 }, // rad; 0 = flat on the floor, +ve = toe pointed (AE3)
    headAim: 0,            // px the gaze shifts toward the ball (AE5)
    headStab: 0,           // px the head counters the torso lean to stay level (AE5)
  };
}

const SIDES = [-1, 1];

/**
 * Resolve pose channels into joint targets. sk is mutated in place and returned, so a
 * frame allocates nothing. The two-bone IK that places the elbow/knee stays in the
 * renderer's limb(), which already solves it — this only decides where the chain ends go.
 */
export function resolveRig(dims, pose, sk = makeSkeleton()) {
  const { s, bodyW, hipY, hipDx, footY, shoulderY, shoulderDx, headY } = dims;
  const facing = pose.facing;
  const w = pose.stanceWidth;
  const hx = hipDx * w;

  sk.pelvis.x = 0;
  sk.pelvis.y = hipY + pose.hipDrop;
  sk.hip.l.x = -hx; sk.hip.l.y = sk.pelvis.y;
  sk.hip.r.x = hx; sk.hip.r.y = sk.pelvis.y;

  // Feet. The stride swings the right leg with `swing` and the left against it; standing,
  // they rest just outside the hips. hipDrop deliberately does NOT move them — that is the
  // point of a dropped centre of gravity: the knees absorb it and the feet stay planted.
  const stride = pose.strideScale;
  for (const side of SIDES) {
    const k = side === 1 ? 'r' : 'l';
    if (pose.feet) {
      // AE3: real planted feet from the gait state. Already local-space and already
      // carrying the step arc and ankle, so the sine stride is bypassed entirely.
      sk.foot[k].x = pose.feet[k].x;
      sk.foot[k].y = pose.feet[k].y - pose.tuck;
      sk.ankle[k] = pose.feet[k].ankle;
    } else {
      const ph = side === 1 ? pose.swing : -pose.swing;
      sk.foot[k].x = side * hx + (pose.running ? ph * 7 * s * facing * stride : side * 1.5 * s * w);
      sk.foot[k].y = footY - (pose.running ? Math.max(0, ph * facing) * 5 * s * stride : 0) - pose.tuck;
      sk.ankle[k] = 0;
    }
  }

  sk.shoulder.l.x = -shoulderDx; sk.shoulder.l.y = shoulderY;
  sk.shoulder.r.x = shoulderDx; sk.shoulder.r.y = shoulderY;
  sk.bendArm.l = pose.bendArmL;
  sk.bendArm.r = pose.bendArmR;
  sk.bendLeg = pose.bendLeg;

  switch (pose.armMode) {
    case 'swing': {
      const st = pose.strideScale;
      const lift = Math.abs(pose.swing) * 3 * s * st;
      sk.hand.l.x = sk.shoulder.l.x - 4 * s - pose.swing * 6 * s * facing * st;
      sk.hand.l.y = shoulderY + 14 * s - lift;
      sk.hand.r.x = sk.shoulder.r.x + 4 * s + pose.swing * 6 * s * facing * st;
      sk.hand.r.y = shoulderY + 14 * s - lift;
      break;
    }
    case 'celebrate':
      sk.hand.l.x = sk.shoulder.l.x - 8 * s; sk.hand.l.y = shoulderY - 21 * s;
      sk.hand.r.x = sk.shoulder.r.x + 8 * s; sk.hand.r.y = shoulderY - 21 * s;
      break;
    case 'knockout':
      sk.hand.l.x = sk.shoulder.l.x - 15 * s; sk.hand.l.y = shoulderY + 8 * s;
      sk.hand.r.x = sk.shoulder.r.x + 15 * s; sk.hand.r.y = shoulderY + 8 * s;
      break;
    case 'shoot': {
      // The shooting arm is described as an ANGLE and a REACH from the shoulder, not as
      // an absolute point. The old absolute release point sat ~44px from a ~27px arm, so
      // the IK clamped it and the whole extension ramp was invisible — the arm was pinned
      // at max reach from the first frame. In polar terms every pose is reachable by
      // construction, and the arm visibly sweeps up as the shot extends.
      const rel = pose.shootRel;
      const armLen = dims.armL1 + dims.armL2;
      // Everything is polar, including the wrist snap: the flop rotates the hand slightly
      // back over the top and shortens the reach a touch, rather than adding a Cartesian
      // offset that could push the target outside the arm again.
      // Both offsets are measured from the hand's OWN shoulder. Anchoring the guide hand
      // to the body centre instead put it a shoulder-width further from its shoulder than
      // intended, which pushed that arm past full extension too.
      // Up and FORWARD, not straight up: a vertical release puts the hand directly above
      // the shoulder, which is inside the head's silhouette, so the whole raised arm
      // disappears behind it. Angling it out keeps the release pose readable.
      const relAng = -0.55 - 0.75 * rel + pose.wrist * 0.10;   // rad, negative = upward
      const relDist = armLen * (0.52 + 0.42 * rel - 0.03 * pose.wrist);
      const relDX = facing * Math.cos(relAng) * relDist;
      const relDY = Math.sin(relAng) * relDist;
      // The guide hand reaches up and INWARD, toward where the ball is being held.
      const gAng = -0.72 - 0.30 * rel;
      const gDist = armLen * (0.46 + 0.14 * rel);
      const gDX = facing * Math.cos(gAng) * gDist;
      const gDY = Math.sin(gAng) * gDist;
      const shoot = facing >= 0 ? 'r' : 'l';
      const guide = facing >= 0 ? 'l' : 'r';
      sk.hand[shoot].x = sk.shoulder[shoot].x + relDX;
      sk.hand[shoot].y = sk.shoulder[shoot].y + relDY;
      sk.hand[guide].x = sk.shoulder[guide].x + gDX;
      sk.hand[guide].y = sk.shoulder[guide].y + gDY;
      sk.bendArm[guide] = facing >= 0 ? 1 : -1;
      break;
    }
    default:
      sk.hand.l.x = sk.shoulder.l.x - 5 * s; sk.hand.l.y = shoulderY + 17 * s;
      sk.hand.r.x = sk.shoulder.r.x + 5 * s; sk.hand.r.y = shoulderY + 17 * s;
      break;
  }

  // AE2 / frame finding §1.0-6: during locomotion and at rest the elbows stay bent — a
  // fully extended arm is what makes a procedural run read as flailing. The shot is the
  // one move that genuinely extends, so it is exempt.
  if (pose.armMode === 'swing' || pose.armMode === 'hang') {
    clampReach(sk.shoulder.l, sk.hand.l, dims.armL1 + dims.armL2);
    clampReach(sk.shoulder.r, sk.hand.r, dims.armL1 + dims.armL2);
  }

  sk.head.x = 0; sk.head.y = headY;

  // AE2 lean. This used to be a canvas translate of the whole character, which just slid
  // the sprite sideways — the reference leans by carrying the body *over* the feet
  // (§1.0: the plant foot stays pinned while the body passes over it). So the lean moves
  // the pelvis and everything above it; the feet stay where they were planted. The
  // renderer applies sk.lean to the torso/arms/head it draws in body space.
  // AE5: hands go to the ball, for every state except the shot (whose arm the chain
  // owns) and the knockout. A held ball and a loose one are the same code path — the
  // difference is only whether it is inside the arm's reach.
  if (pose.ballAt && pose.armMode !== 'shoot' && pose.armMode !== 'knockout') {
    handsToBall(dims, sk, pose.ballAt, facing, pose.twoHanded);
  }

  // AE5 head. Frame finding §1.0-5: the head is stabilised against the torso pitch AND
  // aimed at the ball — both, not either. Without the first it bobs with the body; without
  // the second the player never looks at what they are doing.
  sk.headStab = -pose.lean * HEAD_STABILISE;
  sk.headAim = 0;
  if (pose.ballAt) {
    const dx = pose.ballAt.x - sk.head.x;
    const dy = pose.ballAt.y - sk.head.y;
    const d = Math.hypot(dx, dy) || 1;
    sk.headAim = Math.max(-1, Math.min(1, dx / d));
  }

  sk.lean = pose.lean;
  sk.hipDrop = pose.hipDrop;
  sk.pelvis.x += pose.lean;
  sk.hip.l.x += pose.lean;
  sk.hip.r.x += pose.lean;

  // The pelvis accommodates the plant. If a foot is planted further out than the leg can
  // reach from the current hip height, the hips drop until it can — which is what a real
  // body does when it strides wide, and is why a low wide stance looks the way it does.
  // The alternative would be to move the foot, i.e. to un-plant it, which is the skating
  // this whole layer exists to remove. Bounded, so an extreme case sinks rather than snaps.
  if (pose.feet) {
    const maxLeg = dims.legReach * 0.97;
    let need = 0;
    for (const k of ['l', 'r']) {
      const dx = sk.foot[k].x - sk.hip[k].x;
      const room = maxLeg * maxLeg - dx * dx;
      if (room <= 0) continue;                       // unreachable sideways; gait bounds this
      const maxDy = Math.sqrt(room);
      const dy = sk.foot[k].y - sk.hip[k].y;
      if (dy > maxDy) need = Math.max(need, dy - maxDy);
    }
    if (need > 0) {
      const drop = Math.min(need, dims.legReach * 0.35);
      sk.pelvis.y += drop;
      sk.hip.l.y += drop;
      sk.hip.r.y += drop;
      sk.accomDrop = drop;
      sk.hipDrop += drop;
    } else sk.accomDrop = 0;
  } else sk.accomDrop = 0;


  return sk;
}

/**
 * Where a carried ball sits, in local space (AE5).
 *
 * This is exported so the scene can put the ball here and the rig can pose the hand to the
 * same point — the two cannot disagree, which is the whole trick. Previously the ball sat
 * at a fixed body offset well above the head and no hand was near it, which is exactly the
 * "reads as a decal" problem in doc §1.5.
 */
export function ballCarry(dims, poseName, facing, out = { x: 0, y: 0 }) {
  const { s, bodyW, shoulderY, armL1, armL2 } = dims;
  const arm = armL1 + armL2;
  switch (poseName) {
    case 'dribble':
      // low and out to the ball side, where a dribbler's hand actually is
      out.x = facing * bodyW * 0.60;
      out.y = shoulderY + arm * 0.86;
      break;
    case 'aim':
      // the set point: up at the chest, ready to go
      out.x = facing * bodyW * 0.42;
      out.y = shoulderY + 2 * s;
      break;
    default:
      // carried at waist height, slightly ahead
      out.x = facing * bodyW * 0.50;
      out.y = shoulderY + arm * 0.58;
      break;
  }
  return out;
}

/**
 * Pose the hands to a ball that is actually somewhere (AE5).
 *
 * `ballAt` is the ball in local space. The near hand is placed ON it and the off hand
 * cups it from the other side, both clamped to what the arm can reach — so a ball just
 * out of range reads as *reaching for it*, which is the point (doc §1.5). Returns true if
 * the hands were re-posed.
 */
export function handsToBall(dims, sk, ballAt, facing, twoHanded = true) {
  if (!ballAt) return false;
  const arm = dims.armL1 + dims.armL2;
  // Reaching for the ball is one of the few moments that genuinely extends the arm (the
  // shot is the other), so it is exempt from the locomotion elbow clamp — otherwise a
  // ball just outside the everyday swing radius could never actually be held.
  const REACH = 0.98;
  const near = facing >= 0 ? 'r' : 'l';
  const off = facing >= 0 ? 'l' : 'r';
  const gap = dims.armW * 0.9;

  sk.hand[near].x = ballAt.x;
  sk.hand[near].y = ballAt.y;
  clampReach(sk.shoulder[near], sk.hand[near], arm, REACH);

  if (twoHanded) {
    sk.hand[off].x = ballAt.x - facing * gap * 2;
    sk.hand[off].y = ballAt.y + gap * 0.4;
    clampReach(sk.shoulder[off], sk.hand[off], arm, REACH);
  }
  return true;
}
