import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS, DIFFICULTY } from '../src/config.js';
import { makeRng } from '../src/core/rng.js';
import { KnockoutMatch, buildRoster } from '../src/core/knockout.js';
import { classifyRelease, makeProbability, resolvePlayerShot } from '../src/core/shot.js';
import { SHOT } from '../src/config.js';

test('10 players spawn and queue is correct', () => {
  const rng = makeRng(1);
  const roster = buildRoster(CHARACTERS, 'shooter', rng);
  assert.equal(roster.length, 10);
  assert.equal(roster.filter((p) => p.isHuman).length, 1);
  const m = new KnockoutMatch(roster, { difficulty: DIFFICULTY.NORMAL, rng });
  assert.equal(m.aliveCount, 10);
  assert.equal(m.queue.length, 10);
  const d = m.duel();
  assert.equal(d.frontId, m.queue[0]);
  assert.equal(d.chaserId, m.queue[1]);
});

test('FRONT makes first -> nobody eliminated, front cycles to back', () => {
  const rng = makeRng(2);
  const roster = buildRoster(CHARACTERS, 'ace', rng);
  const m = new KnockoutMatch(roster, { difficulty: DIFFICULTY.NORMAL, rng });
  const before = m.aliveCount;
  const frontId = m.queue[0];
  const r = m.resolve('front');
  assert.equal(m.aliveCount, before, 'no elimination');
  assert.equal(r.eliminatedId, null);
  assert.equal(m.queue[m.queue.length - 1], frontId, 'front moved to back');
});

test('CHASER makes first -> front eliminated and removed entirely', () => {
  const rng = makeRng(3);
  const roster = buildRoster(CHARACTERS, 'ace', rng);
  const m = new KnockoutMatch(roster, { difficulty: DIFFICULTY.NORMAL, rng });
  const frontId = m.queue[0];
  const chaserId = m.queue[1];
  const r = m.resolve('chaser');
  assert.equal(r.eliminatedId, frontId);
  assert.equal(m.aliveCount, 9);
  assert.ok(!m.queue.includes(frontId), 'eliminated player fully removed');
  assert.equal(m.queue[m.queue.length - 1], chaserId, 'chaser safe at back');
});

test('a full simulated match always ends with exactly one champion', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rng = makeRng(seed);
    const roster = buildRoster(CHARACTERS, CHARACTERS[seed % 10].id, rng);
    const m = new KnockoutMatch(roster, { difficulty: DIFFICULTY.NORMAL, rng });
    let guard = 0;
    let sawFinalDuel = false;
    while (!m.isOver && guard++ < 5000) {
      if (m.isFinalDuel) sawFinalDuel = true;
      const d = m.duel();
      const { winner } = m.simulateAiDuel(d);
      m.resolve(winner);
    }
    assert.ok(m.isOver, `seed ${seed} terminated`);
    assert.equal(m.aliveCount, 1, `seed ${seed} one champion`);
    assert.equal(m.eliminated.length, 9, `seed ${seed} nine eliminated`);
    assert.ok(sawFinalDuel, `seed ${seed} passed through a final duel`);
    assert.ok(m.champion, `seed ${seed} has a champion`);
  }
});

test('eliminations are unique and champion never in eliminated list', () => {
  const rng = makeRng(99);
  const roster = buildRoster(CHARACTERS, 'clutch', rng);
  const m = new KnockoutMatch(roster, { difficulty: DIFFICULTY.HARD, rng });
  while (!m.isOver) m.resolve(m.simulateAiDuel(m.duel()).winner);
  assert.equal(new Set(m.eliminated).size, 9);
  assert.ok(!m.eliminated.includes(m.champion.id));
});

test('shot classification zones', () => {
  assert.equal(classifyRelease(0.5), SHOT.PERFECT);
  assert.equal(classifyRelease(0.52), SHOT.PERFECT);
  assert.equal(classifyRelease(0.4), SHOT.GOOD);
  assert.equal(classifyRelease(0.6), SHOT.GOOD);
  assert.equal(classifyRelease(0.1), SHOT.EARLY);
  assert.equal(classifyRelease(0.95), SHOT.LATE);
});

test('perfect shots are high prob and better than early/late (fairness)', () => {
  const perfect = makeProbability(SHOT.PERFECT, { clutch: 0.5 });
  const good = makeProbability(SHOT.GOOD, { clutch: 0.5 });
  const early = makeProbability(SHOT.EARLY, { clutch: 0.5 });
  assert.ok(perfect > good && good > early);
  assert.ok(perfect >= 0.95);
});

test('pressure hurts less on a perfect release than on a good one', () => {
  const perfDelta = makeProbability(SHOT.PERFECT, { pressure: 0 }) - makeProbability(SHOT.PERFECT, { pressure: 1 });
  const goodDelta = makeProbability(SHOT.GOOD, { pressure: 0 }) - makeProbability(SHOT.GOOD, { pressure: 1 });
  assert.ok(perfDelta < goodDelta, 'perfect timing is protected');
});

test('resolvePlayerShot is deterministic under a seed', () => {
  const a = resolvePlayerShot(0.5, { clutch: 0.6 }, makeRng(7));
  const b = resolvePlayerShot(0.5, { clutch: 0.6 }, makeRng(7));
  assert.deepEqual(a, b);
});
