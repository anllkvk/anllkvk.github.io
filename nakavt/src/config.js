/**
 * NAKAVT — Basketball Knockout
 * Central game configuration. Pure data only (no DOM), importable in Node for tests.
 */

export const GAME = {
  name: 'NAKAVT',
  subtitle: 'Basketball Knockout',
  totalPlayers: 10,
  targetFps: 60,
};

/** Finite state machine states. */
export const STATE = Object.freeze({
  MENU: 'MENU',
  CHARACTER_SELECT: 'CHARACTER_SELECT',
  ARENA_SELECT: 'ARENA_SELECT',
  COUNTDOWN: 'COUNTDOWN',
  PLAYING: 'PLAYING',
  PLAYER_ELIMINATED: 'PLAYER_ELIMINATED',
  FINAL_DUEL: 'FINAL_DUEL',
  VICTORY: 'VICTORY',
  GAME_OVER: 'GAME_OVER',
});

/** Shot-timing result buckets. */
export const SHOT = Object.freeze({
  PERFECT: 'PERFECT',
  GOOD: 'GOOD',
  EARLY: 'EARLY',
  LATE: 'LATE',
});

/**
 * Shot meter geometry. A marker sweeps a 0..1 track; the player taps to release.
 * Zones are symmetric around the centre (0.5). Player zones are constant across
 * difficulty on purpose — the game is skill-based, difficulty only tunes the AI.
 */
export const METER = {
  perfectHalfWidth: 0.045, // |pos-0.5| <= this  -> PERFECT
  goodHalfWidth: 0.13, // <= this           -> GOOD
  // else -> EARLY (pos < 0.5) / LATE (pos > 0.5)
  sweepSeconds: 1.05, // time for a full 0->1->0 ping-pong
};

/** Make-probability model. Kept deliberately fair — timing dominates. */
export const PROB = {
  base: { PERFECT: 0.97, GOOD: 0.8, EARLY: 0.3, LATE: 0.3 },
  clutchSwing: 0.06, // (clutch-0.5) * this
  pressurePenalty: 0.1, // pressure(0..1) * this
  fatiguePenalty: 0.08, // fatigue(0..1) * this
  perfectResilience: 0.5, // penalties on PERFECT scaled by this (skill is protected)
  floor: 0.04,
  ceil: 0.99,
};

/** AI timing/accuracy model (seconds & probabilities). Tuned slower for a calmer pace. */
export const AI = {
  reactionMin: 0.9, // high-reaction AI lines up a shot this fast
  reactionMax: 1.9,
  reboundMin: 0.9,
  reboundMax: 2.0,
  chaserStagger: 0.5, // the chaser gets the ball a beat after the front player
  accMin: 0.4, // make prob for a low-accuracy AI at normal difficulty
  accMax: 0.72,
  betweenAttempt: 0.5, // small extra delay before a re-shot after a rebound
  maxAttempts: 40, // safety cap per duel
};

/** Overall pacing (seconds). Larger = calmer, more readable gameplay. */
export const PACE = {
  ballFlight: 0.66, // arc time of a shot
  autoScale: 1.75, // speed-up for AI-vs-AI duels you're only watching (brisk but visible)
  intro: 0.22, // brief "get ready" beat before a duel goes live (kept short for continuity)
  resultHold: 0.36, // short beat after a made basket before the next pairing steps up
  koTime: 0.72, // knockdown animation length
  looseTimeout: 4.0, // safety: a loose ball you never reach returns to you
};

/** Player movement (HaxBall-style free movement on the court). Court-space units/sec. */
export const MOVE = {
  accel: 1400, // how quickly the player reaches top speed
  maxSpeed: 220, // top movement speed
  friction: 8.5, // velocity damping when no input
  grabRadius: 30, // pick up a loose ball within this distance
  aiMoveSpeed: 150, // opponent avatar drift speed (cosmetic)
};

/** Aim-and-power shot model. The arrow auto-aims at the hoop; you time the power. */
export const SHOTPWR = {
  chargeSeconds: 1.15, // time for the power bar to sweep 0->1->0 (ping-pong)
  // Ideal power scales with distance to the hoop (closer = softer shot).
  distMin: 60,
  distMax: 340,
  idealMin: 0.28,
  idealMax: 0.9,
  perfectTol: 0.05, // |power-ideal| within this => PERFECT
  goodTol: 0.13, // <= this => GOOD, else miss
};

/** Difficulty presets — scale AI accuracy and speed, never the player. */
export const DIFFICULTY = Object.freeze({
  EASY: { key: 'EASY', label: 'Easy', accMult: 0.82, speedMult: 0.85, roundRamp: 0.02 },
  NORMAL: { key: 'NORMAL', label: 'Normal', accMult: 1.0, speedMult: 1.0, roundRamp: 0.03 },
  HARD: { key: 'HARD', label: 'Hard', accMult: 1.12, speedMult: 1.12, roundRamp: 0.04 },
  // Reserved for a future unlock; wired but hidden by default.
  INSANE: { key: 'INSANE', label: 'Insane', accMult: 1.25, speedMult: 1.25, roundRamp: 0.05 },
});

/** Combo thresholds for the streak system. */
export const STREAK = { hot: 3, onFire: 5, inferno: 7 };

/** Arcade scoring — cosmetic points on top of the (unchanged) knockout gameplay. */
export const SCORING = Object.freeze({
  perfect: 100,
  good: 50,
  knockout: 150, // bonus when YOU knock a rival out
  survive: 25, // bonus when you stay alive as the front shooter
  streakStep: 0.25, // multiplier grows by this per perfect in the streak
  streakMax: 3, // multiplier capped here (x3)
});

/**
 * Global design tokens — one source of truth for colors so they aren't
 * hard-coded per file. (CSS has its own mirror in styles.css :root.)
 */
export const COLORS = Object.freeze({
  bg: '#0a0e1a',
  ink: '#f4f6ff',
  primary: '#ff7a1a',
  secondary: '#ffd23f',
  accent: '#4dd0ff',
  danger: '#ff3b4e',
  success: '#2ec16b',
  perfect: '#ffd23f',
  good: '#3aa76d',
  hot: '#ff8c1a',
  onFire: '#ff3b3b',
  shadow: 'rgba(0,0,0,0.28)',
});

/**
 * Game-feel / VFX tuning. Small, controlled values — juice without turning the
 * game into a physics toy. All additive to the existing (unchanged) gameplay.
 */
export const FX = Object.freeze({
  camPunchPerfect: 0.05, // zoom bump on a perfect make
  camPunchGood: 0.025,
  camShakeKnockout: 7, // px amplitude
  camShakeKnockoutDur: 0.28,
  camShakeMiss: 3,
  camShakeMissDur: 0.14,
  camZoomFinal: 1.12, // final-duel zoom
  flashPerfect: 0.32, // white screen-flash alpha on perfect
  trailFrames: 7, // ball motion-trail length
  vignette: 0.28, // base vignette strength
  vignetteFinal: 0.44,
  squashLand: 0.16, // squash amount on landing
  stretchShoot: 0.12, // stretch on release
});

/** Particle pool + emission tuning. */
export const PARTICLES = Object.freeze({
  max: 260,
  perfectBurst: 16,
  goodBurst: 7,
  knockoutBurst: 22,
  dust: 5,
  confetti: 120,
});

/**
 * The 10 characters. Stats are in [0..1] and traded-off so no pick dominates —
 * the meter is identical for everyone; stats only nudge outcomes.
 * archetype tunes AI cadence/aggression when this character is CPU-controlled.
 * Visual fields drive the procedural sprite renderer.
 */
export const CHARACTERS = [
  {
    id: 'king', name: 'M. King', team: 'COAST KINGS', archetype: 'veteran', number: 6,
    stats: { accuracy: 0.74, reaction: 0.7, speed: 0.72, rebound: 0.72, clutch: 0.78 },
    skin: '#7a4a28', hair: 'fade', hairColor: '#120d0a', beard: 'full', headband: true, headbandColor: '#f5c542',
    jersey: '#5b2a86', jerseyTrim: '#f5c542', shorts: '#4a2270', height: 'tall',
  },
  {
    id: 'splash', name: 'R. Frost', team: 'BAY SPLASH', archetype: 'sniper', number: 30,
    stats: { accuracy: 0.9, reaction: 0.62, speed: 0.62, rebound: 0.42, clutch: 0.74 },
    skin: '#c98a5a', hair: 'highfade', hairColor: '#1c140c', beard: 'goatee',
    jersey: '#1d6fb8', jerseyTrim: '#ffd23f', shorts: '#164e82', height: 'reg',
  },
  {
    id: 'slim', name: 'T. Reed', team: 'SOUND CITY', archetype: 'sniper', number: 35,
    stats: { accuracy: 0.86, reaction: 0.64, speed: 0.6, rebound: 0.56, clutch: 0.74 },
    skin: '#3f2a1c', hair: 'short', hairColor: '#0e0a08', beard: 'goatee', sleeve: true, sleeveColor: '#0a3a2c',
    jersey: '#0e7a5f', jerseyTrim: '#eaf2ef', shorts: '#0a5544', height: 'tall',
  },
  {
    id: 'titan', name: 'D. Titan', team: 'CREAM CITY', archetype: 'aggressive', number: 34,
    stats: { accuracy: 0.6, reaction: 0.6, speed: 0.78, rebound: 0.88, clutch: 0.62 },
    skin: '#5a3a22', hair: 'dreads', hairColor: '#0e0a08',
    jersey: '#1f7a3d', jerseyTrim: '#f0e2c0', shorts: '#155229', height: 'big',
  },
  {
    id: 'kovac', name: 'M. Kovač', team: 'LONE STAR', archetype: 'clutch', number: 77,
    stats: { accuracy: 0.8, reaction: 0.7, speed: 0.55, rebound: 0.6, clutch: 0.82 },
    skin: '#e8b48a', hair: 'mop', hairColor: '#2a1c10', beard: 'goatee',
    jersey: '#12345e', jerseyTrim: '#7fb0e0', shorts: '#0d2544', height: 'tall',
  },
  {
    id: 'blaze', name: 'T. Blaze', team: 'THUNDERHEAD', archetype: 'fast', number: 0,
    stats: { accuracy: 0.58, reaction: 0.8, speed: 0.92, rebound: 0.62, clutch: 0.55 },
    skin: '#6a4428', hair: 'buzz', hairColor: '#0e0a08', beard: 'full', headband: true, headbandColor: '#ff7a1a',
    jersey: '#1256a8', jerseyTrim: '#ff7a1a', shorts: '#0e3f7c', height: 'reg',
  },
  {
    id: 'post', name: 'I. Post', team: 'MILE HIGH', archetype: 'aggressive', number: 15,
    stats: { accuracy: 0.68, reaction: 0.5, speed: 0.42, rebound: 0.92, clutch: 0.68 },
    skin: '#e0aa7a', hair: 'short', hairColor: '#241812', beard: 'full',
    jersey: '#0e2148', jerseyTrim: '#e0b24a', shorts: '#0a1836', height: 'big',
  },
  {
    id: 'mamba', name: 'V. Mamba', team: 'WINDY CITY', archetype: 'clutch', number: 24,
    stats: { accuracy: 0.82, reaction: 0.72, speed: 0.7, rebound: 0.58, clutch: 0.9 },
    skin: '#8a5a34', hair: 'bald', hairColor: '#101014',
    jersey: '#c8102e', jerseyTrim: '#151515', shorts: '#101010', height: 'reg',
  },
  {
    id: 'kai', name: 'K. Silent', team: 'ALAMO', archetype: 'veteran', number: 2,
    stats: { accuracy: 0.76, reaction: 0.74, speed: 0.62, rebound: 0.68, clutch: 0.8 },
    skin: '#5a3a22', hair: 'cornrows', hairColor: '#0e0a08',
    jersey: '#111214', jerseyTrim: '#c9ccd4', shorts: '#1a1c20', height: 'tall',
  },
  {
    id: 'bounce', name: 'Z. Young', team: 'RIVER CITY', archetype: 'fast', number: 12,
    stats: { accuracy: 0.66, reaction: 0.74, speed: 0.86, rebound: 0.7, clutch: 0.7 },
    skin: '#6a4428', hair: 'dreads', hairColor: '#1a1206',
    jersey: '#0f8a8a', jerseyTrim: '#ff445a', shorts: '#0b6363', height: 'big',
  },
];

/** Two original arenas (no real teams/logos — arcade-original themes). */
export const ARENAS = [
  {
    id: 'bay', name: 'Bay Arena', tagline: 'West Coast lights',
    court: '#d7a86a', courtLine: '#f4e4c8', keyPaint: '#2b6cff',
    crowdA: '#1b3a8a', crowdB: '#ffd23f', wall: '#0e1b3a', wallGlow: '#2b6cff',
    accent: '#ffd23f', floorSheen: '#e6c48f',
  },
  {
    id: 'celtic', name: 'Celtic Garden', tagline: 'Old parquet nights',
    court: '#c69a5a', courtLine: '#f0e2c0', keyPaint: '#1f7a3d',
    crowdA: '#0f5a2e', crowdB: '#f0e2c0', wall: '#0c2417', wallGlow: '#1f7a3d',
    accent: '#f5e9c8', floorSheen: '#d6ab68', parquet: true,
  },
  {
    id: 'street', name: 'Sunset Blacktop', tagline: 'Downtown streetball',
    court: '#5c6169', courtLine: '#e9e3d2', keyPaint: '#c24a2b',
    crowdA: '#ff7a3d', crowdB: '#ffd23f', wall: '#2a1636', wallGlow: '#ff7a3d',
    accent: '#ff9c4a', floorSheen: '#6a6f78',
  },
];

/** Analytics event names — abstraction only; sink is swappable. */
export const EVENTS = Object.freeze({
  GAME_START: 'game_start',
  GAME_END: 'game_end',
  SHOT_ATTEMPT: 'shot_attempt',
  PERFECT_SHOT: 'perfect_shot',
  PLAYER_ELIMINATED: 'player_eliminated',
  FINAL_DUEL: 'final_duel',
  VICTORY: 'victory',
  CHARACTER_SELECTED: 'character_selected',
  ARENA_SELECTED: 'arena_selected',
});

export const STORAGE_KEY = 'nakavt.save.v1';
