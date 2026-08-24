/**
 * Shot mechanics — pure, deterministic given RNG. Shared by the interactive
 * player meter and the AI so success math is identical for everyone (fairness).
 */
import { METER, PROB, SHOT, SHOTPWR } from '../config.js';
import { clamp, lerp } from './rng.js';

/** Ideal release power for a shot from `dist` pixels to the hoop (closer = softer). */
export function idealPowerForDistance(dist) {
  const t = clamp((dist - SHOTPWR.distMin) / (SHOTPWR.distMax - SHOTPWR.distMin), 0, 1);
  return lerp(SHOTPWR.idealMin, SHOTPWR.idealMax, t);
}

/** Classify an aim-and-power release against the ideal power for the distance. */
export function classifyPower(power, dist) {
  const err = Math.abs(power - idealPowerForDistance(dist));
  if (err <= SHOTPWR.perfectTol) return SHOT.PERFECT;
  if (err <= SHOTPWR.goodTol) return power < idealPowerForDistance(dist) ? SHOT.EARLY : SHOT.LATE;
  return power < idealPowerForDistance(dist) ? SHOT.EARLY : SHOT.LATE;
}

/** Resolve a human aim-and-power shot. Returns quality + made + the error used. */
export function resolvePowerShot(power, dist, ctx, rng) {
  const ideal = idealPowerForDistance(dist);
  const err = Math.abs(power - ideal);
  let quality;
  if (err <= SHOTPWR.perfectTol) quality = SHOT.PERFECT;
  else if (err <= SHOTPWR.goodTol) quality = SHOT.GOOD;
  else quality = power < ideal ? SHOT.EARLY : SHOT.LATE;
  const p = makeProbability(quality, ctx);
  return { quality, made: rng.next() < p, prob: p, err, ideal };
}

/**
 * Classify a meter release position (0..1) into a timing bucket.
 * Centre (0.5) is PERFECT; symmetric GOOD band; else EARLY/LATE by side.
 */
export function classifyRelease(pos) {
  const off = Math.abs(pos - 0.5);
  if (off <= METER.perfectHalfWidth) return SHOT.PERFECT;
  if (off <= METER.goodHalfWidth) return pos < 0.5 ? SHOT.GOOD : SHOT.GOOD;
  return pos < 0.5 ? SHOT.EARLY : SHOT.LATE;
}

/**
 * Probability a shot of the given quality goes in.
 * ctx: { clutch=0.5, pressure=0, fatigue=0 } — all in [0..1].
 * Penalties are softened on PERFECT so good timing stays rewarding.
 */
export function makeProbability(quality, ctx = {}) {
  const clutch = ctx.clutch ?? 0.5;
  const pressure = ctx.pressure ?? 0;
  const fatigue = ctx.fatigue ?? 0;

  const base = PROB.base[quality] ?? 0.3;
  const clutchBonus = (clutch - 0.5) * PROB.clutchSwing;
  const resil = quality === SHOT.PERFECT ? PROB.perfectResilience : 1;
  const penalty = (pressure * PROB.pressurePenalty + fatigue * PROB.fatiguePenalty) * resil;

  return clamp(base + clutchBonus - penalty, PROB.floor, PROB.ceil);
}

/** Resolve a player (human) shot from a meter position. */
export function resolvePlayerShot(pos, ctx, rng) {
  const quality = classifyRelease(pos);
  const p = makeProbability(quality, ctx);
  const made = rng.next() < p;
  return { quality, made, prob: p, pos };
}

/**
 * Sample an AI shot quality from its accuracy, then resolve.
 * Higher accuracy shifts the distribution toward PERFECT/GOOD.
 * accEff already folds in difficulty & round ramp.
 */
export function resolveAiShot(accEff, ctx, rng) {
  const r = rng.next();
  // accEff in ~[0.4..1.0]; map to quality odds.
  const perfectCut = 0.12 + accEff * 0.4; // up to ~0.52 chance of perfect
  const goodCut = perfectCut + 0.25 + accEff * 0.15;
  let quality;
  if (r < perfectCut) quality = SHOT.PERFECT;
  else if (r < goodCut) quality = SHOT.GOOD;
  else quality = rng.next() < 0.5 ? SHOT.EARLY : SHOT.LATE;

  const p = makeProbability(quality, ctx);
  return { quality, made: rng.next() < p, prob: p };
}

export { SHOT };
