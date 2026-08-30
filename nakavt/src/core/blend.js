/**
 * Pose blending and turning (AE6).
 *
 * NAKAVT switched pose by swapping a string, so every state change was a hard cut — the
 * "instant pose swap" in doc §4.2. Real animation crossfades: the body is still finishing
 * the old pose while it starts the new one. This module owns that crossfade, and the
 * related problem of turning around, which used to be an instant `facing` flip.
 *
 * Two deliberate choices:
 *
 * 1. It blends the RESOLVED SKELETON, not the pose channels. Channels have different
 *    meanings per state (a stride phase means nothing to a shot), so interpolating them
 *    produces poses that never existed. Joint positions always interpolate sensibly.
 *
 * 2. It does NOT blend the feet. Those are owned by the gait and are already continuous
 *    across a pose change; dragging them toward a stale snapshot would put the skating
 *    back that AE3 removed.
 *
 * Pure, allocation-free after construction, no DOM.
 */

/** Blend/turn tuning. Cosmetic only. */
export const BLEND = Object.freeze({
  time: 0.14,        // s to crossfade between two poses
  turnTime: 0.16,    // s to swing the body around to a new facing
  turnMin: 0.30,     // narrowest the body gets mid-turn (0 would be invisible)
  shoulderLag: 0.55, // how much the shoulders trail the hips through a turn (0..1)
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Smooth, symmetric ease — no linear ramp in, no linear ramp out. */
const ease = (t) => t * t * (3 - 2 * t);
const pt = () => ({ x: 0, y: 0 });

/** A snapshot of the joints the blender interpolates. Feet are deliberately absent. */
function makeSnapshot() {
  return {
    pelvis: pt(),
    hip: { l: pt(), r: pt() },
    shoulder: { l: pt(), r: pt() },
    hand: { l: pt(), r: pt() },
    head: pt(),
    ankle: { l: 0, r: 0 },
    lean: 0,
    hipDrop: 0,
    headAim: 0,
    headStab: 0,
  };
}

const PAIRS = ['hip', 'shoulder', 'hand'];
const SCALARS = ['lean', 'hipDrop', 'headAim', 'headStab'];

function copyInto(dst, sk) {
  dst.pelvis.x = sk.pelvis.x; dst.pelvis.y = sk.pelvis.y;
  for (const g of PAIRS) {
    for (const k of ['l', 'r']) { dst[g][k].x = sk[g][k].x; dst[g][k].y = sk[g][k].y; }
  }
  dst.head.x = sk.head.x; dst.head.y = sk.head.y;
  dst.ankle.l = sk.ankle.l; dst.ankle.r = sk.ankle.r;
  for (const s of SCALARS) dst[s] = sk[s];
  return dst;
}

/** Per-character blend state. One per entity, reused every frame. */
export function makeBlendState(facing = 1) {
  return {
    pose: null,        // the pose name currently being blended TO
    from: makeSnapshot(),
    w: 1,              // 0 = fully the old pose, 1 = fully the new one
    active: false,
    facing,            // the discrete facing we are turning toward
    turn: facing,      // the smoothed hip facing, -1..1, passing through 0 mid-turn
    turnSh: facing,    // the shoulder facing, which trails the hips through a turn
    turning: false,
  };
}

/**
 * Crossfade `sk` away from the pose it was in before. Call once per frame, AFTER the rig
 * has resolved. Mutates `sk` toward the blend and returns it.
 */
export function blendPose(state, sk, poseName, dt) {
  if (state.pose !== poseName) {
    if (state.pose !== null) {
      // Snapshot where the body actually is right now and fade away from it, so the new
      // pose starts from the old one rather than cutting to it.
      state.w = 0;
      state.active = true;
    }
    state.pose = poseName;
  }

  if (!state.active) {
    copyInto(state.from, sk);
    return sk;
  }

  state.w = clamp01(state.w + dt / Math.max(1e-4, BLEND.time));
  const t = ease(state.w);
  const f = state.from;
  const mix = (a, b) => a + (b - a) * t;

  sk.pelvis.x = mix(f.pelvis.x, sk.pelvis.x); sk.pelvis.y = mix(f.pelvis.y, sk.pelvis.y);
  for (const g of PAIRS) {
    for (const k of ['l', 'r']) {
      sk[g][k].x = mix(f[g][k].x, sk[g][k].x);
      sk[g][k].y = mix(f[g][k].y, sk[g][k].y);
    }
  }
  sk.head.x = mix(f.head.x, sk.head.x); sk.head.y = mix(f.head.y, sk.head.y);
  sk.ankle.l = mix(f.ankle.l, sk.ankle.l); sk.ankle.r = mix(f.ankle.r, sk.ankle.r);
  for (const s of SCALARS) sk[s] = mix(f[s], sk[s]);

  if (state.w >= 1) state.active = false;
  // Whatever we just drew becomes the thing the NEXT change blends away from.
  copyInto(state.from, sk);
  return sk;
}

/**
 * Turning. An instant `facing` flip is the most obvious pop left in the game, so the
 * facing is smoothed and passes through zero — which, drawn as a horizontal scale, reads
 * as the body swinging around. The hips lead and the shoulders trail (overlapping action,
 * doc §1.2), so the turn has a direction of travel through the body.
 *
 * Returns { hips, shoulders }: signed 0.3..1 scales the renderer applies.
 */
export function updateTurn(state, facing, dt, out = { hips: 1, shoulders: 1 }) {
  if (facing !== state.facing) {
    state.facing = facing;
    state.turning = true;
  }
  const step = (dt / Math.max(1e-4, BLEND.turnTime)) * 2; // -1 -> 1 spans two units
  if (state.turning) {
    const d = state.facing - state.turn;
    if (Math.abs(d) <= step) { state.turn = state.facing; state.turning = false; }
    else state.turn += Math.sign(d) * step;
  }
  // The shoulders CHASE the hips rather than being a fraction of them: mid-turn they are
  // still pointing the old way, and at rest they settle level with the hips again. A plain
  // fraction would leave the shoulders permanently narrower, which is not a lag at all.
  const shStep = step * (1 - BLEND.shoulderLag);
  const ds = state.turn - state.turnSh;
  if (Math.abs(ds) <= shStep) state.turnSh = state.turn;
  else state.turnSh += Math.sign(ds) * shStep;

  return turnScales(state.turn, state.turnSh, out);
}

/** Map smoothed hip/shoulder facings to draw scales, never collapsing to zero width. */
export function turnScales(hipTurn, shoulderTurn, out = { hips: 1, shoulders: 1 }) {
  const widen = (v) => {
    const s = v < 0 ? -1 : 1;
    return s * (BLEND.turnMin + (1 - BLEND.turnMin) * Math.min(1, Math.abs(v)));
  };
  out.hips = widen(hipTurn);
  out.shoulders = widen(shoulderTurn);
  return out;
}
