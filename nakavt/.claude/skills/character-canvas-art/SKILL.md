---
name: character-canvas-art
description: Tune NAKAVT's procedural pseudo-3D character renderer (heads, bodies, hair, beards, sleeves, jerseys) for clarity, variety and 60 FPS. Use when a character motif needs new drawing or the look needs polish. Pure canvas, no image assets.
---
# Character Canvas Art (Dept: Art & Uniforms)

## Guidance
- Edit `src/render/characters.js` only for new motifs (e.g. a hairstyle) — keep the
  signature `drawCharacter(ctx, char, x, y, scale, pose, phase, opts)` stable.
- Preserve pseudo-3D shading (sphere heads, shaded capsule limbs, contact shadow) and
  the animation opts (squash `sx/sy`, jump `lift`, `glow`, poses).
- Big head / readable silhouette; distinct at HUD scale; test in light + dark.
- Performance: no new per-frame gradient churn; idle/waiting players go through the
  `SpriteCache` (offscreen bake → blit).

## Verify
Screenshot the character-select grid and in-game; confirm variety and no clipping.
