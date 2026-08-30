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

function drawHair(ctx, char, hx, hy, hr) {
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
      for (let i = -3; i <= 3; i++) {
        const dx = hx + i * hr * 0.42; const len = hr * (1.1 + (i % 2 ? 0.3 : 0));
        rr(ctx, dx - hr * 0.14, hy - hr * 0.4, hr * 0.28, len, hr * 0.14); ctx.fill();
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
  const lift = (opts.lift || 0) * s;                 // visual jump height (px)
  ctx.save();
  ctx.translate(x, y);
  if (sqx !== 1 || sqy !== 1) ctx.scale(sqx, sqy);   // squash/stretch around the feet

  // Animation state -> pose channels -> resolved skeleton. All of it pure (core/rig.js).
  // opts.anim is the persistent momentum state (AE2); without it the character still
  // draws, just without lean/stride scaling or limb lag — used by the pose sheet.
  const anim = opts.anim || null;
  const dims = rigDims(s, char.height, _dims);
  const P = generatePose(pose, phase, facing, s, _pose, anim);
  // AE3: real planted feet + the braking stance, when the caller keeps a gait state.
  if (anim && anim.gait && anim.gait.ready) {
    P.feet = gaitToLocal(anim.gait, opts.comX || 0, dims.footY);
    if (anim.stance) { P.stanceWidth = anim.stance.stanceWidth; P.hipDrop = anim.stance.hipDrop; }
  }
  const sk = resolveRig(dims, P, (anim && anim.sk) || _sk);
  if (anim) applyLimbLag(anim, sk, opts.dt || 0);
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

  // Everything above the hips rides the lean; the feet just drawn do not.
  ctx.save();
  ctx.translate(sk.lean, 0);

  // Shorts (over the top of the thighs) — NBA format: main + side stripe + patch
  const shortsY = -6 * s, shortsH = 13 * s;
  const shg = ctx.createLinearGradient(-bodyW / 2, 0, bodyW / 2, 0);
  shg.addColorStop(0, shade(char.shorts, 0.72)); shg.addColorStop(0.5, char.shorts); shg.addColorStop(1, shade(char.shorts, 1.18));
  ctx.fillStyle = shg; rr(ctx, -bodyW / 2 + 1 * s, shortsY, bodyW - 2 * s, shortsH, 3 * s); ctx.fill();
  ctx.fillStyle = trim; // side stripes
  ctx.fillRect(-bodyW / 2 + 1 * s, shortsY, 2.4 * s, shortsH);
  ctx.fillRect(bodyW / 2 - 3.4 * s, shortsY, 2.4 * s, shortsH);
  ctx.fillStyle = shade(trim, 0.9); // logo patch
  rr(ctx, -bodyW * 0.16, shortsY + shortsH * 0.5, bodyW * 0.14, shortsH * 0.28, 1.5 * s); ctx.fill();

  // Arms — articulated shoulder→elbow→wrist via 2-bone IK. The rig decides where each
  // hand goes (shot release point, guide hand, arm pump, celebrate, knockout); this draws it.
  const { armL1, armL2, armW } = dims;
  const sleeveLower = char.sleeve ? (char.sleeveColor || '#222') : char.skin;
  const drawArmL = () => limb(ctx, sk.shoulder.l, sk.hand.l, armL1, armL2, sk.bendArm.l, armW, char.skin, { cap: armW * 0.66, capColor: shade(char.skin, 1.05), lowerColor: char.sleeve ? sleeveLower : char.skin });
  const drawArmR = () => limb(ctx, sk.shoulder.r, sk.hand.r, armL1, armL2, sk.bendArm.r, armW, char.skin, { cap: armW * 0.66, capColor: shade(char.skin, 1.05), lowerColor: sleeveLower });
  // Back arm (away from camera) goes behind the jersey; the front arm is drawn
  // after the torso so it reads on top. `facing >= 0` ⇒ right arm is the front one.
  const drawFrontArm = facing >= 0 ? drawArmR : drawArmL;
  (facing >= 0 ? drawArmL : drawArmR)();

  // Torso — jersey main color, shaded
  const tg = ctx.createLinearGradient(-bodyW / 2, 0, bodyW / 2, 0);
  tg.addColorStop(0, shade(char.jersey, 0.66)); tg.addColorStop(0.45, char.jersey); tg.addColorStop(1, shade(char.jersey, 1.22));
  ctx.fillStyle = tg; rr(ctx, -bodyW / 2, -bodyH, bodyW, bodyH * 0.82, 6 * s); ctx.fill();
  // side stripes (trim)
  ctx.fillStyle = trim;
  ctx.fillRect(-bodyW / 2, -bodyH + 4 * s, 2.4 * s, bodyH * 0.7);
  ctx.fillRect(bodyW / 2 - 2.4 * s, -bodyH + 4 * s, 2.4 * s, bodyH * 0.7);
  // neckline (trim V)
  ctx.strokeStyle = trim; ctx.lineWidth = 2.2 * s; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-bodyW * 0.22, -bodyH + 1 * s); ctx.lineTo(0, -bodyH + 6 * s); ctx.lineTo(bodyW * 0.22, -bodyH + 1 * s); ctx.stroke();
  // team wordmark
  if (char.team) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `900 ${4.6 * s * big}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(char.team, 0, -bodyH * 0.72);
  }
  // big number
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${13 * s * big}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(char.number), 0, -bodyH * 0.42);
  ctx.strokeStyle = trim; ctx.lineWidth = 0.8 * s; ctx.strokeText(String(char.number), 0, -bodyH * 0.42);

  // Front arm — drawn over the jersey so the shooting/guide hand reads on top.
  drawFrontArm();

  // Head — sphere-shaded
  const hx = sk.head.x, hy = sk.head.y;
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

  drawHair(ctx, char, hx, hy, headR);

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
    ctx.fillStyle = '#20140c';
    ctx.beginPath();
    ctx.arc(hx - headR * 0.4 + facing * 0.6 * s, eyeY, 1.7 * s, 0, Math.PI * 2);
    ctx.arc(hx + headR * 0.4 + facing * 0.6 * s, eyeY, 1.7 * s, 0, Math.PI * 2); ctx.fill();
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

  ctx.restore(); // end of the leaned upper body
  ctx.restore();
}
