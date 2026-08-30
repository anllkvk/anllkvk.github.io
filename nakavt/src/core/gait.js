/**
 * Foot planting and the step cycle (AE3).
 *
 * NAKAVT's feet used to be drawn at an offset from the body, so they travelled with it —
 * the classic skating look. The reference never does that (docs/CHARACTER_ANIMATION_R&D.md
 * §1.0): the plant foot is pinned flat to the floor and the body passes over it, and the
 * *ankle* is what sells it — the trail foot is plantar-flexed (toe pointed) right after
 * push-off while the plant foot stays flat (§1.0 finding 1).
 *
 * So feet live in world space here, not body space. One foot is planted and does not move
 * until the centre of mass has travelled far enough past it to force a step; the other
 * swings along an arc to its next plant. Reimplemented from the public-domain
 * COM-triggers-a-step / arc-lerp-swing approach (see docs/OSS_ADOPTIONS.md); pure, no DOM.
 */

/** Gait tuning. Cosmetic only. */
export const GAIT = Object.freeze({
  // Step geometry is expressed as a fraction of the leg's reach, never in raw pixels:
  // a foot placed further than the leg can extend would be clamped by the IK and drawn
  // somewhere other than where it was planted, which is exactly the skating we are
  // removing. These fractions keep every plant comfortably inside the leg.
  triggerFrac: 0.30,   // how far the COM may lead the plant foot before a step is forced
  stepLenMinFrac: 0.20, // a slow step lands this far ahead of the COM
  stepLenMaxFrac: 0.40, // a sprint step lands this far ahead
  arcFrac: 0.20,       // how high the swing foot lifts at mid-swing
  stepDurMin: 0.12,    // s, a sprint swing
  stepDurMax: 0.30,    // s, a walking swing
  toeMax: 0.62,        // rad the ankle plantar-flexes at push-off (toe pointed back)
  heelMax: 0.20,       // rad the toe lifts just before touchdown
  standWidth: 1.5,     // px each foot rests outside its hip when standing
  brakeWidth: 0.95,    // extra stanceWidth at a full brake (§1.0 finding 2)
  brakeDrop: 5.5,      // px the COM drops at a full brake
  settle: 0.18,        // s for the feet to re-centre once the character stops
});

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Per-character gait state. One per entity, reused every frame. */
export function makeGaitState() {
  return {
    // World-space x of each foot, plus its current lift and ankle angle.
    foot: {
      l: { x: 0, lift: 0, ankle: 0 },
      r: { x: 0, lift: 0, ankle: 0 },
    },
    support: 'l',    // the foot currently bearing weight; pinned until it swings
    swing: null,     // 'l' | 'r' while a step is in flight
    from: 0,         // world x the swing started at
    to: 0,           // world x it is heading for
    t: 0,            // 0..1 swing progress
    dur: GAIT.stepDurMax,
    ready: false,
    // Handed to the rig each frame as local-space foot overrides.
    out: { l: { x: 0, y: 0, ankle: 0 }, r: { x: 0, y: 0, ankle: 0 } },
  };
}

const other = (k) => (k === 'l' ? 'r' : 'l');

/**
 * Advance the step cycle.
 *
 * `input` = {
 *   comX      world x of the character (its centre of mass)
 *   facing    -1 | 1
 *   speed01   0..1 smoothed speed (from the momentum layer)
 *   moving    whether the character is actually travelling
 *   halfWidth px each foot sits outside the centre line when standing
 * }
 */
export function updateGait(gait, input, dt) {
  const { comX, facing, speed01, halfWidth } = input;
  const moving = !!input.moving;
  const reach = input.legReach || 20;
  const trigger = reach * GAIT.triggerFrac;
  const arc = reach * GAIT.arcFrac;

  if (!gait.ready) {
    // Plant both feet under the character rather than sliding them in from nowhere.
    gait.foot.l.x = comX - halfWidth;
    gait.foot.r.x = comX + halfWidth;
    gait.foot.l.lift = gait.foot.r.lift = 0;
    gait.foot.l.ankle = gait.foot.r.ankle = 0;
    gait.support = 'l';
    gait.swing = null;
    gait.ready = true;
  }

  const stepLen = reach * (GAIT.stepLenMinFrac + (GAIT.stepLenMaxFrac - GAIT.stepLenMinFrac) * speed01);
  gait.dur = GAIT.stepDurMax + (GAIT.stepDurMin - GAIT.stepDurMax) * speed01;

  // Launch first, then advance in the same frame: otherwise a step spends its first frame
  // sitting flat at the old plant position, which shows up as a one-frame stall.
  if (!gait.swing && moving) {
    // The COM has run out ahead of the planted foot — take a step with the other one.
    const plant = gait.foot[gait.support];
    if (Math.abs(comX - plant.x) > trigger) {
      const k = other(gait.support);
      gait.swing = k;
      gait.from = gait.foot[k].x;
      // Each foot steps along ITS OWN side of the body. Aiming both at the centre line
      // made the swinging foot cross over, which (a) the reference never does and (b) put
      // the foot further from its hip than the leg could reach, so the IK moved it.
      gait.to = comX + (k === 'r' ? halfWidth : -halfWidth) + facing * stepLen;
      gait.t = 0;
    }
  }

  if (gait.swing) {
    gait.t = clamp01(gait.t + dt / Math.max(1e-3, gait.dur));
    const f = gait.foot[gait.swing];
    const e = easeInOut(gait.t);
    f.x = gait.from + (gait.to - gait.from) * e;
    f.lift = Math.sin(Math.PI * gait.t) * arc;
    // Ankle: toe pointed hard at push-off, unwinding through the swing, then the toe
    // lifts a touch just before the foot lands. Signed by travel direction so the toe
    // trails behind the body the way it does in the reference.
    const toe = GAIT.toeMax * (1 - gait.t) ** 1.6;
    const heel = GAIT.heelMax * clamp01((gait.t - 0.72) / 0.28);
    f.ankle = (toe - heel) * facing;
    if (gait.t >= 1) {
      f.lift = 0;
      f.ankle = 0;
      gait.support = gait.swing;
      gait.swing = null;
    }
  } else if (!moving) {
    // Standing: ease both feet back under the hips instead of leaving them mid-stride.
    const k = dt <= 0 ? 0 : clamp01(dt / GAIT.settle);
    gait.foot.l.x += (comX - halfWidth - gait.foot.l.x) * k;
    gait.foot.r.x += (comX + halfWidth - gait.foot.r.x) * k;
    gait.foot.l.lift += (0 - gait.foot.l.lift) * k;
    gait.foot.r.lift += (0 - gait.foot.r.lift) * k;
    gait.foot.l.ankle += (0 - gait.foot.l.ankle) * k;
    gait.foot.r.ankle += (0 - gait.foot.r.ankle) * k;
  }

  // The planted foot never moves. Asserting it here (rather than trusting the branches
  // above) is what actually guarantees "no skating".
  if (gait.swing !== gait.support) {
    const p = gait.foot[gait.support];
    p.lift = 0;
    p.ankle = 0;
  }
  return gait;
}

/**
 * Convert the world-space feet into the local-space overrides the rig consumes.
 * `footY` is the local ground line. Returns the shared `gait.out` (no allocation).
 */
export function gaitToLocal(gait, comX, footY) {
  for (const k of ['l', 'r']) {
    const f = gait.foot[k], o = gait.out[k];
    o.x = f.x - comX;
    o.y = footY - f.lift;
    o.ankle = f.ankle;
  }
  return gait.out;
}

/**
 * Braking stance. Frame finding §1.0-2: a hard stop is not a lead-foot spike — it is both
 * feet down, wide and flat, with the centre of mass dropped. `brake` is 0..1.
 */
export function brakeStance(brake) {
  return {
    stanceWidth: 1 + GAIT.brakeWidth * brake,
    hipDrop: GAIT.brakeDrop * brake,
  };
}
