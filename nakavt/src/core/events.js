/**
 * Analytics abstraction. First release logs to a ring buffer (and console in
 * debug) — no third-party SDK. Swap `sink` later for a real provider without
 * touching call sites.
 */
const buffer = [];
const MAX = 200;

let sink = (name, payload) => {
  buffer.push({ name, payload, t: Date.now() });
  if (buffer.length > MAX) buffer.shift();
};

let debug = false;

export const analytics = {
  track(name, payload = {}) {
    try {
      sink(name, payload);
      if (debug) console.debug(`[analytics] ${name}`, payload);
    } catch { /* analytics must never break gameplay */ }
  },
  setSink(fn) { sink = fn; },
  setDebug(on) { debug = !!on; },
  history() { return buffer.slice(); },
};
