/**
 * Haptics — a safe wrapper over navigator.vibrate. No-op (never throws) on
 * devices/browsers that don't support it. Short, purposeful patterns only.
 */
export const haptics = {
  enabled: true,
  _ok: typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function',

  setEnabled(on) { this.enabled = !!on; },

  _buzz(pattern) {
    if (!this.enabled || !this._ok) return;
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  },

  tap() { this._buzz(8); },
  perfect() { this._buzz(16); },
  score() { this._buzz(12); },
  knockout() { this._buzz([18, 26, 22]); },
  victory() { this._buzz([26, 40, 26, 40, 70]); },
};
