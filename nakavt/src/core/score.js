/**
 * Arcade scoring — pure and testable. Points sit on top of the knockout gameplay
 * (they never change who wins a duel); they exist to reward skill and drive a
 * high-score chase.
 */
import { SCORING, SHOT } from '../config.js';

/** Multiplier from the current perfect streak, capped. */
export function streakMultiplier(streak) {
  return 1 + Math.min(SCORING.streakMax - 1, Math.max(0, streak) * SCORING.streakStep);
}

/** Points for a made shot of the given quality at the given streak. */
export function shotPoints(quality, streak = 0) {
  const base = quality === SHOT.PERFECT ? SCORING.perfect : SCORING.good;
  return Math.round(base * streakMultiplier(quality === SHOT.PERFECT ? streak : 0));
}

export const KNOCKOUT_BONUS = SCORING.knockout;
export const SURVIVE_BONUS = SCORING.survive;
