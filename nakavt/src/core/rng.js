/**
 * Seedable RNG (mulberry32). Deterministic given a seed so matches are
 * reproducible in tests and "controlled randomness" stays controllable.
 */
export function makeRng(seed = (Date.now() >>> 0)) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    /** float in [0,1) */
    next,
    /** float in [min,max) */
    range: (min, max) => min + next() * (max - min),
    /** integer in [min,max] inclusive */
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    /** true with probability p */
    chance: (p) => next() < p,
    /** pick a random element */
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** Fisher-Yates shuffle (returns a new array) */
    shuffle: (arr) => {
      const a2 = arr.slice();
      for (let i = a2.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [a2[i], a2[j]] = [a2[j], a2[i]];
      }
      return a2;
    },
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
