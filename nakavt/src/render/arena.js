/**
 * Arena backdrop, court, hoop and ball — all procedural canvas art themed by
 * the arena palette. Original arcade designs (no real team logos/venues).
 * Coordinates are in a virtual portrait space; the scene passes a layout.
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

/** Deterministic crowd dots so they don't flicker frame to frame. */
function seeded(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function drawArena(ctx, W, H, arena, t, opts = {}) {
  const standsH = H * 0.42;

  // Back wall gradient
  const g = ctx.createLinearGradient(0, 0, 0, standsH);
  g.addColorStop(0, arena.wall);
  g.addColorStop(1, shade(arena.wall, 1.35));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, standsH);

  // Glow bars (arena lights)
  ctx.save();
  ctx.globalAlpha = 0.5 + Math.sin(t * 2) * 0.08;
  for (let i = 0; i < 5; i++) {
    const gx = (W / 5) * i + W / 10;
    const lg = ctx.createRadialGradient(gx, 10, 0, gx, 10, W * 0.16);
    lg.addColorStop(0, arena.wallGlow);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(gx - W * 0.16, 0, W * 0.32, standsH * 0.7);
  }
  ctx.restore();

  // Crowd
  const rows = 7, cols = Math.ceil(W / 16);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const sx = c * 16 + (r % 2) * 8 + 4;
      const sy = standsH * 0.28 + r * (standsH * 0.5 / rows);
      const cheer = opts.crowdCheer ? Math.sin(t * 8 + idx) * 2 : 0;
      ctx.fillStyle = seeded(idx) > 0.5 ? arena.crowdA : arena.crowdB;
      ctx.globalAlpha = 0.55 + seeded(idx + 99) * 0.4;
      ctx.beginPath();
      ctx.arc(sx, sy - cheer, 4 + seeded(idx + 3) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Scoreboard frame (hangs from the rafters; y can be pushed down to clear the HUD)
  const sb = scoreboardRect(W, H, opts.scoreboardY);
  ctx.fillStyle = '#0a0a0f';
  roundRect(ctx, sb.x, sb.y, sb.w, sb.h, 8); ctx.fill();
  ctx.strokeStyle = arena.accent; ctx.lineWidth = 2; ctx.stroke();
  // Text is dynamic (player count changes) — skip it when baking a static backdrop.
  if (!opts.frameOnly && opts.scoreboard) drawScoreboardText(ctx, W, H, arena, opts);
}

function scoreboardRect(W, H, scoreboardY) {
  const w = W * 0.5, h = H * 0.08;
  return { x: (W - w) / 2, y: scoreboardY ?? H * 0.03, w, h };
}

/** Dynamic scoreboard text, drawn every frame over the (possibly cached) frame. */
export function drawScoreboardText(ctx, W, H, arena, opts) {
  if (!opts.scoreboard) return;
  const sb = scoreboardRect(W, H, opts.scoreboardY);
  ctx.fillStyle = arena.accent;
  ctx.font = `bold ${sb.h * 0.34}px "Courier New", monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(opts.scoreboard.top, sb.x + sb.w / 2, sb.y + sb.h * 0.32);
  ctx.fillStyle = '#ff5a3d';
  ctx.font = `bold ${sb.h * 0.4}px "Courier New", monospace`;
  ctx.fillText(opts.scoreboard.bottom, sb.x + sb.w / 2, sb.y + sb.h * 0.7);
}

/**
 * Cached arena+court backdrop. The static layers (wall, crowd, court, hoop,
 * scoreboard frame) are baked to an offscreen canvas once per size/arena, then
 * blitted each frame — only the dynamic scoreboard text is redrawn. This removes
 * the heavy per-frame crowd/court work (a big 60 FPS win on mobile).
 */
let _backdrop = null;
export function drawArenaScene(ctx, layout, arena, opts = {}) {
  const { W, H } = layout;
  const key = `${arena.id}|${Math.round(W)}x${Math.round(H)}|${Math.round(layout.floorY)}|${Math.round(opts.scoreboardY || 0)}`;
  if (!_backdrop || _backdrop.key !== key) {
    const oc = document.createElement('canvas');
    oc.width = Math.max(1, Math.round(W)); oc.height = Math.max(1, Math.round(H));
    const octx = oc.getContext('2d');
    drawArena(octx, W, H, arena, 0, { scoreboardY: opts.scoreboardY, frameOnly: true });
    drawCourt(octx, layout, arena, 0);
    _backdrop = { key, canvas: oc };
  }
  ctx.drawImage(_backdrop.canvas, 0, 0, W, H);
  drawScoreboardText(ctx, W, H, arena, opts);
}

/** Drop the cached backdrop (call on resize/arena change to force a rebuild). */
export function invalidateArenaCache() { _backdrop = null; _vig = null; }

/**
 * Soft vignette that darkens the edges for depth/focus. Cached to an offscreen
 * canvas per (size, strength) so it's a single blit per frame, not a gradient.
 */
let _vig = null;
export function drawVignette(ctx, W, H, strength = 0.28) {
  const key = `${Math.round(W)}x${Math.round(H)}|${strength.toFixed(2)}`;
  if (!_vig || _vig.key !== key) {
    const oc = document.createElement('canvas');
    oc.width = Math.max(1, Math.round(W)); oc.height = Math.max(1, Math.round(H));
    const o = oc.getContext('2d');
    const g = o.createRadialGradient(W / 2, H * 0.52, Math.min(W, H) * 0.32, W / 2, H * 0.52, Math.max(W, H) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    o.fillStyle = g; o.fillRect(0, 0, W, H);
    _vig = { key, canvas: oc };
  }
  ctx.drawImage(_vig.canvas, 0, 0, W, H);
}

export function drawCourt(ctx, layout, arena, t) {
  const { floorY, W, H, lineX, hoopX, hoopY } = layout;
  const ftY = layout.ftY ?? (floorY + (H - floorY) * 0.72);

  // Floor
  const fg = ctx.createLinearGradient(0, floorY, 0, H);
  fg.addColorStop(0, shade(arena.court, 1.12));
  fg.addColorStop(0.5, shade(arena.court, 0.98));
  fg.addColorStop(1, shade(arena.court, 0.78));
  ctx.fillStyle = fg;
  ctx.fillRect(0, floorY, W, H - floorY);

  // Center-court spotlight for depth
  const cy = floorY + (H - floorY) * 0.55;
  const spot = ctx.createRadialGradient(lineX, cy, 12, lineX, cy, W * 0.62);
  spot.addColorStop(0, 'rgba(255,255,255,0.10)');
  spot.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spot; ctx.fillRect(0, floorY, W, H - floorY);

  // Parquet planks (Celtic) or subtle boards (Bay)
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = arena.parquet ? '#4a2f14' : '#8a6a3a';
  ctx.lineWidth = 1;
  for (let y = floorY; y < H; y += 14) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }
  if (arena.parquet) {
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x, H); ctx.stroke(); }
  }
  ctx.restore();

  // Court boundary (perspective trapezoid: near-wide → far-narrow) for depth
  ctx.save();
  ctx.strokeStyle = hexA(arena.courtLine, 0.45); ctx.lineWidth = 3;
  const nearHalf = W * 0.46, farHalf = 70, baseY = hoopY + 34, nearY = H - 6;
  ctx.beginPath();
  ctx.moveTo(lineX - nearHalf, nearY);
  ctx.lineTo(lineX - farHalf, baseY);
  ctx.lineTo(lineX + farHalf, baseY);
  ctx.lineTo(lineX + nearHalf, nearY);
  ctx.stroke();
  ctx.restore();

  // The key / paint area (perspective trapezoid) with depth shading
  const kg = ctx.createLinearGradient(0, hoopY + 30, 0, ftY);
  kg.addColorStop(0, hexA(arena.keyPaint, 0.68));
  kg.addColorStop(1, hexA(arena.keyPaint, 0.42));
  ctx.fillStyle = kg;
  ctx.beginPath();
  ctx.moveTo(hoopX - 26, hoopY + 30);
  ctx.lineTo(hoopX + 26, hoopY + 30);
  ctx.lineTo(lineX + 74, ftY);
  ctx.lineTo(lineX - 74, ftY);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = hexA(arena.courtLine, 0.8); ctx.lineWidth = 2; ctx.stroke();

  // Free-throw line + perspective (flattened) circle, aligned to the player's line
  ctx.strokeStyle = arena.courtLine; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(lineX - 74, ftY); ctx.lineTo(lineX + 74, ftY); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(lineX, ftY, 74, 30, 0, Math.PI, 0); ctx.stroke();
  ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.ellipse(lineX, ftY, 74, 30, 0, 0, Math.PI); ctx.stroke();
  ctx.setLineDash([]);

  drawHoop(ctx, layout, arena, t);
}

export function drawHoop(ctx, layout, arena, t) {
  const { hoopX, hoopY } = layout;
  // Pole base shadow on the floor
  ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(hoopX, hoopY + 30, 18, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  // Pole — rounded-metal gradient for volume
  const pg = ctx.createLinearGradient(hoopX - 5, 0, hoopX + 5, 0);
  pg.addColorStop(0, '#16161c'); pg.addColorStop(0.5, '#50505c'); pg.addColorStop(1, '#16161c');
  ctx.fillStyle = pg; ctx.fillRect(hoopX - 5, hoopY - 74, 10, 80);
  // Backboard drop shadow
  ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
  roundRect(ctx, hoopX - 35, hoopY - 62, 72, 48, 5); ctx.fill(); ctx.restore();
  // Backboard glass (gradient + edge)
  const bgd = ctx.createLinearGradient(hoopX - 36, hoopY - 68, hoopX + 36, hoopY - 20);
  bgd.addColorStop(0, 'rgba(228,238,252,0.96)'); bgd.addColorStop(1, 'rgba(188,203,224,0.9)');
  ctx.fillStyle = bgd; roundRect(ctx, hoopX - 36, hoopY - 68, 72, 48, 5); ctx.fill();
  ctx.strokeStyle = '#c9351f'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeRect(hoopX - 13, hoopY - 49, 26, 19); // target square
  // glass highlight streak
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(hoopX - 30, hoopY - 63); ctx.lineTo(hoopX - 8, hoopY - 63); ctx.stroke();
  // rim connector to backboard
  ctx.strokeStyle = '#c9351f'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(hoopX, hoopY - 20); ctx.lineTo(hoopX, hoopY - 5); ctx.stroke();
  // Rim as a 3D ring: dim back half, net inside, bright front half
  ctx.strokeStyle = '#a8431b'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(hoopX, hoopY, 22, 7, 0, Math.PI, 0); ctx.stroke(); // back
  // Net (tapering, deeper)
  ctx.strokeStyle = 'rgba(255,255,255,0.78)'; ctx.lineWidth = 1;
  for (let i = -4; i <= 4; i++) {
    const nx = hoopX + i * 5;
    ctx.beginPath(); ctx.moveTo(nx, hoopY + 2); ctx.lineTo(hoopX + i * 2.4, hoopY + 26); ctx.stroke();
  }
  for (let r = 1; r <= 4; r++) {
    const yy = hoopY + r * 6, wr = 20 - r * 3.6;
    ctx.beginPath(); ctx.ellipse(hoopX, yy, wr, wr * 0.28, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.strokeStyle = '#ff6a2b'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.ellipse(hoopX, hoopY, 22, 7, 0, 0, Math.PI); ctx.stroke(); // front
}

export function drawBall(ctx, x, y, r, rot = 0, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  // shadow on floor
  if (opts.shadowY != null) {
    ctx.save();
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, opts.shadowY - y, r * 0.9, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.rotate(rot);
  const bg = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  bg.addColorStop(0, '#ff9c4a');
  bg.addColorStop(1, '#d5591f');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  // seams
  ctx.strokeStyle = '#3a1a08'; ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, 0, r * 0.55, r, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

// --- colour helpers ---
function shade(hex, mult) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${clamp255(r * mult)},${clamp255(g * mult)},${clamp255(b * mult)})`;
}
function hexA(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
