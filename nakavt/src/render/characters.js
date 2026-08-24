/**
 * Pseudo-3D arcade characters — still pure canvas (no image assets), but shaded
 * for volume: radial-gradient sphere heads, shaded cylindrical torsos/limbs,
 * a soft contact shadow and a rim light. Reads clearer and rounder than flat
 * sprites while staying light enough for 60 FPS.
 *
 * drawCharacter(ctx, char, x, y, scale, pose, phase, opts)
 *   pose:  'idle' | 'run' | 'shoot' | 'aim' | 'celebrate' | 'knockout'
 *   phase: 0..1 progress (or free-running time for idle/run bob)
 *   opts:  { facing: -1|1, dim: bool }
 */

function shade(hex, mult) {
  const { r, g, b } = rgb(hex);
  return `rgb(${c255(r * mult)},${c255(g * mult)},${c255(b * mult)})`;
}
function rgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const c255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A shaded 3D-ish capsule (used for limbs and torso). */
function capsule(ctx, x, y, w, h, r, base) {
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, shade(base, 0.72));
  g.addColorStop(0.4, base);
  g.addColorStop(1, shade(base, 1.18));
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

function drawHair(ctx, char, hx, hy, hr) {
  const dark = shade(char.hairColor, 0.85);
  const g = ctx.createRadialGradient(hx - hr * 0.3, hy - hr * 0.9, hr * 0.2, hx, hy - hr * 0.4, hr * 1.6);
  g.addColorStop(0, shade(char.hairColor, 1.25));
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  switch (char.hair) {
    case 'bald': break;
    case 'buzz':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.15, hr * 0.98, Math.PI * 1.02, Math.PI * 1.98); ctx.fill(); break;
    case 'short':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.2, hr * 1.03, Math.PI, 0); ctx.fill();
      ctx.fillRect(hx - hr * 1.02, hy - hr * 0.2, hr * 2.04, hr * 0.28); break;
    case 'fade':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.25, hr * 1.0, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); break;
    case 'flattop':
      roundRect(ctx, hx - hr * 0.98, hy - hr * 1.4, hr * 1.96, hr * 0.8, hr * 0.15); ctx.fill(); break;
    case 'curly':
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(hx + i * hr * 0.32, hy - hr * 0.85, hr * 0.44, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'afro':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.55, hr * 1.5, 0, Math.PI * 2); ctx.fill(); break;
    case 'mohawk':
      ctx.beginPath(); ctx.moveTo(hx - hr * 0.28, hy - hr * 0.7); ctx.lineTo(hx, hy - hr * 1.9); ctx.lineTo(hx + hr * 0.28, hy - hr * 0.7); ctx.closePath(); ctx.fill(); break;
    default: break;
  }
}

export function drawCharacter(ctx, char, x, y, scale, pose = 'idle', phase = 0, opts = {}) {
  const s = scale;
  const big = char.big ? 1.16 : 1;
  const facing = opts.facing || 1;
  ctx.save();
  ctx.translate(x, y);

  let bob = 0, lean = 0, armUp = 0, fall = 0, spin = 0, crouch = 0;
  if (pose === 'idle') bob = Math.sin(phase * 3) * 1.2 * s;
  if (pose === 'run') { bob = Math.abs(Math.sin(phase * 14)) * 3.2 * s; lean = 4 * s * facing; }
  if (pose === 'shoot') { armUp = Math.min(1, phase * 1.7); bob = -armUp * 5 * s; crouch = (1 - armUp) * 2 * s; }
  if (pose === 'aim') { armUp = 0.55 + Math.sin(phase * 6) * 0.05; crouch = 3 * s; }
  if (pose === 'celebrate') { armUp = 1; bob = -Math.abs(Math.sin(phase * 8)) * 7 * s; }
  if (pose === 'knockout') { fall = Math.min(1, phase); spin = phase * 1.1; }

  if (pose === 'knockout') { ctx.translate(0, fall * 20 * s); ctx.rotate(spin * 0.9); ctx.globalAlpha = Math.max(0, 1 - fall * 0.6); }
  ctx.translate(lean, bob + crouch);
  if (opts.dim) ctx.globalAlpha *= 0.85;

  const bodyW = 24 * s * big, bodyH = 30 * s * big, headR = 16 * s * big;

  // Soft elliptical contact shadow (grounds the character in 3D)
  ctx.save();
  ctx.globalAlpha *= 0.28;
  const sg = ctx.createRadialGradient(0, 8 * s, 0, 0, 8 * s, bodyW);
  sg.addColorStop(0, 'rgba(0,0,0,0.55)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.ellipse(0, 8 * s - bob - crouch, bodyW * 0.85, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Legs (shaded)
  const legSpread = pose === 'run' ? Math.sin(phase * 14) * 5 * s : 3 * s;
  capsule(ctx, -8 * s - legSpread, -6 * s, 7 * s, 15 * s, 3.2 * s, char.shorts);
  capsule(ctx, 1 * s + legSpread, -6 * s, 7 * s, 15 * s, 3.2 * s, char.shorts);
  // Shoes
  ctx.fillStyle = '#efefef';
  roundRect(ctx, -9.5 * s - legSpread, 6 * s, 9.5 * s, 5 * s, 2.4 * s); ctx.fill();
  roundRect(ctx, 0 * s + legSpread, 6 * s, 9.5 * s, 5 * s, 2.4 * s); ctx.fill();
  ctx.fillStyle = shade(char.jersey, 0.9);
  ctx.fillRect(-9.5 * s - legSpread, 9.5 * s, 9.5 * s, 1.6 * s);
  ctx.fillRect(0 * s + legSpread, 9.5 * s, 9.5 * s, 1.6 * s);

  // Torso — shaded cylinder
  const tg = ctx.createLinearGradient(-bodyW / 2, 0, bodyW / 2, 0);
  tg.addColorStop(0, shade(char.jersey, 0.68));
  tg.addColorStop(0.45, char.jersey);
  tg.addColorStop(1, shade(char.jersey, 1.22));
  ctx.fillStyle = tg;
  roundRect(ctx, -bodyW / 2, -bodyH, bodyW, bodyH * 0.82, 7 * s); ctx.fill();
  // Number
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `bold ${11 * s * big}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(char.number), 0, -bodyH * 0.52);

  // Arms (shaded capsules); right arm raises to shoot/aim
  const shoulderY = -bodyH * 0.82;
  const armW = 5.4 * s * big;
  // left arm
  ctx.save();
  const la = (pose === 'celebrate' || armUp > 0.4) ? armUp : 0;
  if (la > 0.4) capsule(ctx, -bodyW * 0.58, shoulderY - 22 * s * la, armW, 22 * s * la + armW, armW / 2, char.skin);
  else capsule(ctx, -bodyW * 0.58, shoulderY, armW, 16 * s, armW / 2, char.skin);
  ctx.restore();
  // right arm
  if (armUp > 0) {
    capsule(ctx, bodyW * 0.34, shoulderY - 24 * s * armUp, armW, 24 * s * armUp + armW, armW / 2, char.skin);
  } else {
    capsule(ctx, bodyW * 0.52, shoulderY, armW, 16 * s, armW / 2, char.skin);
  }

  // Head — sphere-shaded
  const hx = 0, hy = -bodyH - headR * 0.35;
  const hg = ctx.createRadialGradient(hx - headR * 0.35, hy - headR * 0.4, headR * 0.15, hx, hy, headR * 1.15);
  hg.addColorStop(0, shade(char.skin, 1.2));
  hg.addColorStop(0.7, char.skin);
  hg.addColorStop(1, shade(char.skin, 0.75));
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(hx, hy, headR, 0, Math.PI * 2); ctx.fill();
  // Ears
  ctx.fillStyle = shade(char.skin, 0.9);
  ctx.beginPath(); ctx.arc(hx - headR, hy, headR * 0.28, 0, Math.PI * 2); ctx.arc(hx + headR, hy, headR * 0.28, 0, Math.PI * 2); ctx.fill();

  drawHair(ctx, char, hx, hy, headR);

  if (char.headband) {
    ctx.fillStyle = char.headbandColor || '#fff';
    roundRect(ctx, hx - headR, hy - headR * 0.38, headR * 2, headR * 0.42, headR * 0.2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(ctx, hx - headR, hy - headR * 0.38, headR * 2, headR * 0.14, headR * 0.2); ctx.fill();
  }

  // Face
  const eyeY = hy + (pose === 'knockout' ? headR * 0.05 : -headR * 0.05);
  const eyeDX = headR * 0.4 * facing;
  if (pose === 'knockout') {
    ctx.strokeStyle = '#20140c'; ctx.lineWidth = 2 * s;
    for (const ex of [-headR * 0.42, headR * 0.42]) {
      ctx.beginPath();
      ctx.moveTo(hx + ex - 3 * s, eyeY - 3 * s); ctx.lineTo(hx + ex + 3 * s, eyeY + 3 * s);
      ctx.moveTo(hx + ex + 3 * s, eyeY - 3 * s); ctx.lineTo(hx + ex - 3 * s, eyeY + 3 * s);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(hx - headR * 0.4, eyeY, 3.4 * s, 3.8 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(hx + headR * 0.4, eyeY, 3.4 * s, 3.8 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#20140c';
    ctx.beginPath(); ctx.arc(hx - headR * 0.4 + eyeDX * 0.15, eyeY, 1.9 * s, 0, Math.PI * 2);
    ctx.arc(hx + headR * 0.4 + eyeDX * 0.15, eyeY, 1.9 * s, 0, Math.PI * 2); ctx.fill();
  }
  if (char.glasses) {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.7 * s;
    ctx.beginPath();
    ctx.arc(hx - headR * 0.4, eyeY, 4.8 * s, 0, Math.PI * 2);
    ctx.arc(hx + headR * 0.4, eyeY, 4.8 * s, 0, Math.PI * 2);
    ctx.moveTo(hx - headR * 0.05, eyeY); ctx.lineTo(hx + headR * 0.05, eyeY);
    ctx.stroke();
  }
  // Mouth
  ctx.strokeStyle = '#20140c'; ctx.lineWidth = 1.9 * s; ctx.lineCap = 'round';
  ctx.beginPath();
  const my = hy + headR * 0.45;
  if (pose === 'celebrate') ctx.arc(hx, my - 2 * s, headR * 0.36, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (pose === 'knockout') ctx.arc(hx, my + 3 * s, headR * 0.3, 1.15 * Math.PI, 1.85 * Math.PI);
  else if (pose === 'aim' || pose === 'shoot') { ctx.moveTo(hx - headR * 0.2, my); ctx.lineTo(hx + headR * 0.2, my); }
  else ctx.arc(hx, my - 1 * s, headR * 0.24, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  // Rim light on head for extra 3D pop
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5 * s;
  ctx.beginPath(); ctx.arc(hx, hy, headR - 0.8 * s, Math.PI * 1.15, Math.PI * 1.55); ctx.stroke();

  ctx.restore();
}
