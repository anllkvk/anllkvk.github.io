# OSS Research → Adoption Notes

The `oss-scout` researched proven, widely-used open-source patterns. We **reimplement
the ideas originally** in NAKAVT's vanilla Canvas 2D stack — no code copy-paste, licenses
respected, public-domain math written fresh.

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
