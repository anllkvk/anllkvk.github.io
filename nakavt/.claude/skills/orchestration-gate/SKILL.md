---
name: orchestration-gate
description: The release gate the orchestrator runs on every roster/feature change — IP-safety, test-green, no-gameplay-drift, mobile-readability, docs-updated. Use to control quality, find and fix errors, and decide ship / send-back.
---
# Orchestration Gate (Dept: Production)

Run this before shipping ANY change. All must pass or send it back.

## Gate
1. **IP-safe** — `originality-review` signed off: no real names/likenesses/teams/logos,
   no 1:1 real uniforms.
2. **Tests green** — `cd nakavt && npm test` AND `node test/browser.mjs` both pass.
3. **No gameplay drift** — knockout rules, movement, shot mechanic, AI, state machine
   unchanged; the 13 core tests still pass; `src/core/*` untouched.
4. **Mobile-readable** — every character distinct at HUD scale in 1s; no text overflow
   (via `visual-qa`).
5. **Docs updated** — `docs/ROSTER_STUDIO.md` / README reflect the change.

## On failure
Diagnose, fix in place (or dispatch back to the owning agent), re-run the gate. Only
ship a fully green gate. Record what changed and the test results.
