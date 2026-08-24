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

/** AI timing/accuracy model (seconds & probabilities). */
export const AI = {
  reactionMin: 0.5, // high-reaction AI lines up a shot this fast
  reactionMax: 1.15,
  reboundMin: 0.45,
  reboundMax: 1.25,
  chaserStagger: 0.28, // the chaser gets the ball a beat after the front player
  accMin: 0.46, // make prob for a low-accuracy AI at normal difficulty
  accMax: 0.82,
  betweenAttempt: 0.28, // small extra delay before a re-shot after a rebound
  maxAttempts: 40, // safety cap per duel
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
export const STREAK = { hot: 3, onFire: 5 };

/**
 * The 10 characters. Stats are in [0..1] and traded-off so no pick dominates —
 * the meter is identical for everyone; stats only nudge outcomes.
 * archetype tunes AI cadence/aggression when this character is CPU-controlled.
 * Visual fields drive the procedural sprite renderer.
 */
export const CHARACTERS = [
  {
    id: 'rookie', name: 'Rookie', archetype: 'rookie',
    stats: { accuracy: 0.55, reaction: 0.5, speed: 0.55, rebound: 0.55, clutch: 0.45 },
    skin: '#e8b48a', hair: 'short', hairColor: '#3a2a1c', headband: false,
    jersey: '#ff7a3d', shorts: '#22303f', number: 1,
  },
  {
    id: 'flash', name: 'Flash', archetype: 'fast',
    stats: { accuracy: 0.6, reaction: 0.8, speed: 0.85, rebound: 0.55, clutch: 0.55 },
    skin: '#c98a5a', hair: 'flattop', hairColor: '#1c1c22', headband: true, headbandColor: '#ffd23f',
    jersey: '#ffd23f', shorts: '#1b2a4a', number: 7,
  },
  {
    id: 'bigjoe', name: 'Big Joe', archetype: 'aggressive',
    stats: { accuracy: 0.55, reaction: 0.45, speed: 0.4, rebound: 0.9, clutch: 0.6 },
    skin: '#8a5a3a', hair: 'bald', hairColor: '#1c1c22', headband: false,
    jersey: '#2ec16b', shorts: '#123421', number: 42, big: true,
  },
  {
    id: 'ace', name: 'Ace', archetype: 'veteran',
    stats: { accuracy: 0.75, reaction: 0.65, speed: 0.65, rebound: 0.6, clutch: 0.7 },
    skin: '#f0c9a0', hair: 'fade', hairColor: '#2a1c12', headband: false,
    jersey: '#ff4d6d', shorts: '#2a0f18', number: 3,
  },
  {
    id: 'shooter', name: 'Shooter', archetype: 'sniper',
    stats: { accuracy: 0.88, reaction: 0.6, speed: 0.55, rebound: 0.45, clutch: 0.65 },
    skin: '#d99a6a', hair: 'curly', hairColor: '#1c1c22', headband: true, headbandColor: '#4dd0ff',
    jersey: '#4dd0ff', shorts: '#123a4a', number: 24,
  },
  {
    id: 'professor', name: 'Professor', archetype: 'clutch',
    stats: { accuracy: 0.7, reaction: 0.75, speed: 0.55, rebound: 0.65, clutch: 0.8 },
    skin: '#b87a4a', hair: 'afro', hairColor: '#20140a', headband: false, glasses: true,
    jersey: '#9b7bff', shorts: '#241640', number: 11,
  },
  {
    id: 'speedy', name: 'Speedy', archetype: 'fast',
    stats: { accuracy: 0.55, reaction: 0.7, speed: 0.9, rebound: 0.6, clutch: 0.5 },
    skin: '#e8b48a', hair: 'mohawk', hairColor: '#ff3b6b', headband: false,
    jersey: '#26e0c8', shorts: '#0f3a36', number: 5,
  },
  {
    id: 'tank', name: 'Tank', archetype: 'aggressive',
    stats: { accuracy: 0.6, reaction: 0.45, speed: 0.4, rebound: 0.85, clutch: 0.7 },
    skin: '#a06a3a', hair: 'buzz', hairColor: '#1c1c22', headband: true, headbandColor: '#ff5a3d',
    jersey: '#ff5a3d', shorts: '#3a1408', number: 55, big: true,
  },
  {
    id: 'clutch', name: 'Clutch', archetype: 'clutch',
    stats: { accuracy: 0.72, reaction: 0.65, speed: 0.6, rebound: 0.55, clutch: 0.9 },
    skin: '#c98a5a', hair: 'short', hairColor: '#101014', headband: false,
    jersey: '#ffb020', shorts: '#3a2600', number: 8,
  },
  {
    id: 'thekid', name: 'The Kid', archetype: 'veteran',
    stats: { accuracy: 0.68, reaction: 0.72, speed: 0.72, rebound: 0.55, clutch: 0.75 },
    skin: '#f0c9a0', hair: 'curly', hairColor: '#3a2a1c', headband: false,
    jersey: '#ff6ec7', shorts: '#3a0f2e', number: 0,
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
