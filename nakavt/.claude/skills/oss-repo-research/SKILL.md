---
name: oss-repo-research
description: Research the best GitHub repositories and articles for a technique (game feel, easing, particles, PWA, canvas performance), extract the reusable idea/algorithm, and reimplement it originally in NAKAVT — license-respecting, no code copy-paste. Use before building a researched feature.
---
# OSS Repo Research (Dept: Research & Innovation)

## Steps
1. Search for reputable, maintained, well-starred repos + canonical articles on the topic.
2. Read the approach; capture the IDEA and the underlying math/algorithm (not the code).
3. Check the license; note it. Reimplement the idea ORIGINALLY in vanilla Canvas 2D.
   Public-domain math (e.g. Penner easing equations) may be written from scratch.
4. Write a research note: source, license, the pattern, why it fits NAKAVT, and how to
   implement WITHOUT touching core rules / gameplay feel.
5. Hand to the orchestrator for approval, then implement + test (unit + e2e + screenshots).

## Guardrails
- No code copy-paste from incompatible licenses. Attribute patterns.
- No new engine (PixiJS/Phaser/Rive) without proof Canvas 2D can't do it + user approval.
