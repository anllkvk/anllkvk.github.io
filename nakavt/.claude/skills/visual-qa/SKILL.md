---
name: visual-qa
description: Headless Playwright visual QA for NAKAVT — capture and review menu, character/arena select, gameplay, perfect shot, knockout, final duel, victory. Use to catch overlap/clipping/overflow/misalignment/scaling issues before shipping.
---
# Visual QA (Dept: Engineering)

## Steps
1. Serve `nakavt/` over HTTP; drive with Playwright + the pre-installed Chromium
   (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, `--no-sandbox`).
2. Capture: main menu, character select, arena select, gameplay, a perfect-shot frame
   (force power→ideal, release), a knockout frame (`scene.duel.phase==='ko'`), final duel
   (`scene.finalDuel`), victory (`.result-title`).
3. Review each for: overlap, clipping, **text overflow**, UI misalignment, character
   scaling, arena problems. Test widths 360/375/390/412/768.
4. File concrete fixes; re-capture after fixing. No console/page errors allowed.

## Hooks
`window.NAKAVT.scene.aimDebug()` gives live shot state for timing captures.
