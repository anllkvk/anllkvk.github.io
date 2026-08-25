/**
 * Sprite cache — bakes a character pose to an offscreen canvas once, then blits
 * it with drawImage. Used for the many static/idle players (e.g. the waiting
 * queue) so we don't re-run dozens of gradient/stroke ops per character every
 * frame. Active, animated players keep drawing live so no animation is lost.
 *
 * Bounded LRU so memory stays flat. Visual quality is identical (same renderer,
 * baked at device pixel ratio for crispness).
 */
import { drawCharacter } from './characters.js';

export class SpriteCache {
  constructor(limit = 64) {
    this.map = new Map(); // key -> { canvas, hw, top, css: {w,h} }
    this.limit = limit;
    this.dpr = 1;
  }

  setDpr(dpr) { if (dpr !== this.dpr) { this.dpr = dpr; this.clear(); } }
  clear() { this.map.clear(); }

  _key(char, pose, s) { return `${char.id}|${pose}|${Math.round(s * 20)}|${this.dpr}`; }

  _bake(char, pose, s) {
    const big = char.height === 'big' ? 1.2 : char.height === 'tall' ? 1.08 : 1;
    const hw = Math.ceil(62 * s * big);
    const top = Math.ceil(108 * s * big);
    const bottom = Math.ceil(26 * s * big);
    const cssW = hw * 2, cssH = top + bottom;
    const dpr = this.dpr;
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(cssW * dpr));
    cv.height = Math.max(1, Math.round(cssH * dpr));
    const octx = cv.getContext('2d');
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // anchor: feet at (hw, top). drawCharacter uses (x,y) as the standing point.
    drawCharacter(octx, char, hw, top, s, pose, 0, { facing: 1 });
    const entry = { canvas: cv, hw, top, cssW, cssH };
    this._store(this._key(char, pose, s), entry);
    return entry;
  }

  _store(key, entry) {
    this.map.set(key, entry);
    if (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  get(char, pose, s) {
    const key = this._key(char, pose, s);
    let e = this.map.get(key);
    if (!e) e = this._bake(char, pose, s);
    else { this.map.delete(key); this.map.set(key, e); } // LRU touch
    return e;
  }

  /** Blit a cached pose so its "feet" land at (x, y). */
  draw(ctx, char, x, y, s, pose = 'idle', opts = {}) {
    const e = this.get(char, pose, s);
    ctx.save();
    if (opts.alpha != null) ctx.globalAlpha = opts.alpha;
    // integer-snap for crisp, fast blits
    const dx = Math.round(x - e.hw);
    const dy = Math.round(y - e.top);
    ctx.drawImage(e.canvas, dx, dy, e.cssW, e.cssH);
    ctx.restore();
  }
}
