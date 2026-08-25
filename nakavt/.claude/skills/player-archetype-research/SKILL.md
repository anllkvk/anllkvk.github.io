---
name: player-archetype-research
description: Research real basketball archetypes, positions and play-styles for INSPIRATION, then design ORIGINAL NAKAVT characters (fictional teams, original names). Use when creating or expanding the roster. Never copies real names, likenesses, teams or logos.
---
# Player Archetype Research (Dept: Scouting & Identity)

Turn real-basketball knowledge into ORIGINAL, IP-safe characters.

## Steps
1. **Research (inspiration only).** Study positions (PG/SG/SF/PF/C) and archetypes:
   sharpshooter, rim-runner, point-forward, 3-and-D wing, stretch big, lockdown
   defender, sixth-man spark, floor general, slasher, energy big. Note their
   tendencies and general visual motifs (build, hair, headband/sleeve habits).
2. **Invent identities.** For each character output: fictional team (e.g. "Coast
   Kings"), original name (e.g. "M. King"), number, archetype.
3. **Balance stats.** accuracy/reaction/speed/rebound/clutch in [0..1], traded off so
   no pick dominates (the meter is identical for everyone).
4. **Fill visual fields** to match `src/config.js` CHARACTERS: skin, hair, hairColor,
   beard, headband(+color), sleeve(+color), jersey, jerseyTrim, shorts, height.
5. **Self-check IP.** No real player name, no real team, no real logo, no 1:1 real
   uniform. Then hand to `originality-review`.

## Output
A CHARACTERS array patch (or table) ready for review — original identities only.
