---
name: feature-implementation
description: Implement approved roster/art/feature changes into NAKAVT additively, keeping core rules and existing tests intact. Use to build approved work. Lands changes in config/render/scene, never in core rules.
---
# Feature Implementation (Dept: Engineering)

## Rules
- **Additive only.** Never edit `src/core/*` (knockout, shot math, rng). Never change the
  gameplay contract: knockout rules, movement, shot mechanic, AI logic, state machine.
- Roster/uniforms → `src/config.js`; art → `src/render/characters.js`; feel/VFX →
  `src/scene.js`, `src/render/*`.
- Reuse existing infra: `SpriteCache`, arena/vignette offscreen caches, `Particles` pool,
  `Camera`. Keep 60 FPS; no per-frame allocations where a cache exists.

## Verify before shipping
- `node --check` on every changed file.
- `cd nakavt && npm test` (unit) — all green (13 core + VFX tests).
- `node test/browser.mjs` (headless e2e) — champion reached, zero console errors.
- Screenshots for visual QA. Report results to the orchestrator.
