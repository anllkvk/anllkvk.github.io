# OSS Research → Adoption Notes

The `oss-scout` researched proven, widely-used open-source patterns. We **reimplement
the ideas originally** in NAKAVT's vanilla Canvas 2D stack — no code copy-paste, licenses
respected, public-domain math written fresh.

---

> **See also:** `docs/CHARACTER_ANIMATION_R&D.md` — a deep dive on the NBA Live 08 movement
> reference and four animation repos (Creature WebGL, Hyper-Motion Controller, Cani2D,
> ik-proc-anim-2d) with license classification and a recommended Canvas-2D rig architecture.

## GitHub repository evaluation (AI movement + procedural animation)

For the continuous-simulation upgrade the AI must **move and chase rebounds** and players
need **procedural limb animation**. Repos evaluated (⚠️ exact stars/licenses could not be
auto-fetched — this environment blocks egress to github.com pages; verify before any
direct code reuse):

| Repo | Focus | License (verify) | Relevant part | Quality | Recommendation |
|---|---|---|---|---|---|
| `libgdx/gdx-ai` | Steering behaviors (Java) | Apache-2.0 | Seek/Arrive/Pursuit **algorithm** + docs | High, canonical | **REFERENCE ONLY** (Java) — reimplement the math |
| `hurik/impact-steering-behaviors` | Steering (Impact JS) | verify | Seek/Arrive/Pursuit in JS | Medium | REFERENCE ONLY — algorithm confirmation |
| `erosmarcon/three-steer` | Steering (THREE.js) | MIT (verify) | Steering API shape | Medium | REFERENCE ONLY (THREE-based) |
| `wangchen/Programming-Game-AI-by-Example-src` | Buckland book code (C++) | restrictive/book | Steering + soccer AI | High (educational) | REFERENCE ONLY — do not copy |
| `theAlgorithmist/Angular9-Kinematics` | 2D bone rigging → canvas (TS) | Apache-2.0 (verify) | Limb bone chains / FK+IK | High | REFERENCE / adaptable idea only |
| `OnlyShoky/Procedural-Animation` | FABRIK IK | verify | FABRIK joint solve | Medium | REFERENCE ONLY — reimplement FABRIK/2-bone |
| `cristhiandrm/2D-Procedural-Hyper-Motion-Controller` | Procedural limbs + squash/stretch (Unity) | verify | Game-feel limb motion | Medium | REFERENCE ONLY (C#/Unity) |
| `dkdan10/nbaJam` | Canvas NBA-Jam game | verify | Canvas hoops feel | Medium | REFERENCE ONLY |

### BEST OSS CANDIDATE
**None adopted as code.** The two things we actually need are **algorithms, not
libraries**, and both are public-domain concepts we can write from scratch:

1. **Craig Reynolds' steering behaviors** (Seek / Arrive / Pursuit, 1999) — the canonical
   basis of every repo above. We implement a tiny original `core/steering.js` (Arrive for
   moving to a target, Pursuit for intercepting a moving rebound). Pure vectors, testable.
2. **2-bone / FABRIK inverse kinematics** — for arm/leg posing (jump shot, layup). We
   implement a small original 2-bone solver for the shooting arm and legs.

**Why reimplement rather than adopt:** the repos are Java/C#/THREE/Impact/Angular — none
drop into vanilla Canvas 2D, and pulling any in would add a dependency and a build step,
which the project explicitly forbids. The underlying math is public-domain, so writing it
fresh is both cleaner and license-safe. If, during implementation, a specific MIT/Apache
snippet is genuinely worth adapting, it will be recorded in `docs/OSS_ADOPTIONS.md` with
source, commit, license, what was adopted vs. rewritten, and attribution.

Classification summary: **SAFE-TO-USE (as reimplemented algorithm):** steering behaviors,
FABRIK/2-bone IK, Penner easing (already done). **REFERENCE-ONLY:** all repos above.
**LICENSE-RISK / NOT-SUITABLE:** direct code copy from any (engine-specific or unverified
license).

---


## Patterns adopted

| Pattern | Source / precedent | How we use it (original impl) |
|---|---|---|
| **Penner easing functions** (2001, public-domain math) | Robert Penner's easing equations, ubiquitous in tween libs (GreenSock, tween.js, `github.com/topics/tweening`) | New `src/core/ease.js` — `easeOutBack`, `easeOutCubic`, `easeInOutQuad`, etc. Applied to camera zoom, floating text pop, countdown, power-marker, UI. |
| **Juice: screenshake + particles + flash** | "Juice it or lose it"; GameAnalytics/Resprawn juice write-ups | Already in `camera.js` / `particles.js`; refined with easing + more emitters (net swish, ground squash). |
| **Object-pooled particles** | Common canvas-perf guidance | `Particles` pool (allocation-free) — extended with new emitters. |
| **Offscreen sprite/backdrop caching** | HTML5 canvas perf best practices | `SpriteCache` + arena/vignette offscreen caches (done). |
| **Adaptive quality** | Mobile game perf guidance (auto-scale effects) | FPS sampler drops particle counts on low-end devices. |
| **Installable PWA (manifest + service worker)** | web.dev PWA guidance; standard app-shell caching | `manifest.webmanifest` + `sw.js` (cache-first app shell) → add-to-home-screen + offline. |

## Guardrails honored
- No new rendering engine (stayed on Canvas 2D per the brief).
- No licensed code pasted; math (easing) written from scratch; patterns attributed here.
- Gameplay untouched: knockout rules, movement, shot mechanic, AI, state machine unchanged;
  all core + VFX tests stay green.

## Sources
- Tweening/easing repos — https://github.com/topics/tweening
- Juice write-ups — https://www.gameanalytics.com/blog/squeezing-more-juice-out-of-your-game-design ,
  https://resprawn.medium.com/when-you-play-a-great-game-it-feels-good-d23761b6eccf
- Open-source games index — https://github.com/michelpereira/awesome-open-source-games
- Canvas basketball references — https://github.com/dkdan10/nbaJam , https://github.com/BonbonLemon/basketball
