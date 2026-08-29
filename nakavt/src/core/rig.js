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
  const bodyW = 25 * s * big, bodyH = 34 * s * big, headR = 13.5 * s * big;
  out.s = s; out.big = big;
  out.bodyW = bodyW;
  out.bodyH = bodyH;
  out.headR = headR;
  out.hipY = -5 * s;
  out.hipDx = 5.4 * s * big;
  out.legL1 = 9 * s * big;
  out.legL2 = 9 * s * big;
  out.legW = 4.4 * s * big;
  out.footY = 13.5 * s;
  out.shoulderY = -bodyH * 0.82;
  out.shoulderDx = bodyW * 0.46;
  out.armL1 = 8.5 * s * big;
  out.armL2 = 8.5 * s * big;
  out.armW = 3.9 * s * big;
  out.headY = -bodyH - headR * 0.4;
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
  return out;
}

/**
 * Pose generation: gameplay pose name + phase -> animation channels.
 * Split out of the renderer so the same curves can later be blended between states.
 */
export function generatePose(poseName, phase, facing, s, out = basePose()) {
  basePose(out);
  out.facing = facing;

  if (poseName === 'idle' || poseName === 'miss') out.bob = Math.sin(phase * 3) * 1.1 * s;
  if (poseName === 'dribble') out.bob = Math.sin(phase * 4) * 1.2 * s;
  if (poseName === 'walk') { out.bob = Math.abs(Math.sin(phase * 10)) * 2 * s; out.lean = 2 * s * facing; }
  if (poseName === 'run' || poseName === 'rebound') { out.bob = Math.abs(Math.sin(phase * 14)) * 3 * s; out.lean = 4 * s * facing; }
  if (poseName === 'shoot') {
    out.armUp = Math.min(1, phase * 1.7);
    out.bob = -out.armUp * 5 * s;
    out.crouch = (1 - out.armUp) * 2 * s;
  }
  if (poseName === 'aim') { out.armUp = 0.5 + Math.sin(phase * 6) * 0.04; out.crouch = 3 * s; }
  if (poseName === 'celebrate') { out.armUp = 1; out.bob = -Math.abs(Math.sin(phase * 8)) * 7 * s; }
  if (poseName === 'knockout') { out.fall = Math.min(1, phase); out.spin = phase * 1.1; }

  out.running = STRIDE_POSES.includes(poseName);
  out.strideHz = poseName === 'walk' ? 10 : 14;
  out.swing = out.running ? Math.sin(phase * out.strideHz) : 0;
  out.tuck = (poseName === 'shoot' ? out.armUp : poseName === 'aim' ? 0.4 : 0) * 2.5 * s;
  out.bendLeg = facing >= 0 ? 1 : -1;

  if (out.running) out.armMode = 'swing';
  else if (poseName === 'celebrate') out.armMode = 'celebrate';
  else if (poseName === 'knockout') out.armMode = 'knockout';
  else if (poseName === 'aim' || poseName === 'shoot') {
    out.armMode = 'shoot';
    out.shootRel = poseName === 'shoot' ? out.armUp : 0.5;
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
  for (const side of SIDES) {
    const k = side === 1 ? 'r' : 'l';
    const ph = side === 1 ? pose.swing : -pose.swing;
    sk.foot[k].x = side * hx + (pose.running ? ph * 7 * s * facing : side * 1.5 * s * w);
    sk.foot[k].y = footY - (pose.running ? Math.max(0, ph * facing) * 5 * s : 0) - pose.tuck;
  }

  sk.shoulder.l.x = -shoulderDx; sk.shoulder.l.y = shoulderY;
  sk.shoulder.r.x = shoulderDx; sk.shoulder.r.y = shoulderY;
  sk.bendArm.l = pose.bendArmL;
  sk.bendArm.r = pose.bendArmR;
  sk.bendLeg = pose.bendLeg;

  switch (pose.armMode) {
    case 'swing': {
      const lift = Math.abs(pose.swing) * 3 * s;
      sk.hand.l.x = sk.shoulder.l.x - 4 * s - pose.swing * 6 * s * facing;
      sk.hand.l.y = shoulderY + 14 * s - lift;
      sk.hand.r.x = sk.shoulder.r.x + 4 * s + pose.swing * 6 * s * facing;
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
      const rel = pose.shootRel;
      const relX = facing * bodyW * 0.42, relY = shoulderY - 20 * s * rel - 8 * s;
      const gX = facing * bodyW * 0.10, gY = shoulderY - 9 * s * rel + 1 * s;
      if (facing >= 0) {
        sk.hand.r.x = relX; sk.hand.r.y = relY;
        sk.hand.l.x = gX; sk.hand.l.y = gY;
        sk.bendArm.l = 1;
      } else {
        sk.hand.l.x = relX; sk.hand.l.y = relY;
        sk.hand.r.x = gX; sk.hand.r.y = gY;
        sk.bendArm.r = -1;
      }
      break;
    }
    default:
      sk.hand.l.x = sk.shoulder.l.x - 5 * s; sk.hand.l.y = shoulderY + 17 * s;
      sk.hand.r.x = sk.shoulder.r.x + 5 * s; sk.hand.r.y = shoulderY + 17 * s;
      break;
  }

  sk.head.x = 0; sk.head.y = headY;
  return sk;
}
