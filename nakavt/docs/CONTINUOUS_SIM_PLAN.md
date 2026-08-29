# NAKAVT — Continuous Simulation + AI + Visual Upgrade — PLAN

## ✅ Implementation status (kept current)

Delivered via an **evolutionary** route rather than a greenfield `sim/` rewrite — the
plan's own risk section warned that rewriting `scene.js`'s playback wholesale could
regress feel/tests, so the shared behaviours were landed **in place, behind the same
callbacks**, keeping `core/knockout.js` and all tests green.

| Phase | Status | Notes |
|---|---|---|
| P4 steering + IK | ✅ shipped | `core/steering.js` + `test/steering.test.mjs` (Arrive/Seek/Pursue/predictSettle + 2-bone IK) |
| P7 AI rebound-chase | ✅ shipped | Unified `_aiStep` in `scene.js`: miss → real loose ball → run to predicted rebound (steering) → grab → finish w/ layup bonus. One code path for the live opponent AND watched rivals. |
| P8 continuity | ✅ shipped (lite) | Trimmed inter-pairing beats (intro/resultHold). Watched duels already animate fully via P7, so the "only moves on my turn" complaint is resolved without the full `sim/` split. |
| P9 articulated animation | ✅ shipped | `render/characters.js` now poses IK 2-bone arms/legs (run cycle, jump shot, celebrate, knockout); back arm behind jersey, front arm on top. |
| P12 invariants | ✅ shipped (partial) | Match simulation raised to **1000 seeds** with per-step continuous-flow invariants. Continuous-play E2E still uses `test/browser.mjs`. |
| P5/P6 shared Character + BallManager | ⬜ not split out | The behaviours exist inside `scene.js` (human already physical; AI now physical; two balls already concurrent in a duel). A formal `sim/` extraction was **intentionally deferred** as pure refactor with no player-visible gain and real regression risk. |
| P10 camera follow | ⬜ deferred | Fixed-court portrait framing keeps the whole court visible; the arena backdrop is baked to the viewport, so a pan/follow camera would reveal unpainted edges. Punch/shake/zoom kept. |
| P11 fixed-timestep | ⬜ open | Current rAF loop holds 60 FPS with adaptive quality; a formal accumulator is a follow-up. |
| P13 review/docs | 🔄 ongoing | `docs/OSS_ADOPTIONS.md` added; this status block; `/code-review` pass pending. |

Live at `https://anllkvk.github.io/nakavt/` (deployed from `main`).

---


> Deliverable for the "deep gameplay + AI + visual" mission. **No large code change
> starts until this plan is approved.** Written for the **faithful 2-ball continuous**
> interpretation (Option A in `KNOCKOUT_RULES_RESEARCH.md`); branch points for the
> arcade multi-ball (Option B) are noted.

## Guiding constraints (unchanged)
- Vanilla JS · ES Modules · Canvas 2D · Web Audio · no build, no framework, no new deps.
- `core/` stays pure and DOM-free. **The rules engine `core/knockout.js` is reused as-is**
  (all 31 tests keep passing) — only the scene's *presentation* becomes continuous.
- No real NBA names/logos/likenesses. PWA/offline/service-worker stay working.

## Key insight (de-risks the whole refactor)
The current `KnockoutMatch` already resolves outcomes correctly (front/chaser, elimination,
rotation, champion — 200-seed proven). Today `scene.js` plays each pairing as a **discrete
duel** with `intro → live → resolve/ko` phases (the "pauses" the user dislikes). We **keep
`KnockoutMatch` and its `resolve(winner)` API** and replace only the *playback*: a persistent
**line simulation** that calls `resolve('front')` the instant the front player sinks it, or
`resolve('chaser')` the instant the chaser sinks it first — driven by live ball events, not
timers. Same rules, continuous feel, tests intact.

---

## Target architecture (new `sim/` layer; `core/` + `render/` mostly reused)

```
                          LineSimulation                (continuous; owns the flow)
                          ├─ uses core/knockout.js      (rotation + elimination rules)
                          ├─ BallManager                (≤2 balls: physics + hand-off)
                          └─ Slot[]  → each has a Character
Character (shared)        ── position, vel, state machine (QUEUED→INITIAL_FREE_THROW→
   ▲            ▲            BALL_IN_FLIGHT→LIVE_CHASE→REBOUND→SECONDARY_SHOT→SAFE/OUT)
   │            │
PlayerController   AIController
 (human input)   (perception → decision → same Character API)
                          │
                 core/steering.js  (Arrive / Pursuit — new, pure, tested)
                 core/shot.js      (existing make-probability, reused)
```

### New files
- `src/core/steering.js` — pure Arrive/Pursuit vector math (Reynolds) + tiny 2-bone IK
  helper (or a separate `core/ik.js`). Unit-tested.
- `src/sim/character.js` — the **shared** character state machine + movement (used by both
  human and AI). No DOM.
- `src/sim/ai.js` — perception + decision policy (WAIT / MOVE_TO_BALL / CHASE_REBOUND /
  SHOOT / MOVE_TO_RIM / RESET), stat-driven, ticking at ~12 Hz.
- `src/sim/ball.js` — `BallManager`: 1–2 balls with trajectory, gravity, rim/backboard
  bounce, rolling, pickup; hand-off on a make. Pure-ish (math in core-style, drawing in render).
- `src/sim/line.js` — `LineSimulation` orchestrating slots, the front-two "live" pair,
  hand-off, and calling `KnockoutMatch.resolve()` on live scoring events.

### Reused / changed
- `core/knockout.js` — **unchanged** (rules).
- `scene.js` — slimmed to a *view/controller*: owns camera, particles, HUD glue, and drives
  `LineSimulation.update()/render()`. The `intro/resolve/ko` phase gates are removed in favor
  of continuous transitions (short, non-blocking cosmetic beats only, e.g. a 0.4s KO pop that
  does **not** pause the sim).
- `render/characters.js` — upgraded to **articulated** limbs (shoulder/elbow/wrist, hip/knee)
  driven by joint angles + 2-bone IK for the shooting arm and the jump/land legs.
- `render/arena.js` — court already got 3D depth; add optional reflections/haze/color-grade.
- `render/camera.js` — add smooth **follow** (Arrive-damped) of the human/active ball,
  keeping existing punch/shake/zoom.

### Update-rate decoupling (performance)
- **Physics + character step:** fixed 60 Hz accumulator (deterministic, stable rebounds).
- **AI decision:** 10–20 Hz (re-plan target/decision), movement interpolated every frame.
- **Render:** `requestAnimationFrame` with interpolation between physics steps.
- Reuse existing infra: `SpriteCache`, offscreen arena/vignette caches, `Particles` pool,
  integer-snapped blits, DPR cap, adaptive quality.

---

## Continuous flow (what actually happens, no resets)

1. Match start: 10 slots; slots 0 and 1 are **live**, each handed a ball at the FT line.
2. Front (slot 0) shoots from the line (locked position until release). On **release**, the
   chaser (slot 1) is cleared to shoot from the line.
3. **Miss** → that character unlocks and enters `LIVE_CHASE`: AI uses **Pursuit** to the
   predicted rebound (`ball landing = trajectory solve`), grabs it, `SECONDARY_SHOT` from
   wherever it is; human does this by hand.
4. **Front sinks first** → `resolve('front')`: front jogs to the **back** (no reset), keeps
   no ball; its ball is **handed to the next queued player** who steps up as the new chaser;
   old chaser becomes the new front. Flow never stops.
5. **Chaser sinks first** → `resolve('chaser')`: front is **eliminated** (removed, a <0.5s KO
   pop plays but the sim keeps running); chaser jogs to back safe; next two step up.
6. Repeat until one remains → **FINAL DUEL** (camera framing only) → **CHAMPION**.

**Option B branch:** allow slots 0–3 live with up to 3–4 balls (BallManager cap raised);
`LineSimulation` resolves the front pair but keeps the next pair "warming up". Deviates from
real rules; only if the user picks B.

---

## Phased implementation (each phase: implement → `npm test` → `node test/browser.mjs` → commit)

| Phase | Work | Gate |
|---|---|---|
| P4 | `core/steering.js` (Arrive/Pursuit) + `core/ik.js` (2-bone) + unit tests | pure tests green |
| P5 | `sim/character.js` shared state machine; port the human onto it (behavior identical) | e2e green, feel unchanged |
| P6 | `sim/ball.js` BallManager (trajectory, rim/backboard bounce, roll, pickup, hand-off) | ball tests + e2e |
| P7 | `sim/ai.js` — AI uses Character + steering to really chase rebounds & take secondary shots | AI sim tests |
| P8 | `sim/line.js` — continuous line; remove duel phase gates; wire `KnockoutMatch.resolve()` to live events | continuity tests + e2e |
| P9 | `render/characters.js` articulated animation (shoot load→extend→release→follow-through→land; run cycle) | visual QA |
| P10 | camera follow + broadcast framing; keep punch/shake/zoom | visual QA |
| P11 | perf pass: fixed-timestep, AI 12 Hz, pooling, cache; profile 60/45 FPS | FPS check |
| P12 | expand tests (rules/AI/1000-seed invariants) + Playwright continuous-play E2E | all green |
| P13 | `/code-review` + fix; visual QA screenshots; docs update | ship |

## New tests to add (Phase 12)
- **Rules:** first shot at FT line; can't move pre-release; move unlocks post-attempt; rebound
  → secondary shot → score; behind-scores-first ⇒ front out; scorer stays; next enters with no
  reset; no pause between eliminations; final-two → champion.
- **AI:** shoots, misses, moves toward rebound (steering), collects it, secondary shot, can
  eliminate and be eliminated; AI + human use the same physics/shot code.
- **Simulation invariants (≥1000 seeds):** never two champions, never zero alive, no ball
  without an owner forever, no character stuck in a state, never paused indefinitely, no active
  player without a ball where the rules require one, no duplicated ball, eliminated player never
  scores. (Runs headless on the pure `sim` layer with a stubbed clock.)

## Risks & mitigations
- **Biggest risk:** rewriting `scene.js`'s duel playback could regress feel or tests.
  *Mitigation:* keep `core/knockout.js` untouched; land the sim behind the same callbacks;
  port the human first (P5) so feel is verified before AI/continuity change.
- **Waiting time:** continuous flow still cycles the human to the back. *Mitigation:* brisk
  hand-offs + camera keeps the action legible; if too long, add a subtle "you're up next" cue.
- **Perf with 10 movers + physics + particles:** decouple AI to 12 Hz; fixed-timestep; reuse pools/caches.

## Estimated size
Large (P4–P13). Multi-session. Tests + e2e gate every phase; nothing ships red.

---

## ✅ Approval needed before starting P4
1. **Option A (faithful 2-ball continuous, recommended) or B (arcade multi-ball)?**
2. OK to **reuse `core/knockout.js` as the rules engine** and rewrite only the scene's
   playback into the continuous `sim/` layer (keeps all 31 tests green)?
3. Proceed phase-by-phase (implement → test → commit) as above?
