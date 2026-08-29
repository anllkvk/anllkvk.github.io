# OSS Adoptions — what was actually built into the code

This file records algorithms/patterns that reached NAKAVT's shipping code, per the
`oss-scout` playbook. **No third-party code was copied.** Everything below is an
**original implementation of a public-domain algorithm**, written fresh in vanilla
Canvas 2D / ES modules. Repos listed are *reference/precedent only* — read for the
math, never pasted. Licenses of those references were not relied upon because none of
their code was used.

| # | Algorithm (public domain) | Where it lives | Reference precedent (idea only, NOT copied) | What we wrote ourselves |
|---|---|---|---|---|
| 1 | **Reynolds steering — Arrive / Seek / Pursue** (Craig Reynolds, "Steering Behaviors for Autonomous Characters", 1999) | `src/core/steering.js` (`arrive`, `seek`, `pursue`, `predictSettle`) | `libgdx/gdx-ai` (Apache-2.0, Java), `erosmarcon/three-steer` (THREE.js) — algorithm shape only | 100% original vector math; unit-tested in `test/steering.test.mjs` |
| 2 | **2-bone inverse kinematics** (law-of-cosines / analytic 2-link solver; textbook, public domain) | `src/core/steering.js` (`twoBoneIK`) | FABRIK write-ups, `theAlgorithmist/Angular9-Kinematics` — concept only | Original closed-form solver with reach clamping + bend-side selection; unit-tested |

## How they're used in gameplay
- **Steering (#1):** the unified AI controller (`src/scene.js` `_aiStep`) makes every CPU
  baller physically **run to the predicted rebound** (`predictSettle` → `arrive`) instead of
  waiting on a timer, then finish with a distance-based layup bonus. Same code path for the
  live opponent and the AI-vs-AI rivals you watch.
- **2-bone IK (#2):** `src/render/characters.js` poses **articulated limbs** — shoulder→elbow→
  wrist and hip→knee→ankle — for the run cycle, jump shot (guide + shooting hand), celebrate
  and knockout, replacing the old single-capsule arms/legs.

## Guardrails honored
- No third-party source copied; no new dependency, engine, or build step added.
- All algorithms are public-domain math; reimplemented from the description, unit-tested.
- Rules engine (`core/knockout.js`) untouched; all tests stay green (39 unit + e2e).
- No real NBA names/logos/likenesses introduced.

See `docs/OSS_RESEARCH.md` for the full candidate evaluation and classification table.
