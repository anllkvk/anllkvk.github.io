# NAKAVT — Basketball Knockout

A fast, addictive arcade take on the real-life basketball **Knockout / Elimination**
game. Ten players line up at the free-throw line; the front two each have a ball.
Miss your shot and the player behind you can knock you out by sinking theirs first.
Tap to shoot, time the meter, race for the rebound — be the last one standing.

Play it at **`/nakavt/`** on the site. Fully playable, mobile-first, 60 FPS target.

## How to play

- **Move** your baller freely (HaxBall-style): left-side virtual joystick on
  touch, or **WASD / arrow keys** on desktop.
- **Shoot**: hold **SHOOT** (right side) or **Space** to charge. An aim **arrow**
  arcs to the hoop and a **power bar** appears — release in the **yellow** band
  for a Perfect, the green for Good. Ideal power depends on your distance, so
  getting closer makes the shot easier.
- **Miss?** The ball comes loose on the floor — **run to it, grab it, and finish**.
- **FRONT** role: sink one before the chaser, or you're knocked out.
- **CHASER** role: sink one before the player in front — knock them out.
- Chain Perfect shots for **🔥 HOT** and **🔥 ON FIRE** streaks.
- Survive to the **FINAL DUEL** and win to become **NAKAVT CHAMPION**.

## Tech stack

- **Vanilla ES modules** (no build step, no framework) — deploys as-is on GitHub Pages.
- **Canvas 2D** for all gameplay rendering at a DPR-capped 60 FPS.
- **Web Audio API** for 100% procedural sound (no audio files, no copyright).
- **HTML/CSS** for crisp, accessible, responsive menus.
- All art is **procedural** (canvas shapes) — original characters & arenas, no
  real teams, logos, players or venues.

## Architecture

Pure game logic is separated from rendering and UI so the rules are unit-testable
in Node and the codebase can later be wrapped for Android/iOS (e.g. Capacitor).

```
nakavt/
├── index.html            # shell: canvas + HUD + UI mount
├── styles.css            # mobile-first, portrait, safe-area aware
├── src/
│   ├── config.js         # all constants & data (characters, arenas, difficulty)
│   ├── core/             # PURE, DOM-free, testable
│   │   ├── rng.js        # seedable RNG (controlled randomness)
│   │   ├── events.js     # analytics abstraction (swappable sink)
│   │   ├── shot.js       # aim-and-power shot model & make probability
│   │   └── knockout.js   # the Knockout rules engine (queue state machine)
│   ├── audio/sfx.js      # procedural Web Audio SFX + crowd bed
│   ├── render/           # procedural canvas art
│   │   ├── characters.js # arcade character sprites (poses/animation)
│   │   └── arena.js      # arena backdrop, court, hoop, ball
│   ├── scene.js          # real-time gameplay: duels, meter, rebounds, FSM
│   ├── ui.js             # DOM screens (menu, selects, victory, settings)
│   └── main.js           # bootstrap: canvas, loop, input, state wiring
└── test/
    ├── knockout.test.mjs # unit tests (rules, shot model) — `node --test`
    └── browser.mjs       # headless end-to-end playthrough (Playwright)
```

### Game states

`MENU → CHARACTER_SELECT → ARENA_SELECT → COUNTDOWN → PLAYING ↔ FINAL_DUEL →
VICTORY | GAME_OVER`

### The Knockout rules (core/knockout.js)

Queue `[front, chaser, next1, …]`; the first of the front two to sink a basket wins:

- **Front makes first** → front is safe, cycles to the back. Nobody out.
- **Chaser makes first** → front is **eliminated**; chaser is safe, cycles to the back.

Repeats until one champion remains; a queue of two is the **Final Duel**. AI-vs-AI
pairings (when you're waiting your turn) are simulated fast so the bracket visibly
thins out; whenever you're one of the front two you play the duel live.

## Running & testing

It's a static site — no install needed. Serve the folder over HTTP (ES modules
need `http://`, not `file://`):

```bash
# from the repo root
python3 -m http.server 8000
# then open http://localhost:8000/nakavt/
```

Tests:

```bash
cd nakavt
npm test                 # unit tests (rules + shot model)
node test/browser.mjs    # headless end-to-end playthrough (needs Playwright + Chromium)
```

## Fairness & difficulty

The aim-and-power control is identical for everyone — difficulty only tunes the
AI (accuracy/speed) and a per-round ramp as the field thins. Character stats
(accuracy, reaction, speed, rebound, clutch) are traded off so no pick dominates;
they only nudge outcomes. No pay-to-win, no unfair RNG.

## Roadmap hooks (already scaffolded)

Character/arena unlocks, skins, achievements, leaderboard, daily challenge and an
`INSANE` difficulty are all anticipated by the config/analytics/state structure.
Analytics events (`game_start`, `shot_attempt`, `perfect_shot`, `player_eliminated`,
`final_duel`, `victory`, …) are emitted through a swappable sink.
