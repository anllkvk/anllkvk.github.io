import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shotPoints, streakMultiplier, KNOCKOUT_BONUS, SURVIVE_BONUS } from '../src/core/score.js';
import { SHOT, SCORING } from '../src/config.js';

test('perfect scores more than good at the same streak', () => {
  assert.ok(shotPoints(SHOT.PERFECT, 0) > shotPoints(SHOT.GOOD, 0));
});

test('streak multiplier grows then caps', () => {
  assert.equal(streakMultiplier(0), 1);
  assert.ok(streakMultiplier(4) > streakMultiplier(1));
  assert.ok(streakMultiplier(1000) <= SCORING.streakMax + 1e-9);
});

test('a good shot ignores the streak multiplier (only perfects build it)', () => {
  assert.equal(shotPoints(SHOT.GOOD, 0), shotPoints(SHOT.GOOD, 10));
});

test('perfect points scale with streak', () => {
  assert.ok(shotPoints(SHOT.PERFECT, 5) > shotPoints(SHOT.PERFECT, 0));
});

test('bonuses are positive constants', () => {
  assert.ok(KNOCKOUT_BONUS > 0 && SURVIVE_BONUS > 0);
});
