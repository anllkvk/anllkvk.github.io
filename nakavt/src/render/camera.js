/**
 * Camera — a thin, controlled 2D camera for game feel. Purely visual: it never
 * touches gameplay state, only wraps the world render in a transform.
 *
 *   cam.update(dt)
 *   cam.begin(ctx);  ...draw world...  cam.end(ctx)
 *   cam.punch(amount)          // quick zoom-in kick (perfect shot)
 *   cam.shake(mag, dur)        // short screen shake (knockout / miss)
 *   cam.zoomTo(z, speed)       // ease base zoom (final duel / victory)
 *
 * Shakes are short and decay fast — no nauseating continuous shake.
 */
export class Camera {
  constructor(W, H) {
    this.W = W; this.H = H;
    this.cx = W / 2; this.cy = H * 0.55; // zoom focus
    this.baseZoom = 1; this.targetZoom = 1; this.zoomSpeed = 3;
    this.punchAmt = 0; // transient extra zoom
    this.shakeMag = 0; this.shakeT = 0; this.shakeDur = 0;
    this.ox = 0; this.oy = 0;
  }

  resize(W, H) { this.W = W; this.H = H; this.cx = W / 2; this.cy = H * 0.55; }
  reset() { this.baseZoom = 1; this.targetZoom = 1; this.punchAmt = 0; this.shakeMag = 0; this.shakeT = 0; }

  punch(amt) { this.punchAmt = Math.max(this.punchAmt, amt); }
  shake(mag, dur) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeDur = dur; this.shakeT = dur; }
  zoomTo(z, speed = 3) { this.targetZoom = z; this.zoomSpeed = speed; }
  focus(x, y) { this.cx = x; this.cy = y; }

  update(dt) {
    // ease base zoom
    this.baseZoom += (this.targetZoom - this.baseZoom) * Math.min(1, this.zoomSpeed * dt);
    // decay punch
    this.punchAmt *= Math.max(0, 1 - 9 * dt);
    if (this.punchAmt < 0.001) this.punchAmt = 0;
    // shake
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT / this.shakeDur);
      const m = this.shakeMag * k * k;
      this.ox = (Math.random() * 2 - 1) * m;
      this.oy = (Math.random() * 2 - 1) * m;
      if (this.shakeT <= 0) { this.shakeMag = 0; this.ox = 0; this.oy = 0; }
    } else { this.ox = 0; this.oy = 0; }
  }

  get zoom() { return this.baseZoom + this.punchAmt; }

  begin(ctx) {
    const z = this.zoom;
    ctx.save();
    ctx.translate(this.cx + this.ox, this.cy + this.oy);
    ctx.scale(z, z);
    ctx.translate(-this.cx, -this.cy);
  }

  end(ctx) { ctx.restore(); }
}
