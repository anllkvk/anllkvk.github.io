/**
 * The jump shot as a timed chain (AE4).
 *
 * The old shot was one value: armUp ramped 0 -> 1 and that was the whole animation. The
 * reference shot is a sequence with anticipation before it and a held pose after it
 * (docs/CHARACTER_ANIMATION_R&D.md §1.3, and the `gather_rise` / `shoot_follow` frames):
 *
 *   gather (dip)  ->  leg drive  ->  extension  ->  wrist release  ->  HOLD  ->  land absorb
 *
 * NAKAVT's gameplay already gives us the two clocks this needs: the player charges before
 * releasing (the gather), and the ball carries `t` seconds since it left the hand (every
 * phase after that). So the chain is split in two: `gatherPose` for the charge, `shotChain`
 * for everything from release onward.
 *
 * Honest note: the footage never gave a clean gather-to-release jumper (see §0), so the
 * sub-phase *timings* here come from animation theory — anticipation before the explosive
 * move, a follow-through that outlasts it — rather than from measured frames. The held
 * follow-through and the landing absorb ARE from frames.
 *
 * Pure; no canvas, no DOM, writes into a caller-supplied object.
 */

/** Shot-chain tuning, in seconds from the moment the ball leaves the hand. */
export const SHOT = Object.freeze({
  driveEnd: 0.08,     // legs extending, body rising
  extendEnd: 0.17,    // full extension, arm at its highest
  releaseEnd: 0.23,   // the wrist snaps over
  followEnd: 0.55,    // the arm HOLDS there — this is what sells intent
  landEnd: 0.80,      // knees absorb the landing, then back to neutral
  jumpApex: 0.20,     // s, when the jump peaks
  jumpLand: 0.55,     // s, when the feet are back down
  liftMax: 16,        // px of jump height
  wristMax: 1,        // 0..1 how far the wrist flops past the release
  gatherDrop: 7,      // px the hips sink at a full gather (anticipation)
  gatherStance: 1.22, // how much the base widens at a full gather
  absorbDrop: 8,      // px the hips sink at touchdown
  absorbStance: 1.3,  // how wide the base goes on the landing
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t) => 1 - (1 - t) ** 3;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** 0 -> 1 -> 0 over [0,1], eased both ways. */
const hump = (t) => Math.sin(clamp01(t) * Math.PI);

/**
 * Anticipation. `charge` is 0..1 (how far into the power sweep the player is).
 * Down before up: the deeper the charge, the lower and wider the gather.
 */
export function gatherPose(charge, out = {}) {
  const c = clamp01(charge);
  out.hipDrop = SHOT.gatherDrop * easeOut(c);
  out.stanceWidth = 1 + (SHOT.gatherStance - 1) * c;
  out.armExt = 0.5;         // ball held at the set point, not yet extended
  out.wrist = 0;
  out.lift = 0;
  return out;
}

/**
 * The chain from release onward. `t` is seconds since the ball left the hand.
 * Writes and returns { phase, armExt, wrist, hold, lift, hipDrop, stanceWidth }.
 */
export function shotChain(t, out = {}) {
  const T = Math.max(0, t);

  // Arm extension: drives up fast, tops out, and then STAYS there through the
  // follow-through instead of dropping the moment the ball leaves.
  let armExt;
  if (T < SHOT.driveEnd) armExt = 0.5 + 0.35 * easeOut(T / SHOT.driveEnd);
  else if (T < SHOT.extendEnd) armExt = 0.85 + 0.15 * easeOut((T - SHOT.driveEnd) / (SHOT.extendEnd - SHOT.driveEnd));
  else if (T < SHOT.followEnd) armExt = 1;
  else armExt = 1 - easeInOut(clamp01((T - SHOT.followEnd) / (SHOT.landEnd - SHOT.followEnd)));

  // Wrist snap: nothing until the release, then it flops over and holds.
  let wrist = 0;
  if (T >= SHOT.extendEnd) {
    if (T < SHOT.releaseEnd) wrist = easeOut((T - SHOT.extendEnd) / (SHOT.releaseEnd - SHOT.extendEnd));
    else if (T < SHOT.followEnd) wrist = 1;
    else wrist = 1 - clamp01((T - SHOT.followEnd) / (SHOT.landEnd - SHOT.followEnd));
  }
  wrist *= SHOT.wristMax;

  // Jump: up to the apex, back down to the floor, then the knees absorb it.
  let lift = 0;
  if (T < SHOT.jumpLand) lift = SHOT.liftMax * hump(T / SHOT.jumpLand) ** 0.8;
  const absorb = T >= SHOT.jumpLand && T < SHOT.landEnd
    ? 1 - clamp01((T - SHOT.jumpLand) / (SHOT.landEnd - SHOT.jumpLand))
    : 0;

  out.phase = T < SHOT.driveEnd ? 'drive'
    : T < SHOT.extendEnd ? 'extend'
      : T < SHOT.releaseEnd ? 'release'
        : T < SHOT.followEnd ? 'follow'
          : T < SHOT.landEnd ? 'land' : 'done';
  out.armExt = armExt;
  out.wrist = wrist;
  out.hold = T >= SHOT.releaseEnd && T < SHOT.followEnd ? 1 : 0;
  out.lift = lift;
  out.hipDrop = SHOT.absorbDrop * absorb;
  out.stanceWidth = 1 + (SHOT.absorbStance - 1) * absorb;
  return out;
}
