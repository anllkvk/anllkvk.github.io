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
  const seg = (a, b, wa, wb, col) => {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(a.x + nx * wa, a.y + ny * wa); ctx.lineTo(b.x + nx * wb, b.y + ny * wb);
    ctx.lineTo(b.x - nx * wb, b.y - ny * wb); ctx.lineTo(a.x - nx * wa, a.y - ny * wa);
    ctx.closePath();
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    g.addColorStop(0, shade(col, 0.82)); g.addColorStop(1, shade(col, 1.12));
    ctx.fillStyle = g; ctx.fill();
  };
  seg(base, mid, w, w * 0.84, color);
  seg(mid, end, w * 0.84, w * 0.68, opts.lowerColor || color);
  ctx.fillStyle = shade(color, 0.9);
  ctx.beginPath(); ctx.arc(mid.x, mid.y, w * 0.82, 0, Math.PI * 2); ctx.fill();
  if (opts.cap) { ctx.fillStyle = opts.capColor || color; ctx.beginPath(); ctx.arc(end.x, end.y, opts.cap, 0, Math.PI * 2); ctx.fill(); }
  return { mid, end };
}

function drawHair(ctx, char, hx, hy, hr, simulatedDreads = false) {
  const hc = char.hairColor || '#1a1208';
  const g = ctx.createRadialGradient(hx - hr * 0.3, hy - hr * 0.9, hr * 0.15, hx, hy - hr * 0.4, hr * 1.7);
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
}

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
  }
  ctx.restore();

  if (lift) ctx.translate(0, -lift); // raise the body for the jump; shadow stays down

  // Legs — articulated hip→knee→ankle via 2-bone IK, with a shoe cap. Hip and foot
  // targets come from the rig; this only draws the chain between them.
  const { legL1, legL2, legW } = dims;
  const drawLeg = (side) => {
    const k = side === 1 ? 'r' : 'l';
    const { end } = limb(ctx, sk.hip[k], sk.foot[k], legL1, legL2, sk.bendLeg, legW, char.skin);
    // sock band + shoe. The shoe rotates with the ankle — flat while the foot is planted,
    // toe pointed just after push-off. Frame finding 1.0-1: that angle, not the foot's
    // position, is what makes a stride read as a real push rather than a slide.
    ctx.fillStyle = '#f2f2f2';
    ctx.beginPath(); ctx.arc(end.x, end.y - 1.5 * s, 3.4 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(trim, 1.0);
    ctx.save(); ctx.translate(end.x, end.y + 1.5 * s); ctx.rotate(sk.ankle[k]);
    ctx.beginPath(); ctx.ellipse(facing * 1.6 * s, 0, 5.6 * s, 3.1 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shade(trim, 0.7); ctx.fillRect(-5.6 * s + facing * 1.6 * s, 1.4 * s, 11.2 * s, 1.4 * s);
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
  const shg = ctx.createLinearGradient(-bodyW / 2, 0, bodyW / 2, 0);
  shg.addColorStop(0, shade(char.shorts, 0.72)); shg.addColorStop(0.5, char.shorts); shg.addColorStop(1, shade(char.shorts, 1.18));
  ctx.save(); ctx.scale(hipTurnX, 1);
  ctx.fillStyle = shg; rr(ctx, -shortsW / 2, shortsY, shortsW, shortsH, 3 * s); ctx.fill();
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
  const drawArmL = () => limb(ctx, sk.shoulder.l, sk.hand.l, armL1, armL2, sk.bendArm.l, armW, char.skin, { cap: handR, capColor: shade(char.skin, 1.05), lowerColor: char.sleeve ? sleeveLower : char.skin });
  const drawArmR = () => limb(ctx, sk.shoulder.r, sk.hand.r, armL1, armL2, sk.bendArm.r, armW, char.skin, { cap: handR, capColor: shade(char.skin, 1.05), lowerColor: sleeveLower });
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
  const tg = ctx.createLinearGradient(-bodyW / 2, 0, bodyW / 2, 0);
  tg.addColorStop(0, shade(char.jersey, 0.62)); tg.addColorStop(0.45, char.jersey); tg.addColorStop(1, shade(char.jersey, 1.24));
  ctx.fillStyle = tg; rr(ctx, -bodyW / 2, -bodyH, bodyW, jerseyH, 6.5 * s); ctx.fill();
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

  // Rim light down the lit edge of the torso — cheap separation from the background,
  // and the main thing that stops a flat fill reading as cardboard.
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1.6 * s;
  ctx.beginPath();
  ctx.moveTo(bodyW / 2 - 0.8 * s, -bodyH + 7 * s);
  ctx.lineTo(bodyW / 2 - 0.8 * s, dims.jerseyHemY - 2 * s);
  ctx.stroke();
  ctx.restore();
  ctx.restore(); // end of the turned torso

  // Front arm — drawn over the jersey so the shooting/guide hand reads on top.
  if (!armOverHead) drawFrontArm();

  // Head — sphere-shaded
  // AE5: the head counters part of the torso lean so it stays level over the body,
  // instead of being dragged along by it (frame finding 1.0-5).
  const hx = sk.head.x + sk.headStab, hy = sk.head.y;
  const hg = ctx.createRadialGradient(hx - headR * 0.35, hy - headR * 0.4, headR * 0.12, hx, hy, headR * 1.15);
  hg.addColorStop(0, shade(char.skin, 1.2)); hg.addColorStop(0.7, char.skin); hg.addColorStop(1, shade(char.skin, 0.72));
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
    ctx.fillStyle = char.headbandColor || '#fff';
    rr(ctx, hx - headR, hy - headR * 0.42, headR * 2, headR * 0.44, headR * 0.2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    rr(ctx, hx - headR, hy - headR * 0.42, headR * 2, headR * 0.15, headR * 0.2); ctx.fill();
  }

  // Face
  const eyeY = hy + (pose === 'knockout' ? headR * 0.08 : 0);
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
  }
  // brow for intensity
  if (pose === 'aim' || pose === 'shoot') {
    ctx.strokeStyle = '#20140c'; ctx.lineWidth = 1.6 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hx - headR * 0.62, eyeY - headR * 0.32); ctx.lineTo(hx - headR * 0.18, eyeY - headR * 0.16);
    ctx.moveTo(hx + headR * 0.62, eyeY - headR * 0.32); ctx.lineTo(hx + headR * 0.18, eyeY - headR * 0.16); ctx.stroke();
  }
  // mouth
  ctx.strokeStyle = '#20140c'; ctx.lineWidth = 1.7 * s; ctx.lineCap = 'round';
  ctx.beginPath();
  const my = hy + headR * 0.52;
  if (pose === 'celebrate') ctx.arc(hx, my - 2 * s, headR * 0.36, 0.12 * Math.PI, 0.88 * Math.PI);
  else if (pose === 'knockout') ctx.arc(hx, my + 3 * s, headR * 0.3, 1.15 * Math.PI, 1.85 * Math.PI);
  else if (pose === 'aim' || pose === 'shoot') { ctx.moveTo(hx - headR * 0.18, my); ctx.lineTo(hx + headR * 0.18, my); }
  else ctx.arc(hx, my - 1 * s, headR * 0.22, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  // head rim light
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.4 * s;
  ctx.beginPath(); ctx.arc(hx, hy, headR - 0.8 * s, Math.PI * 1.15, Math.PI * 1.55); ctx.stroke();

  if (armOverHead) drawFrontArm();

  ctx.restore(); // end of the leaned upper body
  ctx.restore();
}
