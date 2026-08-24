# Building NAKAVT as an Agent Studio

> How to stand up a browser game like **NAKAVT** as if it were built by a small
> studio — except every "developer" is an AI **agent** with a focused role, a set
> of **skills**, and a clear slice of the codebase. **Architecture first, then
> optimize.**

This playbook does three things:

1. Defines the **team of agents** (roles + skills + what they own).
2. Lays out the **phase plan** the team follows (architecture → content → QA →
   optimize → ship).
3. Shows how to **set up a game app** from this repo — from a static web build to
   installable Android/iOS apps.

Ready-to-use agent definitions live next to this file in
[`.claude/agents/`](../.claude/agents) — drop them into a project's
`.claude/agents/` folder to use them as Claude Code subagents.

---

## 1. Philosophy: agents as specialists

A game is a system of systems — a render loop, physics, rules, AI, art, audio,
UI, tooling. Trying to hold all of it in one head (or one prompt) produces
tangled code. Instead we split the work the way a studio does:

- **One agent, one concern.** Each agent owns a small, well-bounded part of the
  codebase and a short list of skills. It does that part well and hands off.
- **Contracts over conversations.** Agents integrate through **module contracts**
  (function signatures, data shapes, events), not by reading each other's guts.
  The pure rules engine never imports the DOM; the renderer never mutates rules.
- **Architecture is a phase, not an afterthought.** The Architect goes first and
  freezes the boundaries. Everyone else fills them in. **Optimization comes last**,
  against a working, measured baseline — never speculatively.
- **Definition of Done is testable.** "Done" means: it compiles, its tests pass,
  and it honored its contract. QA and the headless end-to-end run are the gate.

---

## 2. The roster

| Agent | Role | Owns (in this repo) | Core skills |
|---|---|---|---|
| `producer` | Tech Lead / Orchestrator | phase plan, hand-offs, DoD | planning, decomposition, review |
| `architect` | Game Architect | `src/config.js`, module boundaries, `STATE` machine | system-design, state-machines, api-contracts |
| `engine` | Engine / Systems | `src/main.js` loop, canvas/DPR, `render/arena.js` pipeline | canvas2d, game-loop, raf-timing |
| `gameplay` | Gameplay Programmer | `src/scene.js`, `core/shot.js`, `core/knockout.js` | game-feel, mechanics, physics-lite |
| `ai` | AI / Balance | `KnockoutMatch.simulateAiDuel`, difficulty | ai-behavior, difficulty-curves, fairness |
| `artist` | Technical Artist | `render/characters.js`, `render/arena.js` art | procedural-art, palettes, animation |
| `uiux` | UI / UX Designer | `src/ui.js`, `styles.css`, `index.html`, controls | mobile-ux, responsive, accessibility |
| `audio` | Audio Engineer | `src/audio/sfx.js` | web-audio, sound-design |
| `perf` | Performance Engineer | offscreen caching, memory, 60 FPS | profiling, render-batching, memory |
| `qa` | QA / Test Engineer | `test/*.test.mjs`, `test/browser.mjs` | test-automation, playwright, ci |
| `devops` | Build & Release | packaging, PWA, Capacitor, stores | pwa, capacitor, ci-cd, store-release |

Each agent's full spec (mission, skills, tools, definition of done) is a file in
[`.claude/agents/`](../.claude/agents). A condensed view:

### `architect` — set the bones
- **Mission:** Decide the module map and freeze the contracts so everyone can work
  in parallel without stepping on each other.
- **Skills:** `system-design`, `state-machines`, `api-contracts`, `data-modeling`.
- **Delivers:** the folder layout (`core/` pure · `render/` visuals · `scene`
  gameplay · `ui` DOM), the `STATE`/`SHOT`/`EVENTS` enums, the seedable RNG, the
  analytics abstraction, and a one-paragraph contract per module.
- **DoD:** skeleton imports cleanly; `core/` has zero DOM references; contracts documented.

### `engine` — make it move at 60 FPS
- **Skills:** `canvas2d`, `game-loop`, `raf-timing`, `dpr-scaling`.
- **Delivers:** the `requestAnimationFrame` loop with a clamped `dt`, DPR-aware
  canvas sizing, a resilient loop (one bad frame never stops rendering), input plumbing.
- **DoD:** stable frame loop; resize/orientation handled; no per-frame exceptions.

### `gameplay` — the fun
- **Skills:** `game-feel`, `mechanics`, `physics-lite`, `tuning`.
- **Delivers:** the aim-and-power shot (`core/shot.js`), free movement + loose-ball
  physics and rebound-and-finish (`scene.js`), and the Knockout rules engine
  (`core/knockout.js`) — kept **pure and unit-tested**.
- **DoD:** a full match always terminates with exactly one champion; shot model unit-tested.

### `ai` — worthy, fair opponents
- **Skills:** `ai-behavior`, `difficulty-curves`, `fairness`, `telemetry`.
- **Delivers:** stat-driven opponent cadence, per-round difficulty ramp, and the
  invariant that **the player's controls are identical to everyone's** — difficulty
  only tunes the AI.
- **DoD:** no unfair RNG; EASY/NORMAL/HARD feel distinct; opponents never stall a duel.

### `artist` — original, readable, on-brand
- **Skills:** `procedural-art`, `palettes`, `animation`, `sprite-shading`.
- **Delivers:** procedural, pseudo-3D characters (original, NBA-*style* but with
  fictional teams/names/jerseys) and two distinct arenas — **no real logos, players,
  or venues**.
- **DoD:** every character reads clearly at HUD scale in light and dark backdrops.

### `uiux` — thumb-first
- **Skills:** `mobile-ux`, `responsive`, `accessibility`, `onboarding`.
- **Delivers:** menus, HUD, on-screen joystick + shoot control, keyboard controls,
  a five-second tutorial, safe-area handling, portrait-first responsive layout.
- **DoD:** playable one-handed on a phone; no horizontal scroll; controls discoverable in 5 s.

### `audio` — arcade juice, zero files
- **Skills:** `web-audio`, `sound-design`.
- **Delivers:** fully **procedural** SFX + crowd bed via the Web Audio API (no audio
  assets, no copyright), with global mute/volume.
- **DoD:** audio starts only after a user gesture (mobile policy); mute persists.

### `perf` — the last mile
- **Skills:** `profiling`, `render-batching`, `memory`, `offscreen-canvas`.
- **Delivers:** the offscreen **backdrop cache** (bake the static wall/crowd/court
  once, blit each frame), DPR cap, allocation cuts.
- **DoD:** steady 60 FPS on a mid-range phone; no per-frame gradient/DOM churn; no leaks.

### `qa` — the gate
- **Skills:** `test-automation`, `playwright`, `ci`.
- **Delivers:** Node unit tests for the pure core (rules + shot model, incl. a
  200-seed full-match simulation) and a **headless end-to-end** playthrough that
  drives real controls to a champion and asserts zero console errors.
- **DoD:** `npm test` green; end-to-end passes; screenshots reviewed.

### `devops` — ship it
- **Skills:** `pwa`, `capacitor`, `ci-cd`, `store-release`.
- **Delivers:** static hosting (GitHub Pages), a PWA manifest + service worker,
  and Capacitor wrappers for Android/iOS. See [§4](#4-packaging-the-game-as-an-app).

---

## 3. The phase plan (architecture first, optimize last)

```
Phase 0  ARCHITECTURE        architect            → module map + contracts frozen
Phase 1  ENGINE              engine               → 60 FPS loop, canvas, input
Phase 2  MECHANICS           gameplay             → shot, movement, physics
Phase 3  RULES + AI          gameplay, ai         → knockout engine, opponents
Phase 4  CONTENT             artist               → characters, arenas
Phase 5  UI / UX             uiux                 → menus, HUD, controls, tutorial
Phase 6  AUDIO               audio                → procedural SFX + music bed
Phase 7  QA                  qa                   → unit + e2e, regressions
Phase 8  OPTIMIZE            perf                 → profile, cache, 60 FPS floor
Phase 9  PACKAGE + SHIP      devops               → PWA, Capacitor, stores
```

**Gate between every phase:** it compiles, its slice is tested, and it honored the
contract. Nothing moves to the next phase on a red build.

**Why optimize in Phase 8, not earlier:** premature optimization hides bugs and
freezes the wrong design. You optimize against a *working, profiled* baseline —
e.g. NAKAVT's biggest win was caching the static arena/court backdrop to an
offscreen canvas *after* the art and gameplay were final, not before.

### Collaboration rules
- **Contracts are law.** Change a shared signature → update the contract doc and
  ping every downstream agent.
- **`core/` stays pure.** No DOM, no timers, no globals — so it stays testable and
  portable to an app wrapper.
- **One branch per agent per feature**, small PRs, green CI before merge.
- **The producer owns the phase gate** and resolves cross-agent conflicts.

### How to run this with Claude Code subagents
1. Copy the files from [`.claude/agents/`](../.claude/agents) into your project's
   `.claude/agents/` directory.
2. The Tech Lead (`producer`) decomposes the milestone and dispatches each phase's
   task to the owning agent.
3. Each agent works its slice, runs its tests, and reports done; `qa` runs the gate.

---

## 4. Packaging the game as an app

NAKAVT is a **static, dependency-free web app** (ES modules + Canvas + Web Audio),
so it deploys and packages with almost no build step.

### 4a. Web (today)
Serve the folder over HTTP (ES modules need `http://`, not `file://`):
```bash
python3 -m http.server 8000      # → http://localhost:8000/nakavt/
```
Production hosting is just static files (GitHub Pages already serves it).

### 4b. Installable PWA (add-to-home-screen, offline)
1. Add a `manifest.webmanifest` (name, icons, `display: "standalone"`,
   `orientation: "portrait"`, theme colors).
2. Add a small **service worker** that caches the app shell (`index.html`,
   `styles.css`, `src/**`) for offline play; bump a cache version on release.
3. Link the manifest and register the SW from `index.html`.

Result: "Add to Home Screen" on Android/iOS, launches full-screen, works offline.

### 4c. Native Android / iOS via Capacitor
[Capacitor](https://capacitorjs.com) wraps the web build in a native shell —
ideal for store distribution while reusing 100% of the game code.

```bash
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init NAKAVT com.yourname.nakavt --web-dir .
npx cap add android      # requires Android Studio + JDK
npx cap add ios          # requires Xcode (macOS)
npx cap copy
npx cap open android     # build & run / archive for Play Store
npx cap open ios         # build & run / archive for App Store
```
- Lock orientation to portrait in the native config.
- Add app icons/splash (`@capacitor/assets`).
- Android → signed AAB for Google Play; iOS → archive for App Store Connect.

> **Store/asset note:** ship only original art and fictional teams/players — no
> real NBA logos, player likenesses, or team names — to stay clear of trademark
> and publicity-rights issues.

### 4d. CI/CD (devops)
- On push to `main`: run `npm test` (unit) + the headless e2e, then deploy the
  static site.
- Tag a release → build the PWA cache bump and (optionally) the Capacitor artifacts.

---

## 5. This repo, mapped to the team

| Slice | Files | Owner |
|---|---|---|
| Contracts & data | `src/config.js` | `architect` |
| Pure rules | `src/core/knockout.js`, `src/core/shot.js`, `src/core/rng.js`, `src/core/events.js` | `gameplay`, `ai`, `architect` |
| Loop & pipeline | `src/main.js`, `src/render/arena.js` | `engine`, `perf` |
| Gameplay scene | `src/scene.js` | `gameplay` |
| Art | `src/render/characters.js`, `src/render/arena.js` | `artist` |
| UI/UX | `src/ui.js`, `styles.css`, `index.html` | `uiux` |
| Audio | `src/audio/sfx.js` | `audio` |
| Tests | `test/knockout.test.mjs`, `test/browser.mjs` | `qa` |

**Definition of Done for the whole game:** `npm test` green, headless e2e reaches a
champion with zero console errors, 60 FPS on a mid-range phone, and every asset
original. That's the bar this repo already clears.
