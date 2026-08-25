# NAKAVT Roster & Innovation Studio — Agent Team

> A specialized agent team that **researches real basketball for inspiration** and
> produces **original, NBA-*style* characters, uniforms, and game features** for
> NAKAVT — reviewed, approved, implemented, and QA'd by an orchestrator.

## IP policy (non-negotiable — read first)

Every agent below operates under one hard rule:

> **Inspiration, not reproduction.** Research real players, teams, positions,
> play-styles and visual motifs to inform ORIGINAL work. **Never** ship a real
> NBA player name, face/likeness, team name, or team logo; never copy a real
> uniform 1:1. Real names/logos/likenesses are trademarked and protected by the
> right of publicity — using them in a published game is infringement.

What agents **may** use from research: positions (PG/SG/SF/PF/C), archetypes
(sharpshooter, rim-runner, point-forward, 3-and-D wing, stretch big), silhouettes
(build, hair motifs), jersey *formats* and color *families* in the abstract, and
game-design ideas (mechanics, feedback, UI). What they output: **fictional
franchises + original names + original uniforms**, e.g. "M. King · Coast Kings #6".

The `roster-reviewer` and `orchestrator` **reject** any output that names a real
player/team or reproduces a real logo/uniform. This is a release gate.

---

## Departments, agents & skills

| Department | Agent(s) | Mission | Skills (in `.claude/skills/`) |
|---|---|---|---|
| **Scouting & Identity** | `roster-scout` | Research real archetypes/positions/play-styles → propose ORIGINAL characters | `player-archetype-research` |
| | `roster-reviewer` | Review proposals, enforce originality/IP gate, approve or amend | `originality-review` |
| **Art & Uniforms** | `jersey-designer` | Design original NBA-format uniforms & character canvas art for fictional teams | `jersey-design`, `character-canvas-art` |
| **Research & Innovation** | `mechanics-researcher` | Study basketball games' graphics + mechanics; curate implementable ideas | `bball-game-research` |
| **Engineering** | `feature-implementer` | Implement approved ideas without breaking gameplay/tests | `feature-implementation`, `visual-qa` |
| **Production (lead)** | `roster-orchestrator` | Control everything: assign, gate, find & fix errors, run tests, ship | `orchestration-gate` |

Agent definition files live in [`.claude/agents/`](../.claude/agents); skill
definitions in [`.claude/skills/`](../.claude/skills). Copy either tree into a
project's `.claude/` to use them as Claude Code subagents/skills.

---

## The pipeline (how a new roster or feature ships)

```
              ┌──────────────────────── roster-orchestrator (lead) ────────────────────────┐
              │  assigns work · enforces the IP + test gate · finds & fixes bugs · ships     │
              └───────────────┬───────────────────────────────┬──────────────────────────────┘
                              │                               │
   CHARACTERS / IDENTITY      ▼                               ▼     FEATURES / INNOVATION
   roster-scout ──proposes──▶ roster-reviewer ──approves──▶ jersey-designer ──art──▶ config/render
        │  (archetype research)     │ (originality/IP gate)        │ (original uniforms)
        └────────── amend on reject ◀┘                             ▼
                                                          feature-implementer ──▶ code + tests
   mechanics-researcher ──curated ideas──▶ roster-orchestrator ──approves──▶ feature-implementer
```

**Definition of Done (gate the orchestrator enforces on every change):**
1. **IP-safe** — no real names/logos/likenesses/1:1 uniforms (reviewer signs off).
2. **Tests green** — `npm test` (unit) + `node test/browser.mjs` (headless e2e).
3. **No gameplay drift** — knockout rules, movement, shot mechanic, AI, state
   machine unchanged; existing tests still pass.
4. **Readable on mobile** — every character distinguishable at HUD scale in 1s.
5. **Docs updated** — roster/notes reflect what changed.

## Where the work lands in this repo
- Characters & identities → `src/config.js` (`CHARACTERS`), art in `src/render/characters.js`.
- Uniform/team palettes → character `jersey`/`jerseyTrim`/`shorts`/`team` fields.
- New mechanics/feel → `src/scene.js`, `src/render/*` (never `src/core/*` rules).
- Every change verified by `test/knockout.test.mjs`, `test/vfx.test.mjs`, `test/browser.mjs`.

## Running the team
The `roster-orchestrator` decomposes a request ("expand to 16 original players",
"add a dunk animation from arcade-hoops research"), dispatches to the owning
agent, collects output, runs the reviewer + tests, fixes anything red, and only
then ships. It never approves output that violates the IP policy.
