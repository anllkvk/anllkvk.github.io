# Real Knockout Basketball — Rules Research

Research into the real playground/coaching game "Knockout" (a.k.a. Lightning, Bump,
Bumpout, Gotcha, Tornado, Speed, Killer) to make NAKAVT's gameplay faithful, then a
gap analysis against the current implementation.

## Sources reviewed

1. **UMaine PE — "Knockout Rules"** (university phys-ed handout) — umaine.edu.
2. **Breakthrough Basketball — "How to Play Basketball Knockout"** (coaching site).
3. **Basketball For Coaches — "Knockout (Rules and Variations)"** (coaching site).
4. **CoachUp Nation — "Basketball Shooting Games: Knockout"**.
5. **Playworks — "Knockout"** (youth-games organization).
6. **DICK'S PRO TIPS — "How to Play Knockout"**.
7. **Wikipedia — "Knockout (game)"** (overview + aliases + variations).

(WebFetch to these hosts is blocked by this environment's egress proxy; rules below are
consolidated from the search summaries of the above authoritative sources.)

## What every source agrees on (the standard rules)

| # | Rule | Sources |
|---|---|---|
| 1 | Players line up single-file at the **free-throw line**; the **first two** players each have a ball. | 1,2,3,4,5,6 |
| 2 | The front player shoots **from the free-throw line**. | all |
| 3 | The second player may shoot **as soon as the first player releases** their first shot. | 2,3,4 |
| 4 | **Miss → rebound and shoot from anywhere** (layup/put-back) — keep shooting until you make it. | 1,2,3,4,6 |
| 5 | **Elimination:** if the player **behind** you sinks a basket **before** you do, **you're knocked out**. | all |
| 6 | The player who **makes** their basket is safe — they **pass the ball to the next player in line** and rejoin the **back**. | 2,3,5 |
| 7 | **Continuous play** — no reset, no round restart. It flows until **one player remains** (champion). | all |
| 8 | Only ever **two balls in play** at once (the front two); making a shot **hands the ball off** to keep it at two. | 2,3,5 |

## Variations (optional, source-dependent)

- **Shooting spot:** free-throw line (most common) or **top of the key** (harder). — 3,4
- **Layup-only after the first miss:** subsequent shots must be layups. — 3,6
- **Swat/steal:** you may knock away an opponent's ball with your own (aggressive variant). — 3, Wikipedia
- **Move the line back** each round to raise difficulty. — 3,6
- Aliases: Lightning, Bump, Bumpout, Gotcha, Tornado, Speed, Killer. — Wikipedia

## Which rules NAKAVT will apply (and why)

| Rule | Decision | Why |
|---|---|---|
| First shot from the FT line, no movement until release | **APPLY** (already added: `attempts===0` clamps to the line) | Core to the game's identity; the user explicitly asked for it. |
| Second (chaser) active on the front player's release | **APPLY** | Standard; creates the race tension. |
| Miss → free movement, rebound & finish from anywhere | **APPLY** (movement unlocks after the first attempt) | Core; already partly implemented. |
| Behind-player-scores-first ⇒ front eliminated | **APPLY** (this is the `KnockoutMatch` rule, unchanged) | The heart of the game. |
| Scorer safe → ball handed to next → rejoins back | **APPLY, made continuous** | The faithful rotation; must flow with **no reset/countdown**. |
| Two balls max (hand-off keeps it at two) | **APPLY (faithful)** — see the open decision below | Real rule; "many balls at once" is a deviation. |
| Layup-only / swat / move-the-line | **DEFER** (optional future variants/difficulty) | Nice-to-have, not core. |

## GAP ANALYSIS — real rules vs. current NAKAVT

Current code models the match as a **queue of discrete 1-v-1 "duels"** (`core/knockout.js`
+ `scene.js` phases `intro → live → resolve/ko`). This is *rules-correct on the outcome*
(front/chaser, elimination, rotation, champion — all verified by 31 tests) but **not
continuous** in feel:

| Real rule / feel | Current behavior | Gap to close |
|---|---|---|
| Continuous, never stops | Each pairing is a discrete duel with a ~0.38s `intro` and ~0.5s `resolve` hold; the ball is re-created per duel | Remove per-duel intros/holds; one persistent line simulation, seamless hand-off |
| First shot from FT line | ✅ done (`attempts===0` clamp) | — |
| Chaser active on release | Approximated (chaser has a stagger timer) | Tie chaser's "go" to the front player's actual release |
| Miss → chase & finish | ✅ human; AI chase is timer-based, not real movement | Give AI a real **rebound-chase** (steering) using the same ball physics |
| AI behaves like a real player | AI resolves on stat **timers**; only cosmetic drift; watched duels play out but rivals don't truly move to the ball | Unify Player+AI on **one CharacterController** + **one BallManager**; AI uses steering to the predicted rebound |
| Two balls, hand-off | Balls are created/destroyed per duel; only the active pair render balls | A persistent **BallManager** (≤2 balls) that hands off, never "resets"/respawns |
| No round reset / countdown | Only a start countdown (fine); between duels there are phase gates that read as pauses | Replace duel phases with a continuous state machine (below) |

## Target continuous state (per player)

```
QUEUED → INITIAL_FREE_THROW → BALL_IN_FLIGHT → (made ⇒ SAFE→back / handoff)
                                           ↘ (miss) → LIVE_CHASE → REBOUND → SECONDARY_SHOT → …
front player never sinks before chaser ⇒ ELIMINATED (removed, no pause)
```
The **line** is persistent; the front two are always "live". The human plays whichever
slot they occupy; everyone else runs the same controller as AI.

## ⚠️ Open design decision (needs the user's call)

The brief asks for BOTH "much more faithful to real Knockout" AND "multiple balls
simultaneously in play". **These conflict:** real Knockout has **exactly two balls**
(the front two), handed off on a make. Options:

- **A — Faithful (recommended):** exactly two live balls, seamless hand-off, fully
  continuous (no resets/holds). Most true to the sources; cleanest simulation.
- **B — Arcade multi-ball:** a rolling window of 3–4 active shooters/balls at once for
  a busier court. More spectacle, but a deliberate deviation from the real rules.

The plan in `CONTINUOUS_SIM_PLAN.md` is written for **A** (faithful-continuous) and notes
where **B** would branch. Confirm A or B before the refactor begins.
