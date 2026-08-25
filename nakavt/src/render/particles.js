/**
 * Particle system — pooled, allocation-free during play. One fixed array of
 * reusable particle objects; emitters wake inactive slots instead of allocating.
 * Types: dust, sparkle, burst, confetti. Purely cosmetic.
 */
import { PARTICLES } from '../config.js';

export class Particles {
  constructor(max = PARTICLES.max) {
    this.pool = new Array(max);
    for (let i = 0; i < max; i++) this.pool[i] = this._blank();
    this.next = 0;
  }

  _blank() {
    return { active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3,
      color: '#fff', grav: 0, rot: 0, vr: 0, shape: 'circle', drag: 0.9, alpha: 1 };
  }

  _spawn() {
    // find an inactive slot (round-robin; overwrite oldest if all busy)
    for (let i = 0; i < this.pool.length; i++) {
      const idx = (this.next + i) % this.pool.length;
      if (!this.pool[idx].active) { this.next = (idx + 1) % this.pool.length; return this.pool[idx]; }
    }
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    return p;
  }

  emit(o) {
    const p = this._spawn();
    p.active = true;
    p.x = o.x; p.y = o.y; p.vx = o.vx || 0; p.vy = o.vy || 0;
    p.life = 0; p.max = o.max || 0.6; p.size = o.size || 3;
    p.color = o.color || '#fff'; p.grav = o.grav || 0; p.rot = o.rot || 0;
    p.vr = o.vr || 0; p.shape = o.shape || 'circle'; p.drag = o.drag ?? 0.9; p.alpha = 1;
  }

  /** Radial burst of `n` particles. */
  burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const sp = (opts.speed || 120) * (0.5 + Math.random());
      this.emit({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 0),
        max: opts.max || 0.6, size: opts.size || 3, color: opts.color || '#fff',
        grav: opts.grav ?? 300, shape: opts.shape || 'circle', drag: opts.drag ?? 0.86,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  /** Small dust puff at the feet (landing / cut). */
  dust(x, y, n = 5, color = 'rgba(220,210,190,0.7)') {
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (Math.random() - 0.5) * Math.PI;
      const sp = 40 + Math.random() * 60;
      this.emit({ x: x + (Math.random() - 0.5) * 12, y, vx: Math.cos(a) * sp, vy: -Math.random() * 40,
        max: 0.4 + Math.random() * 0.2, size: 2 + Math.random() * 3, color, grav: 120, drag: 0.9 });
    }
  }

  confettiRain(W, H, n = PARTICLES.confetti, colors = ['#ffd23f', '#ff7a1a', '#2ec16b', '#4dd0ff', '#ff3b4e', '#9b7bff']) {
    for (let i = 0; i < n; i++) {
      this.emit({ x: Math.random() * W, y: -Math.random() * H * 0.5,
        vx: (Math.random() - 0.5) * 60, vy: 80 + Math.random() * 140,
        max: 2.5 + Math.random() * 1.5, size: 4 + Math.random() * 5,
        color: colors[(Math.random() * colors.length) | 0], grav: 40, drag: 1,
        shape: 'rect', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 8 });
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.max) { p.active = false; continue; }
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      p.alpha = 1 - p.life / p.max;
    }
  }

  draw(ctx) {
    for (const p of this.pool) {
      if (!p.active) continue;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.6); ctx.restore();
      } else if (p.shape === 'spark') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-p.size * 1.5, -p.size * 0.25, p.size * 3, p.size * 0.5);
        ctx.fillRect(-p.size * 0.25, -p.size * 1.5, p.size * 0.5, p.size * 3); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  clear() { for (const p of this.pool) p.active = false; }
  get activeCount() { return this.pool.reduce((n, p) => n + (p.active ? 1 : 0), 0); }
}
