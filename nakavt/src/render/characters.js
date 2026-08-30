/**
 * Arcade basketball players — pure canvas (no image assets), NBA-*style* but
 * fully original: fictional teams, original names, jerseys with a wordmark,
 * side stripes and a big number. Athletic pseudo-3D proportions with shaded
 * volumes, beards, arm sleeves and a range of hairstyles. Light enough for 60 FPS.
 *
 * Joint placement lives in core/rig.js (pure, unit-tested); this file only draws the
 * skeleton it resolves — see the layer split documented there.
 *
 * drawCharacter(ctx, char, x, y, scale, pose, phase, opts)
 *   pose:  'idle' | 'run' | 'shoot' | 'aim' | 'celebrate' | 'knockout'
 *   opts:  { facing: -1|1, dim: bool }
 */
import { twoBoneIK } from '../core/steering.js';
import { rigDims, basePose, generatePose, makeSkeleton, resolveRig } from '../core/rig.js';
import { applyLimbLag } from '../core/anim.js';
import { gaitToLocal } from '../core/gait.js';
import { blendPose, updateTurn } from '../core/blend.js';
import { makeStrand, updateStrand } from '../core/verlet.js';

// One rig scratch set for the module: pose generation and skeleton resolution are pure and
// synchronous, so reusing these keeps drawing allocation-free no matter how many players
// are on screen.
const _dims = {};
const _pose = basePose();
const _sk = makeSkeleton();

function rgb(hex) {
  const h = (hex || '#888').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const c255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
function shade(hex, m) { const { r, g, b } = rgb(hex); return `rgb(${c255(r * m)},${c255(g * m)},${c255(b * m)})`; }
/** `hex` darkened by `m`, then pulled `t` of the way toward `towards`. */
function shadeToward(hex, m, towards, t) {
  const a = rgb(hex), b = rgb(towards);
  return `rgb(${c255(a.r * m + (b.r - a.r * m) * t)},${c255(a.g * m + (b.g - a.g * m) * t)},${c255(a.b * m + (b.b - a.b * m) * t)})`;
}

/**
 * ONE key light for the whole character, in local space (AE11).
 *
 * Before this the shapes disagreed about where the light was: the torso and the shorts ran
 * dark-left to light-right, the head was lit from the upper LEFT, and every limb was shaded
 * across its own bone — so a leg pointing down and an arm pointing sideways were lit from
 * different directions. Nothing read as one solid under one light, which is most of why the
 * figure looked like flat vector shapes rather than a body.
 *
 * Local space, not world: the character is never mirrored as a whole (facing is applied per
 * element), so a fixed local light IS a fixed world light, and it does not flip when the
 * player turns around.
 */
const LIGHT = Object.freeze({ x: -0.55, y: -0.84 });   // points from the surface toward the light

/**
 * Floor bounce (AE12). A polished court is a big warm reflector directly under the player,
 * and the shadow side of a real body on one is never neutral-dark — it is filled with the
 * colour of the floor. Shading everything toward black instead is what makes a figure look
 * cut out and dropped onto the scene rather than standing in it. Every shadow terminates
 * toward this instead of toward nothing, and the undersides get an explicit lift.
 */
const BOUNCE = '#d7a86a';

/** Material response. Cloth is matte and broad; skin picks up more; rubber is glossy. */
const MAT = Object.freeze({
  cloth: { lit: 1.16, dark: 0.68, mid: 0.52, bounce: 0.20 },
  skin:  { lit: 1.24, dark: 0.70, mid: 0.48, bounce: 0.26 },
  gloss: { lit: 1.34, dark: 0.58, mid: 0.62, bounce: 0.16 },
});

/**
 * A fill for a rounded solid of the given radius centred at (cx, cy), shaded along LIGHT.
 * Every form in the character uses this, which is what makes them agree.
 */
function lightGrad(ctx, cx, cy, radius, base, m = MAT.cloth) {
  const g = ctx.createLinearGradient(
    cx + LIGHT.x * radius, cy + LIGHT.y * radius,
    cx - LIGHT.x * radius, cy - LIGHT.y * radius,
  );
  g.addColorStop(0, shade(base, m.lit));
  g.addColorStop(m.mid, base);
  g.addColorStop(1, shadeToward(base, m.dark, BOUNCE, m.bounce || 0));
  return g;
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function capsule(ctx, x, y, w, h, r, base) {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, shade(base, 0.7)); g.addColorStop(0.4, base); g.addColorStop(1, shade(base, 1.2));
  ctx.fillStyle = g; rr(ctx, x, y, w, h, r); ctx.fill();
}

/**
 * Draw an articulated 2-bone limb from `base` toward `target`, solving the joint
 * (elbow/knee) with law-of-cosines IK. Tapered upper + lower segments, a rounded
 * joint cap, and an optional hand/foot end cap. `bend` picks the joint side.
 * Returns the solved { mid, end } so callers can attach shoes/hands.
 */
function limb(ctx, base, target, l1, l2, bend, w, color, opts = {}) {
  const { mid, end } = twoBoneIK(base, target, l1, l2, bend);
  /**
   * One bone as a filled outline whose half-width is a function of the distance along it.
   * A straight quad from wa to wb can only ever taper in one direction, which is why the
   * limbs read as tubes: a real calf is WIDER than the knee above it before it narrows to
   * the ankle, and no monotonic taper can say that. `bulge` moves the widest point along
   * the bone and `peak` scales it, so one primitive draws both a thigh (mass at the top,
   * narrowing to the knee) and a shank (a belly a third of the way down, then a hard
   * narrowing into the ankle).
   */
  const bone = (a, b, wa, wb, col, peak = 1, bulge = 0.5) => {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
    // A bone with no bulge (peak 1 — every arm) is a plain trapezium, so take the cheap
    // 4-point path for it rather than walking the profile. Only the legs pay for the curve.
    if (peak === 1) {
      ctx.beginPath();
      ctx.moveTo(a.x + nx * wa, a.y + ny * wa); ctx.lineTo(b.x + nx * wb, b.y + ny * wb);
      ctx.lineTo(b.x - nx * wb, b.y - ny * wb); ctx.lineTo(a.x - nx * wa, a.y - ny * wa);
      ctx.closePath();
      ctx.fillStyle = lightGrad(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(wa, wb) * 1.35, col, MAT.skin);
      ctx.fill();
      return;
    }
    const N = 7;
    const wAt = (t) => {
      const lin = wa + (wb - wa) * t;
      // a smooth hump centred on `bulge`, zero at both ends, so the joints stay put
      const d = (t - bulge) / (t < bulge ? bulge : 1 - bulge || 1);
      const hump = Math.max(0, 1 - d * d);
      return lin * (1 + (peak - 1) * hump);
    };
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = i / N, ww = wAt(t);
      const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      const X = px + nx * ww, Y = py + ny * ww;
      if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    for (let i = N; i >= 0; i--) {
      const t = i / N, ww = wAt(t);
      const px = a.x + (b.x - a.x) * t, py = a.y + (b.y - a.y) * t;
      ctx.lineTo(px - nx * ww, py - ny * ww);
    }
    ctx.closePath();
    ctx.fillStyle = lightGrad(ctx, (a.x + b.x) / 2, (a.y + b.y) / 2, Math.max(wa, wb) * peak * 1.35, col, MAT.skin);
    ctx.fill();
  };
  // Width profile along the chain. The defaults are the old even taper (arms); legs pass
  // their own, measured off the reference: thigh mass at the hip, a narrow knee, a calf
  // belly wider than that knee, and an ankle at half the thigh.
  const P = opts.profile || { hip: 1, knee: 0.84, ankle: 0.68, calf: 1, calfAt: 0.5 };
  bone(base, mid, w * P.hip, w * P.knee, color, P.thighPeak || 1, P.thighAt || 0.34);
  bone(mid, end, w * P.knee, w * P.ankle, opts.lowerColor || color, P.calf, P.calfAt);
  // Knee: a slightly flattened cap across the joint, so the leg has a readable hinge
  // rather than a ball. Drawn along the shank's axis.
  const ka = Math.atan2(end.y - mid.y, end.x - mid.x);
  ctx.fillStyle = shade(color, 0.88);
  ctx.save(); ctx.translate(mid.x, mid.y); ctx.rotate(ka);
  ctx.beginPath(); ctx.ellipse(0, 0, w * (P.kneeCap || 0.82), w * (P.kneeCapW || 0.82), 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (opts.cap) { ctx.fillStyle = opts.capColor || color; ctx.beginPath(); ctx.arc(end.x, end.y, opts.cap, 0, Math.PI * 2); ctx.fill(); }
  return { mid, end };
}

function drawHair(ctx, char, hx, hy, hr, simulatedDreads = false) {
  const hc = char.hairColor || '#1a1208';
  const g = ctx.createRadialGradient(
    hx + LIGHT.x * hr * 0.45, hy + LIGHT.y * hr * 0.75, hr * 0.15, hx, hy - hr * 0.4, hr * 1.7);
  g.addColorStop(0, shade(hc, 1.35)); g.addColorStop(1, shade(hc, 0.85));
  ctx.fillStyle = g;
  switch (char.hair) {
    case 'bald': break;
    case 'buzz':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.12, hr * 0.98, Math.PI * 1.02, Math.PI * 1.98); ctx.fill(); break;
    case 'short':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.18, hr * 1.04, Math.PI, 0); ctx.fill();
      ctx.fillRect(hx - hr * 1.02, hy - hr * 0.18, hr * 2.04, hr * 0.3); break;
    case 'fade':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.22, hr * 1.02, Math.PI * 1.04, Math.PI * 1.96); ctx.fill();
      ctx.fillRect(hx - hr, hy - hr * 0.2, hr * 2, hr * 0.18); break;
    case 'highfade': {
      // flat-ish tall top, tight sides
      rr(ctx, hx - hr * 0.85, hy - hr * 1.55, hr * 1.7, hr * 0.95, hr * 0.25); ctx.fill();
      ctx.fillRect(hx - hr * 0.95, hy - hr * 0.7, hr * 0.28, hr * 0.6);
      ctx.fillRect(hx + hr * 0.67, hy - hr * 0.7, hr * 0.28, hr * 0.6); break;
    }
    case 'flattop':
      rr(ctx, hx - hr * 0.98, hy - hr * 1.45, hr * 1.96, hr * 0.85, hr * 0.14); ctx.fill(); break;
    case 'mop':
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(hx + i * hr * 0.34, hy - hr * 0.85, hr * 0.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillRect(hx - hr * 1.05, hy - hr * 0.9, hr * 2.1, hr * 0.5); break;
    case 'afro':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.55, hr * 1.55, 0, Math.PI * 2); ctx.fill(); break;
    case 'cornrows':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.2, hr * 1.02, Math.PI, 0); ctx.fill();
      ctx.strokeStyle = shade(hc, 0.6); ctx.lineWidth = Math.max(1, hr * 0.12);
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(hx + i * hr * 0.28, hy - hr * 1.15); ctx.lineTo(hx + i * hr * 0.34, hy - hr * 0.1); ctx.stroke(); }
      break;
    case 'dreads':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.35, hr * 1.12, Math.PI, 0); ctx.fill();
      // The hanging locks are skipped when the Verlet strands are simulating them — drawing
      // both stacked a static blob behind a swinging one on each side, which read as a pair
      // of headphones clamped to the head rather than as hair.
      if (!simulatedDreads) {
        for (let i = -3; i <= 3; i++) {
          const dx = hx + i * hr * 0.42; const len = hr * (1.1 + (i % 2 ? 0.3 : 0));
          rr(ctx, dx - hr * 0.14, hy - hr * 0.4, hr * 0.28, len, hr * 0.14); ctx.fill();
        }
      }
      break;
    default: break;
  }

  // STRANDS (AE12). Every style above is one solid silhouette, which reads as a moulded
  // cap rather than as hair. A few strokes following the skull — lighter where the key
  // light grazes the crown, darker at the hairline where hair meets forehead — give the
  // mass a direction and a root without touching any style's outline.
  if (char.hair === 'bald') return;
  ctx.save();
  ctx.beginPath(); ctx.arc(hx, hy - hr * 0.30, hr * 1.34, 0, Math.PI * 2); ctx.clip();
  ctx.lineCap = 'round';
  ctx.strokeStyle = shade(hc, 1.55); ctx.lineWidth = hr * 0.10;
  for (let i = -1; i <= 1; i++) {
    const a0 = Math.PI * (1.14 + i * 0.10);
    ctx.beginPath();
    ctx.arc(hx + LIGHT.x * hr * 0.18, hy - hr * 0.26, hr * (0.86 + i * 0.10), a0, a0 + 0.46);
    ctx.stroke();
  }
  // hairline: hair sits ON the forehead, it does not fade into it
  ctx.strokeStyle = shade(hc, 0.62); ctx.lineWidth = hr * 0.13;
  ctx.beginPath();
  ctx.arc(hx, hy - hr * 0.16, hr * 1.00, Math.PI * 1.06, Math.PI * 1.94);
  ctx.stroke();
  ctx.restore();
}

/**
 * Leg silhouette, as multiples of the leg's base half-width. Exported so a test can assert
 * the ORDER these read in — thigh mass, a narrower knee, a calf belly wider than that knee,
 * an ankle at about half the thigh — rather than the numbers themselves.
 */
export const LEG_PROFILE = Object.freeze({
  hip: 1.16, knee: 0.70, ankle: 0.50, calf: 1.34, calfAt: 0.32,
  thighPeak: 1.10, thighAt: 0.26, kneeCap: 0.62, kneeCapW: 0.74,
});

export function drawCharacter(ctx, char, x, y, scale, pose = 'idle', phase = 0, opts = {}) {
  const s = scale;
  const facing = opts.facing || 1;
  const trim = char.jerseyTrim || '#ffffff';
  const sqx = opts.sx || 1, sqy = opts.sy || 1;      // squash/stretch
  let lift = (opts.lift || 0) * s;                   // visual jump height (px)
  ctx.save();
  ctx.translate(x, y);
  if (sqx !== 1 || sqy !== 1) ctx.scale(sqx, sqy);   // squash/stretch around the feet

  // Animation state -> pose channels -> resolved skeleton. All of it pure (core/rig.js).
  // opts.anim is the persistent momentum state (AE2); without it the character still
  // draws, just without lean/stride scaling or limb lag — used by the pose sheet.
  const anim = opts.anim || null;
  const dims = rigDims(s, char.height, _dims);
  const P = generatePose(pose, phase, facing, s, _pose, anim, opts.shotT || 0, opts.charge || 0);
  // AE5: opts.ballAt is the ball in this character's local space, when it has one.
  if (opts.ballAt) { P.ballAt = opts.ballAt; P.twoHanded = opts.twoHanded !== false; }
  // AE3: real planted feet + the braking stance, when the caller keeps a gait state.
  if (anim && anim.gait && anim.gait.ready) {
    P.feet = gaitToLocal(anim.gait, opts.comX || 0, dims.footY);
    if (anim.stance) { P.stanceWidth = anim.stance.stanceWidth; P.hipDrop = anim.stance.hipDrop; }
  }
  // AE4: the shot chain owns the jump arc unless the caller overrode it.
  if (!opts.lift && P.shotLift) lift = P.shotLift;
  const sk = resolveRig(dims, P, (anim && anim.sk) || _sk);
  if (anim) applyLimbLag(anim, sk, opts.dt || 0);
  // AE6: crossfade away from the previous pose so a state change is a transition rather
  // than a cut, and swing the body around instead of flipping `facing` instantly.
  // AE7 secondary motion: the jersey hem (and dreads, where the character has them) are
  // Verlet strands driven only by the body moving. Created lazily so a character that is
  // never drawn costs nothing, and stepped with the body's own velocity as wind so the
  // cloth trails the direction of travel.
  let cloth = null;
  if (anim) {
    if (!anim.cloth) {
      anim.cloth = {
        hem: [makeStrand(3, 3.2 * s), makeStrand(3, 3.2 * s)],
        dread: char.hair === 'dreads' ? [makeStrand(3, 3.0 * s), makeStrand(3, 3.0 * s)] : null,
        wind: 0,
      };
    }
    cloth = anim.cloth;
    // the body's horizontal motion becomes the wind that drags the cloth behind it
    cloth.wind = -(anim.lean.v) * 260;
  }

  let turn = null;
  if (anim && anim.blend) {
    blendPose(anim.blend, sk, pose, opts.dt || 0);
    turn = updateTurn(anim.blend, facing, opts.dt || 0, anim.turnOut || (anim.turnOut = { hips: 1, shoulders: 1 }));
  }
  const { bob, lean, armUp, fall, spin, crouch } = P;

  if (pose === 'knockout') { ctx.translate(0, fall * 20 * s); ctx.rotate(spin * 0.9); ctx.globalAlpha = Math.max(0, 1 - fall * 0.6); }
  // Lean is no longer a whole-body translate: the rig carries the pelvis and up over the
  // planted feet (see resolveRig), and the upper body is shifted below, after the legs.
  ctx.translate(0, bob + crouch);
  if (opts.dim) ctx.globalAlpha *= 0.85;

  const { bodyW, bodyH, headR, big } = dims;

  // Optional glow aura (HOT / ON FIRE)
  if (opts.glow) {
    ctx.save();
    ctx.globalAlpha *= opts.glow.a ?? 0.5;
    const gg = ctx.createRadialGradient(0, -bodyH * 0.5, 4 * s, 0, -bodyH * 0.5, bodyW * 1.5);
    gg.addColorStop(0, opts.glow.color || 'rgba(255,140,26,0.7)');
    gg.addColorStop(1, 'rgba(255,140,26,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.ellipse(0, -bodyH * 0.5 - lift, bodyW * 1.5, bodyH * 1.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Contact shadow (shrinks as the player lifts off)
  ctx.save();
  ctx.globalAlpha *= 0.28;
  // A tight shadow under each foot rather than one blob under the body: in the reference
  // the ground contact reads per-foot, and it fades as that foot lifts (finding 1.0-4).
  const airFade = 1 - Math.min(0.6, lift / (60 * s || 1));
  const shY = 9 * s - bob - crouch;
  for (const k of ['l', 'r']) {
    const fx = sk.foot[k].x;
    const up = Math.max(0, dims.footY - sk.foot[k].y);        // how far this foot is lifted
    const a = airFade * Math.max(0.15, 1 - up / (8 * s));
    const rx = bodyW * 0.30 * (0.75 + 0.25 * a);
    const g = ctx.createRadialGradient(fx, shY, 0, fx, shY, rx * 1.6);
    g.addColorStop(0, 'rgba(0,0,0,' + (0.5 * a).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(fx, shY, rx, 3.6 * s, 0, 0, Math.PI * 2); ctx.fill();
    // ...and a tight core right under the sole. A soft blob alone reads as the character
    // hovering over its own shadow; the hard contact is what puts the foot ON the floor.
    ctx.fillStyle = 'rgba(0,0,0,' + (0.34 * a).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(fx, shY, rx * 0.42, 1.5 * s, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  if (lift) ctx.translate(0, -lift); // raise the body for the jump; shadow stays down

  // Legs — articulated hip→knee→ankle via 2-bone IK, with a shoe cap. Hip and foot
  // targets come from the rig; this only draws the chain between them.
  const { legL1, legL2, legW } = dims;
  // AE10 leg volume, measured off the reference: the thigh carries mass high and narrows
  // into the knee, the shank has a calf belly WIDER than that knee about a third of the way
  // down, and the ankle is roughly half the thigh. The old even taper could not express the
  // calf at all, so every leg read as a tube of constant thickness.
  const LEG = LEG_PROFILE;
  const drawLeg = (side) => {
    const k = side === 1 ? 'r' : 'l';
    const { mid, end } = limb(ctx, sk.hip[k], sk.foot[k], legL1, legL2, sk.bendLeg, legW, char.skin, { profile: LEG });
    // Occlusion: the shorts sit in front of the thigh and darken the top of it. Drawn here,
    // with the leg, so the shorts themselves (drawn later, over this) cover the upper half
    // and what survives is exactly the shaded band below the hem.
    const og = ctx.createLinearGradient(sk.hip[k].x, sk.hip[k].y, mid.x, mid.y);
    og.addColorStop(0, 'rgba(0,0,0,0.34)');
    og.addColorStop(0.62, 'rgba(0,0,0,0)');
    ctx.strokeStyle = og; ctx.lineWidth = legW * 2.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sk.hip[k].x, sk.hip[k].y); ctx.lineTo(mid.x, mid.y); ctx.stroke();
    // Sock: a light band at the ankle. It is what separates the dark shank from the shoe in
    // the reference, and at gameplay scale it is most of what makes the ankle read as narrow.
    ctx.fillStyle = '#f4f4f2';
    ctx.beginPath(); ctx.ellipse(end.x, end.y - 2.4 * s, 2.5 * s, 3.2 * s, 0, 0, Math.PI * 2); ctx.fill();
    // Shoe. The ellipse it replaces had no direction and no toe, so a planted foot and a
    // pushed-off one looked identical. This is a basketball shoe silhouette — sole slab,
    // toe box forward of the ankle, heel counter behind it, a collar rising over the
    // ankle — built in a frame rotated by sk.ankle, exactly as the ellipse was. Foot
    // POSITION is untouched: it still draws at `end`, which the gait/IK decided.
    ctx.save();
    ctx.translate(end.x, end.y + 1.2 * s);
    ctx.rotate(sk.ankle[k]);
    ctx.scale(facing, 1);                       // built pointing +x, mirrored to face
    const L = 6.9 * s, H = 3.5 * s;             // toe reach forward, upper height
    const heel = -3.5 * s;
    ctx.beginPath();
    ctx.moveTo(heel, 1.5 * s);                  // heel, at the ground
    ctx.lineTo(heel - 0.5 * s, -1.1 * s);       // heel counter, kicked up behind
    ctx.quadraticCurveTo(heel - 0.3 * s, -H, -1.0 * s, -H);   // collar over the ankle
    ctx.quadraticCurveTo(1.6 * s, -H * 0.98, 3.0 * s, -H * 0.52); // instep falling away
    ctx.quadraticCurveTo(L * 0.86, -H * 0.20, L, 0.55 * s);   // toe box
    ctx.quadraticCurveTo(L * 0.99, 1.5 * s, L - 1.0 * s, 1.5 * s); // toe meets the sole
    ctx.closePath();
    // The shoe is built in a frame rotated by the ankle and mirrored by facing, so the
    // light has to be brought INTO that frame or the gloss would swing around with the foot.
    const lx = LIGHT.x * facing, ly = LIGHT.y;
    const ca = Math.cos(-sk.ankle[k]), sa = Math.sin(-sk.ankle[k]);
    const sg = ctx.createLinearGradient(
      (lx * ca - ly * sa) * H, (lx * sa + ly * ca) * H,
      -(lx * ca - ly * sa) * H, -(lx * sa + ly * ca) * H,
    );
    sg.addColorStop(0, shade(trim, MAT.gloss.lit)); sg.addColorStop(MAT.gloss.mid, trim);
    sg.addColorStop(1, shade(trim, MAT.gloss.dark));
    ctx.fillStyle = sg; ctx.fill();
    // Sole slab: thicker at the heel, tapering to the toe — the line the shoe stands on.
    ctx.beginPath();
    ctx.moveTo(heel - 0.5 * s, 1.5 * s);
    ctx.lineTo(L - 0.6 * s, 1.5 * s);
    ctx.quadraticCurveTo(L * 0.72, 2.5 * s, 2.0 * s, 2.6 * s);
    ctx.lineTo(heel - 0.4 * s, 2.6 * s);
    ctx.closePath();
    ctx.fillStyle = shade(trim, 0.60); ctx.fill();
    // Midsole highlight, and the collar edge — two strokes that carry the shape at 66px.
    ctx.strokeStyle = shade(trim, 0.72); ctx.lineWidth = 0.7 * s;
    ctx.beginPath(); ctx.moveTo(heel, 0.4 * s); ctx.lineTo(L * 0.80, -0.1 * s); ctx.stroke();
    ctx.restore();
  };
  // draw the trailing leg first (depth), then the leading one
  const lead = facing >= 0 ? 1 : -1;
  drawLeg(-lead); drawLeg(lead);

  // Everything above the hips rides the lean AND the crouch; the feet just drawn do not.
  // Without the vertical half, a gather or a landing absorb only moved the hidden hips
  // and the character never visibly sank.
  ctx.save();
  ctx.translate(sk.lean, sk.hipDrop);
  // AE10: tilt the upper body about the pelvis. Everything from here on — shorts, jersey,
  // arms, head — rides the tilt; the legs and feet above do not, so foot planting is
  // untouched by construction.
  const tilt = sk.leanAngle || 0;
  if (tilt) { ctx.translate(0, dims.hipY); ctx.rotate(tilt); ctx.translate(0, -dims.hipY); }
  // A hand that is holding something is posed to a point in the WORLD — the ball the scene
  // drew (AE5), or the release point the shot chain owns (AE4) — not to a point on the
  // body. Rotating the frame under it would carry it off that point, so those hands get
  // the inverse rotation and land exactly where the rig put them. The shoulder still
  // leads, which is the whole intent; only the far end of the arm is pinned.
  if (tilt && (P.ballAt || pose === 'shoot' || pose === 'aim')) {
    const ca = Math.cos(-tilt), sa = Math.sin(-tilt);
    for (const k of ['l', 'r']) {
      const h = sk.hand[k], dx = h.x, dy = h.y - dims.hipY;
      h.x = dx * ca - dy * sa;
      h.y = dims.hipY + dx * sa + dy * ca;
    }
  }
  // AE6 turn, corrected: the scale is applied ONLY to the torso and shorts below, never to
  // the arms or legs. Those are IK chains solved to real targets — a planted foot, a hand on
  // the ball — and squashing them horizontally distorts the solved geometry, which showed up
  // in-game as legs splaying off at impossible angles whenever the player turned. A box with
  // a number on it reads as rotating when it narrows; a limb just reads as broken.
  const turnX = turn ? turn.shoulders : 1;
  const hipTurnX = turn ? turn.hips : 1;

  // Shorts. AE8: raised to the new hip line and shortened, so the thigh and knee show.
  // They used to reach to +7s against a foot line of +13.5s, hiding two thirds of the leg
  // — and with it every knee bend, foot plant and ankle angle the gait produces.
  // AE9: the shorts are wider than the jersey hem above them. Basketball shorts flare out
  // from the waist; drawn narrower than the torso they read as trousers painted on the box.
  const shortsY = dims.shortsY, shortsH = dims.shortsH, shortsW = bodyW + 2 * s;
  ctx.save(); ctx.scale(hipTurnX, 1);
  ctx.fillStyle = lightGrad(ctx, 0, shortsY + shortsH / 2, shortsW * 0.58, char.shorts, MAT.cloth); rr(ctx, -shortsW / 2, shortsY, shortsW, shortsH, 3 * s); ctx.fill();
  ctx.fillStyle = trim; // side stripes
  ctx.fillRect(-shortsW / 2, shortsY, 2.4 * s, shortsH);
  ctx.fillRect(shortsW / 2 - 2.4 * s, shortsY, 2.4 * s, shortsH);
  // leg-opening hem: the shorts end in a band, which is what separates cloth from thigh
  ctx.fillStyle = shade(char.shorts, 0.72);
  ctx.fillRect(-shortsW / 2, shortsY + shortsH - 1.6 * s, shortsW, 1.6 * s);
  ctx.fillStyle = shade(trim, 0.9); // logo patch
  rr(ctx, -bodyW * 0.16, shortsY + shortsH * 0.5, bodyW * 0.14, shortsH * 0.28, 1.5 * s); ctx.fill();
  ctx.restore();

  // AE7: the jersey hem, hanging off the bottom of the shorts and swinging with the body
  if (cloth) {
    const dtc = opts.dt || 0;
    const hemY = shortsY + shortsH;
    cloth.hem.forEach((st, i) => {
      const ax = (i === 0 ? -1 : 1) * shortsW * 0.33;
      updateStrand(st, ax, hemY, dtc, cloth.wind);
      ctx.strokeStyle = shade(char.shorts, 0.85);
      ctx.lineWidth = 3.2 * s; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(st.pts[0].x, st.pts[0].y);
      for (let k = 1; k < st.n; k++) ctx.lineTo(st.pts[k].x, st.pts[k].y);
      ctx.stroke();
    });
  }

  // Arms — articulated shoulder→elbow→wrist via 2-bone IK. The rig decides where each
  // hand goes (shot release point, guide hand, arm pump, celebrate, knockout); this draws it.
  const { armL1, armL2, armW } = dims;
  const sleeveLower = char.sleeve ? (char.sleeveColor || '#222') : char.skin;
  const handR = armW * 0.86;   // a hand, not a dot: at 0.66 the arm just ended bluntly
  /**
   * A hand (AE12). The wrist cap was a circle, which at any zoom is a knob on the end of a
   * tube. This is a palm angled along the forearm with a thumb off its inner edge — two
   * marks, but they are the two that make an arm end in a hand. When the character is
   * holding the ball the palm turns to face it and the thumb rides under, which is the
   * difference between gripping and touching.
   */
  const drawHand = (k) => {
    const j = twoBoneIK(sk.shoulder[k], sk.hand[k], armL1, armL2, sk.bendArm[k]);
    const w = sk.hand[k];
    const ang = Math.atan2(w.y - j.mid.y, w.x - j.mid.x);   // along the forearm
    const side = k === 'l' ? -1 : 1;
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(ang);
    ctx.fillStyle = lightGrad(ctx, 0, 0, handR * 1.4, char.skin, MAT.skin);
    ctx.beginPath();
    ctx.ellipse(handR * 0.28, 0, handR * 1.18, handR * 0.94, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(char.skin, 0.94);
    ctx.beginPath();
    ctx.ellipse(handR * 0.10, side * handR * 0.72, handR * 0.52, handR * 0.34, side * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const drawArmL = () => { limb(ctx, sk.shoulder.l, sk.hand.l, armL1, armL2, sk.bendArm.l, armW, char.skin, { lowerColor: char.sleeve ? sleeveLower : char.skin }); drawHand('l'); };
  const drawArmR = () => { limb(ctx, sk.shoulder.r, sk.hand.r, armL1, armL2, sk.bendArm.r, armW, char.skin, { lowerColor: sleeveLower }); drawHand('r'); };
  // Back arm (away from camera) goes behind the jersey; the front arm is drawn
  // after the torso so it reads on top. `facing >= 0` ⇒ right arm is the front one.
  const frontSide = facing >= 0 ? 'r' : 'l';
  const drawFrontArm = facing >= 0 ? drawArmR : drawArmL;
  // Depth rule: an arm raised above the head (a shot release, a celebration, a rebound
  // reach) has to be drawn OVER the head, or the pose that matters most is hidden by it.
  const armOverHead = sk.hand[frontSide].y < sk.head.y;
  (facing >= 0 ? drawArmL : drawArmR)();

  // Neck — drawn before the torso so the jersey collar overlaps it. Without this the head
  // sat straight on a box, which is a large part of why the figure read as a toy.
  ctx.save(); ctx.scale(turnX, 1);
  ctx.fillStyle = shade(char.skin, 0.82);
  rr(ctx, -dims.neckW / 2, dims.neckY - 6 * s, dims.neckW, 9 * s, 2 * s); ctx.fill();

  // Torso — jersey, shaded across the body AND down it so it reads as a volume rather
  // than a flat panel.
  // AE9: the jersey stops at the waistband instead of hanging to mid-thigh over the
  // shorts. Live QA showed the old hem covered 8 of the shorts' 10s, so collar-to-thigh
  // was one unbroken green mass and the hips had no visible line at all.
  const jerseyH = dims.jerseyHemY - -bodyH;
  ctx.fillStyle = lightGrad(ctx, 0, -bodyH + jerseyH / 2, bodyW * 0.60, char.jersey, MAT.cloth);
  rr(ctx, -bodyW / 2, -bodyH, bodyW, jerseyH, 6.5 * s); ctx.fill();
  // shoulder caps: deltoid mass so the arms grow out of the body instead of floating
  ctx.fillStyle = shade(char.jersey, 0.92);
  ctx.beginPath();
  ctx.ellipse(-bodyW * 0.44, -bodyH * 0.80, bodyW * 0.17, bodyH * 0.13, 0, 0, Math.PI * 2);
  ctx.ellipse(bodyW * 0.44, -bodyH * 0.80, bodyW * 0.17, bodyH * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  // vertical form: light on the chest, shadow toward the hem
  const tv = ctx.createLinearGradient(0, -bodyH, 0, dims.jerseyHemY);
  tv.addColorStop(0, 'rgba(255,255,255,0.13)');
  tv.addColorStop(0.45, 'rgba(255,255,255,0)');
  tv.addColorStop(1, 'rgba(0,0,0,0.20)');
  ctx.fillStyle = tv; rr(ctx, -bodyW / 2, -bodyH, bodyW, jerseyH, 6.5 * s); ctx.fill();
  // Hem edge. The jersey and the shorts are two shades of one team colour, and at the
  // ~66px the character actually occupies in play a shade step alone does not carry — the
  // two blocks fused back into one. A lit edge along the hem is what the reference shows
  // (cloth catches light where it ends) and it is the line that makes the waist read.
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(-bodyW / 2 + 1 * s, dims.jerseyHemY - 1.2 * s, bodyW - 2 * s, 1.2 * s);
  // FOLDS (AE12). A jersey drawn as one filled rounded rect is a painted panel: it cannot
  // say that there is cloth hanging on a body underneath it. Three cheap creases do —
  // one from each armpit, one across the waist — and because their depth is driven by the
  // lean and the turn the shirt gathers when the body works and settles when it does not.
  const workT = Math.min(1, Math.abs(sk.leanAngle || 0) / 0.26 + Math.abs(1 - (turn ? turn.shoulders : 1)) * 1.4);
  const fold = 0.05 + 0.10 * workT;
  ctx.save();
  rr(ctx, -bodyW / 2, -bodyH, bodyW, jerseyH, 6.5 * s); ctx.clip();
  ctx.strokeStyle = 'rgba(0,0,0,' + fold.toFixed(3) + ')';
  ctx.lineWidth = 2.0 * s; ctx.lineCap = 'round';
  ctx.beginPath();
  // armpit creases, sweeping in and down toward the opposite hip
  ctx.moveTo(-bodyW * 0.46, -bodyH * 0.70);
  ctx.quadraticCurveTo(-bodyW * 0.12, -bodyH * 0.56, bodyW * 0.10, -bodyH * 0.40);
  ctx.moveTo(bodyW * 0.46, -bodyH * 0.70);
  ctx.quadraticCurveTo(bodyW * 0.16, -bodyH * 0.54, -bodyW * 0.06, -bodyH * 0.36);
  // the shirt gathers just above the hem, where it meets the shorts
  ctx.moveTo(-bodyW * 0.40, dims.jerseyHemY - 4.5 * s);
  ctx.quadraticCurveTo(0, dims.jerseyHemY - 2.6 * s, bodyW * 0.40, dims.jerseyHemY - 4.8 * s);
  ctx.stroke();
  // the lit side of each crease
  ctx.strokeStyle = 'rgba(255,255,255,' + (fold * 0.55).toFixed(3) + ')';
  ctx.lineWidth = 1.1 * s;
  ctx.beginPath();
  ctx.moveTo(-bodyW * 0.46, -bodyH * 0.70 - 1.4 * s);
  ctx.quadraticCurveTo(-bodyW * 0.12, -bodyH * 0.56 - 1.4 * s, bodyW * 0.10, -bodyH * 0.40 - 1.4 * s);
  ctx.stroke();
  ctx.restore();

  // side stripes (trim)
  ctx.fillStyle = trim;
  ctx.fillRect(-bodyW / 2, -bodyH + 4 * s, 2.4 * s, jerseyH - 4 * s);
  ctx.fillRect(bodyW / 2 - 2.4 * s, -bodyH + 4 * s, 2.4 * s, jerseyH - 4 * s);
  // neckline (trim V)
  ctx.strokeStyle = trim; ctx.lineWidth = 2.2 * s; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-bodyW * 0.22, -bodyH + 1 * s); ctx.lineTo(0, -bodyH + 6 * s); ctx.lineTo(bodyW * 0.22, -bodyH + 1 * s); ctx.stroke();
  // Jersey text. The AE6 turn draws the torso under a negative horizontal scale as the
  // body swings around, which mirrors everything inside it — including the wordmark and
  // the number, which then read backwards. Undo that flip for the text only.
  ctx.save();
  if (turnX < 0) ctx.scale(-1, 1);
  if (char.team) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `900 ${4.6 * s * big}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(char.team, 0, -bodyH + 8.8 * s);
  }
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${13 * s * big}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // Centred between the shoulder line and the hem. At -bodyH*0.42 the glyphs hung 4s past
  // the shortened hem and sat on the shorts.
  const numY = (dims.shoulderY + dims.jerseyHemY) / 2;
  ctx.fillText(String(char.number), 0, numY);
  ctx.strokeStyle = trim; ctx.lineWidth = 0.8 * s; ctx.strokeText(String(char.number), 0, numY);
  ctx.restore();

  // Highlight down the LIT edge of the torso, and a contact-dark edge down the other one.
  // The highlight used to sit on the right while the head was lit from the upper left; a
  // torso lit from one side and a head from the other is exactly what stops a figure
  // reading as one solid.
  ctx.save();
  const litX = LIGHT.x < 0 ? -bodyW / 2 + 0.8 * s : bodyW / 2 - 0.8 * s;
  ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(litX, -bodyH + 7 * s); ctx.lineTo(litX, dims.jerseyHemY - 2 * s); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.16)'; ctx.lineWidth = 2.2 * s;
  ctx.beginPath();
  ctx.moveTo(-litX, -bodyH + 8 * s); ctx.lineTo(-litX, dims.jerseyHemY - 2 * s); ctx.stroke();
  ctx.restore();
  ctx.restore(); // end of the turned torso

  // Occlusion: the front arm is between the light and the chest, so it casts onto the
  // jersey. Nothing in the figure cast onto anything else before this, and a shape with no
  // shadow under it cannot read as being IN FRONT of what it overlaps — it just reads as a
  // sticker. Offset away from the light, clipped to the jersey so it cannot spill onto the
  // court, and matched to the torso's turn scale so it stays on the cloth through a turn.
  const castArm = (k) => {
    const j = twoBoneIK(sk.shoulder[k], sk.hand[k], armL1, armL2, sk.bendArm[k]);
    const ox = -LIGHT.x * 3.0 * s, oy = -LIGHT.y * 3.0 * s;
    const tw = Math.abs(bodyW * (turn ? turn.shoulders : 1));
    ctx.save();
    rr(ctx, -tw / 2, -bodyH, tw, jerseyH, 6.5 * s); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = armW * 2.0;
    ctx.beginPath();
    ctx.moveTo(sk.shoulder[k].x + ox, sk.shoulder[k].y + oy);
    ctx.lineTo(j.mid.x + ox, j.mid.y + oy);
    ctx.lineTo(sk.hand[k].x + ox, sk.hand[k].y + oy);
    ctx.stroke();
    ctx.restore();
  };
  castArm(frontSide);

  // Front arm — drawn over the jersey so the shooting/guide hand reads on top.
  if (!armOverHead) drawFrontArm();

  // Head — sphere-shaded
  // AE5: the head counters part of the torso lean so it stays level over the body,
  // instead of being dragged along by it (frame finding 1.0-5).
  const hx = sk.head.x + sk.headStab, hy = sk.head.y;
  // The head rides the tilted frame with the rest of the upper body, but a runner's head
  // stays close to level — the neck absorbs most of the torso angle. Counter-rotate the
  // head group about its own centre so it keeps a little of the lean and loses the rest.
  ctx.save();
  if (tilt) { ctx.translate(hx, hy); ctx.rotate(-tilt * 0.7); ctx.translate(-hx, -hy); }
  // Occlusion: the jaw onto the collar. Without it the head sits on the shoulders like a
  // ball balanced on a box, which is most of what made the neck added in AE8 not pay off.
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.beginPath();
  ctx.ellipse(hx - LIGHT.x * headR * 0.30, hy + headR * 1.02, headR * 0.80, headR * 0.40, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const hg = ctx.createRadialGradient(
    hx + LIGHT.x * headR * 0.5, hy + LIGHT.y * headR * 0.5, headR * 0.12, hx, hy, headR * 1.15);
  hg.addColorStop(0, shade(char.skin, MAT.skin.lit)); hg.addColorStop(0.68, char.skin);
  hg.addColorStop(1, shade(char.skin, MAT.skin.dark));
  ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, headR, 0, Math.PI * 2); ctx.fill();
  // ears
  ctx.fillStyle = shade(char.skin, 0.9);
  ctx.beginPath(); ctx.arc(hx - headR, hy, headR * 0.3, 0, Math.PI * 2); ctx.arc(hx + headR, hy, headR * 0.3, 0, Math.PI * 2); ctx.fill();

  // Beard (behind hair, around jaw)
  if (char.beard) {
    ctx.fillStyle = shade(char.hairColor || '#1a1208', 0.9);
    if (char.beard === 'goatee') {
      ctx.beginPath(); ctx.ellipse(hx, hy + headR * 0.7, headR * 0.34, headR * 0.34, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(hx, hy + headR * 0.15, headR * 0.98, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.lineTo(hx - headR * 0.5, hy + headR * 0.2);
      ctx.closePath(); ctx.fill();
    }
  }

  drawHair(ctx, char, hx, hy, headR, !!(cloth && cloth.dread));

  // AE7: dreads get real swing on top of the drawn hair, anchored at the head
  if (cloth && cloth.dread) {
    const dtc = opts.dt || 0;
    cloth.dread.forEach((st, i) => {
      const ax = hx + (i === 0 ? -1 : 1) * headR * 0.52;
      const ay = hy + headR * 0.10;
      updateStrand(st, ax, ay, dtc, cloth.wind);
      ctx.strokeStyle = shade(char.hairColor || '#1a1208', 0.9);
      ctx.lineWidth = headR * 0.17; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(st.pts[0].x, st.pts[0].y);
      for (let k = 1; k < st.n; k++) ctx.lineTo(st.pts[k].x, st.pts[k].y);
      ctx.stroke();
    });
  }

  if (char.headband) {
    // Sits on the FOREHEAD, above the brow. It used to run to hy + 0.02R — eye level — so
    // once AE11 gave the face brows the two occupied the same band and a headband character
    // simply lost its expression under a stripe of team colour.
    ctx.fillStyle = char.headbandColor || '#fff';
    rr(ctx, hx - headR, hy - headR * 0.68, headR * 2, headR * 0.40, headR * 0.2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    rr(ctx, hx - headR, hy - headR * 0.68, headR * 2, headR * 0.14, headR * 0.2); ctx.fill();
  }

  // Face
  const eyeY = hy + (pose === 'knockout' ? headR * 0.08 : 0);

  // FACE STRUCTURE (AE11). The face was two white ellipses, two pupils and an arc: an
  // emoji stuck on a sphere. However well the body is animated, a face with no brow, no
  // nose and no cheek caps how finished the whole figure can look. These four marks are
  // the cheapest ones that read at the ~17px the face actually occupies in play, and they
  // all take their direction from the same key light as the body.
  ctx.save();
  ctx.beginPath(); ctx.arc(hx, hy, headR, 0, Math.PI * 2); ctx.clip();
  // cheek / jaw: the shadow side of a sphere is not a gradient stop, it is a shaped mass
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.beginPath();
  ctx.ellipse(hx - LIGHT.x * headR * 0.72, hy + headR * 0.16, headR * 0.62, headR * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  // brow ridge: a soft band across the top of the eyes so they sit IN the skull
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(hx, eyeY - headR * 0.30, headR * 0.86, headR * 0.30, 0, 0, Math.PI * 2);
  ctx.fill();
  // nose: a wedge of shaded skin on the shadow side of the centre line, with the tip
  // catching the light. At this scale the shadow IS the nose — an outline would fill in.
  const nx0 = hx - LIGHT.x * headR * 0.06;
  ctx.fillStyle = shade(char.skin, 0.78);
  ctx.beginPath();
  ctx.moveTo(nx0 - headR * 0.05, eyeY + headR * 0.04);
  ctx.quadraticCurveTo(nx0 - LIGHT.x * headR * 0.16, eyeY + headR * 0.30, nx0 + headR * 0.02, eyeY + headR * 0.33);
  ctx.quadraticCurveTo(nx0 + headR * 0.13, eyeY + headR * 0.28, nx0 + headR * 0.09, eyeY + headR * 0.05);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = shade(char.skin, 1.18);
  ctx.beginPath();
  ctx.ellipse(nx0 + LIGHT.x * headR * 0.05, eyeY + headR * 0.20, headR * 0.07, headR * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (pose === 'knockout') {
    ctx.strokeStyle = '#20140c'; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
    for (const ex of [-headR * 0.42, headR * 0.42]) {
      ctx.beginPath();
      ctx.moveTo(hx + ex - 3 * s, eyeY - 3 * s); ctx.lineTo(hx + ex + 3 * s, eyeY + 3 * s);
      ctx.moveTo(hx + ex + 3 * s, eyeY - 3 * s); ctx.lineTo(hx + ex - 3 * s, eyeY + 3 * s); ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(hx - headR * 0.4, eyeY, 3 * s, 3.4 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(hx + headR * 0.4, eyeY, 3 * s, 3.4 * s, 0, 0, Math.PI * 2); ctx.fill();
    // AE5: the gaze tracks the ball when there is one, and otherwise looks where the
    // player is facing. Eyes that follow the ball are a large part of why the reference
    // reads as a player rather than a sprite.
    const gaze = sk.headAim !== 0 ? sk.headAim : facing * 0.4;
    ctx.fillStyle = '#20140c';
    ctx.beginPath();
    ctx.arc(hx - headR * 0.4 + gaze * 1.5 * s, eyeY, 1.7 * s, 0, Math.PI * 2);
    ctx.arc(hx + headR * 0.4 + gaze * 1.5 * s, eyeY, 1.7 * s, 0, Math.PI * 2); ctx.fill();
    // Upper lid. A full white oval with a dot in it is a googly eye however well the rest
    // of the head is modelled; letting the lid cut the top off the iris is the single mark
    // that makes an eye read as an eye. Clipped to the whites so it cannot spill onto skin.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(hx - headR * 0.4, eyeY, 3 * s, 3.4 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(hx + headR * 0.4, eyeY, 3 * s, 3.4 * s, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = shade(char.skin, 0.86);
    ctx.fillRect(hx - headR, eyeY - 4 * s, headR * 2, 2.0 * s);
    ctx.restore();
    // and a catchlight on the light's side, which is what makes an eye look wet
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(hx - headR * 0.4 + gaze * 1.5 * s + LIGHT.x * 1.1 * s, eyeY + LIGHT.y * 1.0 * s, 0.62 * s, 0, Math.PI * 2);
    ctx.arc(hx + headR * 0.4 + gaze * 1.5 * s + LIGHT.x * 1.1 * s, eyeY + LIGHT.y * 1.0 * s, 0.62 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Brows, on every pose rather than only the shot — they are the face's whole expression
  // budget at this size. `tilt` is how far the inner end drops: positive is a focused
  // scowl, negative the raised inner brow of surprise or of being knocked down.
  if (pose !== 'knockout') {
    const tilt = pose === 'aim' || pose === 'shoot' ? 1
      : pose === 'celebrate' ? -0.7
        : pose === 'run' || pose === 'rebound' ? 0.45 : 0.18;
    ctx.strokeStyle = shade(char.hairColor || '#20140c', 0.85);
    ctx.lineWidth = 1.7 * s; ctx.lineCap = 'round';
    const outY = eyeY - headR * (0.34 + 0.04 * tilt);
    const inY = eyeY - headR * (0.34 - 0.20 * tilt);
    ctx.beginPath();
    ctx.moveTo(hx - headR * 0.66, outY); ctx.lineTo(hx - headR * 0.16, inY);
    ctx.moveTo(hx + headR * 0.66, outY); ctx.lineTo(hx + headR * 0.16, inY);
    ctx.stroke();
  }
  // mouth
  ctx.strokeStyle = '#20140c'; ctx.lineWidth = 1.7 * s; ctx.lineCap = 'round';
  ctx.beginPath();
  const my = hy + headR * 0.52;
  if (pose === 'celebrate') ctx.arc(hx, my - 2 * s, headR * 0.36, 0.12 * Math.PI, 0.88 * Math.PI);
  else if (pose === 'knockout') ctx.arc(hx, my + 3 * s, headR * 0.3, 1.15 * Math.PI, 1.85 * Math.PI);
  else if (pose === 'aim' || pose === 'shoot') { ctx.moveTo(hx - headR * 0.18, my); ctx.lineTo(hx + headR * 0.18, my); }
  else if (pose === 'run' || pose === 'rebound') {
    // running is effortful: the mouth is open, not smiling
    ctx.stroke();
    ctx.fillStyle = '#40241a';
    ctx.beginPath(); ctx.ellipse(hx, my, headR * 0.14, headR * 0.10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
  } else ctx.arc(hx, my - 1 * s, headR * 0.22, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  // head rim light
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.4 * s;
  ctx.beginPath(); ctx.arc(hx, hy, headR - 0.8 * s, Math.PI * 1.15, Math.PI * 1.55); ctx.stroke();

  ctx.restore(); // end of the head's counter-rotation — after the face, not before it

  if (armOverHead) drawFrontArm();

  ctx.restore(); // end of the leaned upper body
  ctx.restore();
}
