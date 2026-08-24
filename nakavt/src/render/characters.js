/**
 * Arcade basketball players — pure canvas (no image assets), NBA-*style* but
 * fully original: fictional teams, original names, jerseys with a wordmark,
 * side stripes and a big number. Athletic pseudo-3D proportions with shaded
 * volumes, beards, arm sleeves and a range of hairstyles. Light enough for 60 FPS.
 *
 * drawCharacter(ctx, char, x, y, scale, pose, phase, opts)
 *   pose:  'idle' | 'run' | 'shoot' | 'aim' | 'celebrate' | 'knockout'
 *   opts:  { facing: -1|1, dim: bool }
 */

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
  const big = char.height === 'big' ? 1.2 : char.height === 'tall' ? 1.08 : 1;
  const facing = opts.facing || 1;
  const trim = char.jerseyTrim || '#ffffff';
  ctx.save();
  ctx.translate(x, y);

  let bob = 0, lean = 0, armUp = 0, fall = 0, spin = 0, crouch = 0;
  if (pose === 'idle') bob = Math.sin(phase * 3) * 1.1 * s;
  if (pose === 'run') { bob = Math.abs(Math.sin(phase * 14)) * 3 * s; lean = 4 * s * facing; }
  if (pose === 'shoot') { armUp = Math.min(1, phase * 1.7); bob = -armUp * 5 * s; crouch = (1 - armUp) * 2 * s; }
  if (pose === 'aim') { armUp = 0.5 + Math.sin(phase * 6) * 0.04; crouch = 3 * s; }
  if (pose === 'celebrate') { armUp = 1; bob = -Math.abs(Math.sin(phase * 8)) * 7 * s; }
  if (pose === 'knockout') { fall = Math.min(1, phase); spin = phase * 1.1; }

  if (pose === 'knockout') { ctx.translate(0, fall * 20 * s); ctx.rotate(spin * 0.9); ctx.globalAlpha = Math.max(0, 1 - fall * 0.6); }
  ctx.translate(lean, bob + crouch);
  if (opts.dim) ctx.globalAlpha *= 0.85;

  const bodyW = 25 * s * big, bodyH = 34 * s * big, headR = 13.5 * s * big;

  // Contact shadow
  ctx.save();
  ctx.globalAlpha *= 0.28;
  const sg = ctx.createRadialGradient(0, 9 * s, 0, 0, 9 * s, bodyW);
  sg.addColorStop(0, 'rgba(0,0,0,0.55)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(0, 9 * s - bob - crouch, bodyW * 0.82, 6 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  // Legs (skin thighs + shorts)
  const legSpread = pose === 'run' ? Math.sin(phase * 14) * 5 * s : 3.4 * s;
  // thighs
  capsule(ctx, -8 * s - legSpread, -4 * s, 7 * s, 16 * s, 3.4 * s, char.skin);
  capsule(ctx, 1 * s + legSpread, -4 * s, 7 * s, 16 * s, 3.4 * s, char.skin);
  // socks + shoes
  ctx.fillStyle = '#f2f2f2';
  rr(ctx, -9.5 * s - legSpread, 9 * s, 9.5 * s, 5.5 * s, 2.4 * s); ctx.fill();
  rr(ctx, 0 * s + legSpread, 9 * s, 9.5 * s, 5.5 * s, 2.4 * s); ctx.fill();
  ctx.fillStyle = trim;
  ctx.fillRect(-9.5 * s - legSpread, 12.5 * s, 9.5 * s, 1.8 * s);
  ctx.fillRect(0 * s + legSpread, 12.5 * s, 9.5 * s, 1.8 * s);

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

  // Arms (shaded); right arm may raise. Optional shooting sleeve.
  const shoulderY = -bodyH * 0.82, armW = 5.6 * s * big;
  const armColor = char.skin;
  // left arm
  if (pose === 'celebrate' || armUp > 0.45) capsule(ctx, -bodyW * 0.6, shoulderY - 22 * s * armUp, armW, 22 * s * armUp + armW, armW / 2, armColor);
  else capsule(ctx, -bodyW * 0.6, shoulderY, armW, 17 * s, armW / 2, armColor);
  // right arm (+ sleeve)
  const rax = bodyW * (armUp > 0 ? 0.34 : 0.54), ray = armUp > 0 ? shoulderY - 24 * s * armUp : shoulderY;
  const rah = armUp > 0 ? 24 * s * armUp + armW : 17 * s;
  if (char.sleeve) capsule(ctx, rax, ray, armW, rah, armW / 2, char.sleeveColor || '#222');
  else capsule(ctx, rax, ray, armW, rah, armW / 2, armColor);
  if (char.wristband) { ctx.fillStyle = trim; ctx.fillRect(rax - 0.5 * s, ray + rah - armW - 2 * s, armW + 1 * s, 3 * s); }

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

  // Head — sphere-shaded
  const hx = 0, hy = -bodyH - headR * 0.4;
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

  ctx.restore();
}
