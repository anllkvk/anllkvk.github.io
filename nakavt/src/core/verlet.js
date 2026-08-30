/**
 * Verlet strands — the cloth/hair secondary motion (AE7).
 *
 * Doc §1.6 lists secondary motion as one of the principles NAKAVT has none of: in the
 * reference the jersey and hair keep moving after the body stops. A strand is a chain of
 * points anchored at the top; each point integrates its own momentum and the segments are
 * then pulled back to length. Nothing drives it but the anchor moving, which is exactly
 * what makes it read as a consequence of the body rather than another animation.
 *
 * Original implementation of Verlet integration with distance constraints (public domain);
 * pure, allocation-free after construction, no DOM.
 */

/** Strand tuning. Cosmetic only. */
export const VERLET = Object.freeze({
  gravity: 260,     // px/s^2 pulling the strand down
  damping: 0.86,    // velocity retained per step (cloth loses energy fast)
  iterations: 3,    // constraint passes; more = stiffer
  maxStep: 1 / 45,  // s, clamp so a stalled tab cannot explode the sim
});

/**
 * A strand of `n` points hanging `seg` px apart from an anchor.
 * Point 0 is the anchor and is always pinned.
 */
export function makeStrand(n, seg, x = 0, y = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push({ x, y: y + i * seg, px: x, py: y + i * seg });
  return { pts, seg, n };
}

/** Re-pin a strand at a new place with no motion — use when a character teleports. */
export function resetStrand(strand, x, y) {
  for (let i = 0; i < strand.n; i++) {
    const p = strand.pts[i];
    p.x = p.px = x;
    p.y = p.py = y + i * strand.seg;
  }
  return strand;
}

/**
 * Advance one step. `ax`/`ay` is the anchor position; the strand follows it and everything
 * below swings. `windX` is an extra sideways push (we drive it from body velocity, so the
 * cloth trails the direction of travel).
 */
export function updateStrand(strand, ax, ay, dt, windX = 0) {
  const h = Math.min(dt, VERLET.maxStep);
  if (h <= 0) return strand;
  const { pts, n, seg } = strand;

  // integrate
  for (let i = 1; i < n; i++) {
    const p = pts[i];
    // wind is an ACCELERATION, so it takes the same h*h form as gravity. Applying it as a
    // velocity impulse (windX * h) made a strong gust add pixels per step directly, which
    // outran the constraint solver and stretched the strand.
    const vx = (p.x - p.px) * VERLET.damping + windX * h * h;
    const vy = (p.y - p.py) * VERLET.damping + VERLET.gravity * h * h;
    p.px = p.x; p.py = p.y;
    p.x += vx;
    p.y += vy;
  }

  // pin the anchor, then pull the segments back to length
  const a = pts[0];
  a.px = a.x; a.py = a.y;
  a.x = ax; a.y = ay;
  for (let k = 0; k < VERLET.iterations; k++) {
    pts[0].x = ax; pts[0].y = ay;
    for (let i = 0; i < n - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const dx = q.x - p.x, dy = q.y - p.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const diff = (d - seg) / d;
      // the anchor never moves, so the child takes the whole correction
      const w = i === 0 ? 1 : 0.5;
      if (i !== 0) { p.x += dx * diff * 0.5; p.y += dy * diff * 0.5; }
      q.x -= dx * diff * w;
      q.y -= dy * diff * w;
    }
  }

  // Relaxation alone converges too slowly when the anchor is yanked a long way in one
  // frame — a sprinting character does exactly that — and a visibly stretching jersey is
  // worse than a slightly stiff one. This final downward pass places each point at exactly
  // `seg` from its parent, so the length is guaranteed rather than approached.
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i], q = pts[i + 1];
    let dx = q.x - p.x, dy = q.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = 0; dy = 1; } else { dx /= d; dy /= d; }
    q.x = p.x + dx * seg;
    q.y = p.y + dy * seg;
  }
  return strand;
}

/** Total length of a strand, for tests and sanity checks. */
export function strandLength(strand) {
  let total = 0;
  for (let i = 0; i < strand.n - 1; i++) {
    total += Math.hypot(strand.pts[i + 1].x - strand.pts[i].x, strand.pts[i + 1].y - strand.pts[i].y);
  }
  return total;
}
