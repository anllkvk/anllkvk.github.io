/**
 * Procedural sound. Everything is synthesized with the Web Audio API at runtime
 * — zero audio files, zero copyright, tiny footprint. A soft looping "crowd"
 * bed plus one-shot arcade blips. Respects a global mute + volume.
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.volume = 0.7;
    this.crowd = null;
    this._crowdGain = null;
  }

  /** Lazily create the AudioContext (must follow a user gesture on mobile). */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.volume;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && !this.muted) this.master.gain.value = this.volume;
  }

  _env(type, freq, dur, gain = 0.5, sweep = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweep), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, gain = 0.3, filterHz = 2000, type = 'bandpass') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const frames = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterHz;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  bounce() { this._env('sine', 180, 0.12, 0.4, 90); this._noise(0.05, 0.12, 400, 'lowpass'); }
  rim() { this._env('square', 320, 0.08, 0.25, 220); this._noise(0.04, 0.1, 3000); }
  swish() { this._noise(0.18, 0.28, 5200, 'highpass'); }
  whistle() { this._env('sine', 2100, 0.18, 0.28, 2400); }
  click() { this._env('square', 520, 0.05, 0.22, 460); }
  perfect() { this._env('triangle', 720, 0.1, 0.32, 1080); this._env('triangle', 1080, 0.14, 0.24, 1400); }

  knockout() {
    this._env('sawtooth', 300, 0.35, 0.4, 60);
    this._noise(0.25, 0.3, 1200, 'lowpass');
  }

  countBeep(final = false) { this._env('square', final ? 880 : 440, 0.14, 0.3, final ? 900 : 440); }

  victory() {
    if (!this.ctx) return;
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) => setTimeout(() => this._env('triangle', f, 0.22, 0.34, f * 1.02), i * 110));
    setTimeout(() => this._noise(0.4, 0.2, 6000, 'highpass'), 120); // crowd cheer
  }

  /** Soft continuous crowd bed. */
  startCrowd() {
    if (!this.ctx || this.crowd) return;
    const frames = Math.floor(this.ctx.sampleRate * 2);
    const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.master);
    src.start();
    this.crowd = src; this._crowdGain = g;
  }

  crowdSwell(level = 0.12) {
    if (!this._crowdGain || !this.ctx) return;
    const t = this.ctx.currentTime;
    this._crowdGain.gain.cancelScheduledValues(t);
    this._crowdGain.gain.setValueAtTime(this._crowdGain.gain.value, t);
    this._crowdGain.gain.linearRampToValueAtTime(level, t + 0.15);
    this._crowdGain.gain.linearRampToValueAtTime(0.05, t + 1.2);
  }

  stopCrowd() {
    if (this.crowd) { try { this.crowd.stop(); } catch { /* already stopped */ } this.crowd = null; }
  }
}
