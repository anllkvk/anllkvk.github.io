/**
 * Knockout match — the pure rules engine. No DOM, no timers; fully testable.
 *
 * Real free-throw Knockout: players queue at the line; the front two are "on the
 * clock". FRONT must sink a basket to be safe; the CHASER right behind races to
 * sink one first. If the CHASER makes it before the FRONT, the FRONT is
 * eliminated. Whoever makes their basket is safe and cycles to the back.
 *
 * Queue rotation, given queue = [front, chaser, next1, next2, ...]:
 *   FRONT makes first  -> front safe -> [chaser, next1, ..., front]
 *   CHASER makes first -> front OUT  -> [next1, next2, ..., chaser]
 *
 * Continues until one player remains (champion). A queue of 2 is the FINAL DUEL.
 */
import { AI } from '../config.js';
import { lerp, clamp } from './rng.js';
import { resolveAiShot } from './shot.js';

export class KnockoutMatch {
  /**
   * @param {Array} players roster: {id, name, stats, archetype, isHuman}
   * @param {object} opts { difficulty, rng }
   */
  constructor(players, opts = {}) {
    this.players = players;
    this.byId = new Map(players.map((p) => [p.id, p]));
    this.difficulty = opts.difficulty;
    this.rng = opts.rng;
    this.queue = players.map((p) => p.id); // starting order (already shuffled by caller)
    this.eliminated = []; // ids in elimination order (0 = out first)
    this.duelsResolved = 0;
    this.humanId = players.find((p) => p.isHuman)?.id ?? null;
  }

  get aliveCount() { return this.queue.length; }
  get isFinalDuel() { return this.queue.length === 2; }
  get isOver() { return this.queue.length <= 1; }
  get champion() { return this.isOver ? this.byId.get(this.queue[0]) : null; }

  /** The current pairing. */
  duel() {
    if (this.queue.length < 2) return null;
    const frontId = this.queue[0];
    const chaserId = this.queue[1];
    const humanRole = frontId === this.humanId ? 'front'
      : chaserId === this.humanId ? 'chaser' : null;
    return {
      frontId, chaserId, humanRole,
      humanInvolved: humanRole !== null,
      front: this.byId.get(frontId),
      chaser: this.byId.get(chaserId),
      round: this.eliminated.length + 1,
    };
  }

  /**
   * Apply a resolved duel.
   * @param {'front'|'chaser'} winner who sank their basket first
   * @returns {{winnerId, safeId, eliminatedId, done, champion, finalDuel}}
   */
  resolve(winner) {
    const d = this.duel();
    if (!d) return { done: true, champion: this.champion };
    this.duelsResolved++;

    let eliminatedId = null;
    if (winner === 'front') {
      // front safe -> back of queue
      this.queue.shift();
      this.queue.push(d.frontId);
    } else {
      // chaser makes first -> front eliminated, chaser safe -> back
      this.queue.shift(); // remove front
      this.queue.shift(); // remove chaser
      this.queue.push(d.chaserId);
      eliminatedId = d.frontId;
      this.eliminated.push(eliminatedId);
    }

    return {
      winnerId: winner === 'front' ? d.frontId : d.chaserId,
      safeId: winner === 'front' ? d.frontId : d.chaserId,
      eliminatedId,
      done: this.isOver,
      champion: this.isOver ? this.champion : null,
      finalDuel: this.isFinalDuel,
    };
  }

  /** Effective AI make-prob per attempt, folding difficulty and round ramp. */
  aiAccuracy(player, pressure = 0) {
    const acc = player.stats.accuracy;
    let eff = lerp(AI.accMin, AI.accMax, acc) * this.difficulty.accMult;
    // Round ramp: field gets sharper as it thins.
    eff += this.eliminated.length * this.difficulty.roundRamp;
    eff -= pressure * 0.08;
    return clamp(eff, 0.2, 0.97);
  }

  /** Seconds an AI needs to line up a shot. */
  aiReaction(player) {
    const t = lerp(AI.reactionMax, AI.reactionMin, player.stats.reaction);
    return t / this.difficulty.speedMult;
  }

  /** Seconds an AI needs to recover a rebound before re-shooting. */
  aiRebound(player) {
    const t = lerp(AI.reboundMax, AI.reboundMin, player.stats.rebound);
    return t / this.difficulty.speedMult;
  }

  /**
   * Fully simulate an AI-vs-AI duel to a winner (used when the human isn't in
   * the pairing). Event-driven over a shared timeline; first to MAKE wins.
   * @returns {{winner:'front'|'chaser', attempts:Array}}
   */
  simulateAiDuel(d) {
    const rng = this.rng;
    const front = d.front, chaser = d.chaser;
    const attempts = [];
    // Front gets the ball first; chaser a beat later.
    let tFront = this.aiReaction(front);
    let tChaser = this.aiReaction(chaser) + AI.chaserStagger;

    for (let i = 0; i < AI.maxAttempts; i++) {
      const frontFirst = tFront <= tChaser;
      const who = frontFirst ? 'front' : 'chaser';
      const p = frontFirst ? front : chaser;
      // Pressure rises for the front player as the chaser keeps shooting.
      const pressure = who === 'front' ? clamp(attempts.length * 0.05, 0, 0.5) : 0;
      const shot = resolveAiShot(this.aiAccuracy(p, pressure), { clutch: p.stats.clutch, pressure }, rng);
      attempts.push({ who, t: frontFirst ? tFront : tChaser, quality: shot.quality, made: shot.made });
      if (shot.made) return { winner: who, attempts };
      // Missed -> rebound recovery, then re-shoot.
      const recover = this.aiRebound(p) + AI.betweenAttempt;
      if (frontFirst) tFront += recover; else tChaser += recover;
    }
    // Safety fallback: better shooter wins.
    const winner = this.aiAccuracy(front) >= this.aiAccuracy(chaser) ? 'front' : 'chaser';
    return { winner, attempts };
  }
}

/** Build the starting roster: human's pick + the other 9 as AI, shuffled order. */
export function buildRoster(characters, humanCharId, rng) {
  const roster = characters.map((c) => ({
    id: c.id,
    name: c.name,
    stats: c.stats,
    archetype: c.archetype,
    isHuman: c.id === humanCharId,
  }));
  return rng.shuffle(roster);
}
