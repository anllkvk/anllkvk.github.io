/**
 * Procedural arcade characters — drawn entirely with canvas shapes (no image
 * assets). Big head / simple body, exaggerated poses. Each character's visual
 * fields (from config) drive skin, hair, headband, jersey, number.
 *
 * drawCharacter(ctx, char, x, y, scale, pose, phase, opts)
 *   pose:  'idle' | 'shoot' | 'celebrate' | 'knockout' | 'run'
 *   phase: 0..1 animation progress (or a free-running time for idle bob)
 */

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHair(ctx, char, hx, hy, hr) {
  ctx.fillStyle = char.hairColor;
  switch (char.hair) {
    case 'bald': break;
    case 'buzz':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.15, hr * 0.98, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
      break;
    case 'short':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.2, hr * 1.02, Math.PI, 0); ctx.fill();
      ctx.fillRect(hx - hr, hy - hr * 0.2, hr * 2, hr * 0.25);
      break;
    case 'fade':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.25, hr * 1.0, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      break;
    case 'flattop':
      roundRect(ctx, hx - hr * 0.95, hy - hr * 1.35, hr * 1.9, hr * 0.75, hr * 0.15); ctx.fill();
      break;
    case 'curly':
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath(); ctx.arc(hx + i * hr * 0.32, hy - hr * 0.85, hr * 0.42, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case 'afro':
      ctx.beginPath(); ctx.arc(hx, hy - hr * 0.55, hr * 1.45, 0, Math.PI * 2); ctx.fill();
      break;
    case 'mohawk':
      ctx.beginPath();
      ctx.moveTo(hx - hr * 0.25, hy - hr * 0.7);
      ctx.lineTo(hx, hy - hr * 1.8);
      ctx.lineTo(hx + hr * 0.25, hy - hr * 0.7);
      ctx.closePath(); ctx.fill();
      break;
    default: break;
  }
}

export function drawCharacter(ctx, char, x, y, scale, pose = 'idle', phase = 0, opts = {}) {
  const s = scale;
  const big = char.big ? 1.15 : 1;
  ctx.save();
  ctx.translate(x, y);

  // Pose transforms
  let bob = 0, lean = 0, armUp = 0, fall = 0, spin = 0;
  if (pose === 'idle') bob = Math.sin(phase * 3) * 1.2 * s;
  if (pose === 'run') { bob = Math.abs(Math.sin(phase * 12)) * 3 * s; lean = 4 * s; }
  if (pose === 'shoot') { armUp = Math.min(1, phase * 1.6); bob = -armUp * 4 * s; }
  if (pose === 'celebrate') { armUp = 1; bob = -Math.abs(Math.sin(phase * 8)) * 6 * s; }
  if (pose === 'knockout') { fall = Math.min(1, phase); spin = phase * 1.2; }

  if (pose === 'knockout') {
    ctx.translate(0, fall * 18 * s);
    ctx.rotate(spin * 0.9);
    ctx.globalAlpha = Math.max(0, 1 - fall * 0.6);
  }
  ctx.translate(lean, bob);

  const bodyW = 24 * s * big;
  const bodyH = 30 * s * big;
  const headR = 16 * s * big;

  // Shadow
  ctx.save();
  ctx.globalAlpha *= 0.25;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 6 * s, bodyW * 0.7, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Legs
  ctx.fillStyle = char.shorts;
  const legSpread = pose === 'run' ? Math.sin(phase * 12) * 5 * s : 3 * s;
  roundRect(ctx, -8 * s - legSpread, -6 * s, 7 * s, 14 * s, 3 * s); ctx.fill();
  roundRect(ctx, 1 * s + legSpread, -6 * s, 7 * s, 14 * s, 3 * s); ctx.fill();
  // Shoes
  ctx.fillStyle = '#f4f4f4';
  roundRect(ctx, -9 * s - legSpread, 5 * s, 9 * s, 5 * s, 2 * s); ctx.fill();
  roundRect(ctx, 0 * s + legSpread, 5 * s, 9 * s, 5 * s, 2 * s); ctx.fill();

  // Torso (jersey)
  ctx.fillStyle = char.jersey;
  roundRect(ctx, -bodyW / 2, -bodyH, bodyW, bodyH * 0.8, 6 * s); ctx.fill();
  // Jersey number
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = `bold ${10 * s * big}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(char.number), 0, -bodyH * 0.55);

  // Arms
  ctx.strokeStyle = char.skin;
  ctx.lineWidth = 5 * s * big;
  ctx.lineCap = 'round';
  const shoulderY = -bodyH * 0.85;
  // Right arm (shooting)
  ctx.beginPath();
  ctx.moveTo(bodyW * 0.42, shoulderY);
  if (armUp > 0) {
    ctx.lineTo(bodyW * 0.55, shoulderY - 14 * s * armUp);
    ctx.lineTo(bodyW * 0.35, shoulderY - 26 * s * armUp);
  } else {
    ctx.lineTo(bodyW * 0.62, shoulderY + 12 * s);
  }
  ctx.stroke();
  // Left arm
  ctx.beginPath();
  ctx.moveTo(-bodyW * 0.42, shoulderY);
  if (pose === 'celebrate' || (armUp > 0 && pose === 'shoot')) {
    ctx.lineTo(-bodyW * 0.5, shoulderY - 12 * s * (pose === 'celebrate' ? 1 : armUp));
    ctx.lineTo(-bodyW * 0.32, shoulderY - 24 * s * (pose === 'celebrate' ? 1 : armUp));
  } else {
    ctx.lineTo(-bodyW * 0.62, shoulderY + 12 * s);
  }
  ctx.stroke();

  // Head
  const hx = 0, hy = -bodyH - headR * 0.35;
  ctx.fillStyle = char.skin;
  ctx.beginPath(); ctx.arc(hx, hy, headR, 0, Math.PI * 2); ctx.fill();
  // Ears
  ctx.beginPath(); ctx.arc(hx - headR, hy, headR * 0.28, 0, Math.PI * 2);
  ctx.arc(hx + headR, hy, headR * 0.28, 0, Math.PI * 2); ctx.fill();

  drawHair(ctx, char, hx, hy, headR);

  // Headband
  if (char.headband) {
    ctx.fillStyle = char.headbandColor || '#fff';
    roundRect(ctx, hx - headR, hy - headR * 0.35, headR * 2, headR * 0.4, headR * 0.2); ctx.fill();
  }

  // Face
  ctx.fillStyle = '#20140c';
  const eyeY = hy + (pose === 'knockout' ? headR * 0.05 : -headR * 0.05);
  if (pose === 'knockout') {
    // X_X eyes
    ctx.strokeStyle = '#20140c'; ctx.lineWidth = 2 * s;
    for (const ex of [-headR * 0.42, headR * 0.42]) {
      ctx.beginPath();
      ctx.moveTo(hx + ex - 3 * s, eyeY - 3 * s); ctx.lineTo(hx + ex + 3 * s, eyeY + 3 * s);
      ctx.moveTo(hx + ex + 3 * s, eyeY - 3 * s); ctx.lineTo(hx + ex - 3 * s, eyeY + 3 * s);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(hx - headR * 0.4, eyeY, 2.2 * s, 0, Math.PI * 2);
    ctx.arc(hx + headR * 0.4, eyeY, 2.2 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  if (char.glasses) {
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.6 * s;
    ctx.beginPath();
    ctx.arc(hx - headR * 0.4, eyeY, 4.5 * s, 0, Math.PI * 2);
    ctx.arc(hx + headR * 0.4, eyeY, 4.5 * s, 0, Math.PI * 2);
    ctx.moveTo(hx - headR * 0.05, eyeY); ctx.lineTo(hx + headR * 0.05, eyeY);
    ctx.stroke();
  }
  // Mouth
  ctx.strokeStyle = '#20140c'; ctx.lineWidth = 1.8 * s;
  ctx.beginPath();
  const my = hy + headR * 0.45;
  if (pose === 'celebrate') ctx.arc(hx, my - 2 * s, headR * 0.35, 0.15 * Math.PI, 0.85 * Math.PI);
  else if (pose === 'knockout') ctx.arc(hx, my + 3 * s, headR * 0.28, 1.15 * Math.PI, 1.85 * Math.PI);
  else ctx.arc(hx, my - 1 * s, headR * 0.22, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  ctx.restore();
}
