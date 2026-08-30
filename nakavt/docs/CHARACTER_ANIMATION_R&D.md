# NAKAVT — Character Animation R&D

> **Purpose:** figure out *why* NBA Live 08's players read as real basketball movement,
> distill that into **movement/animation principles**, research the four animation repos
> (+ others), classify their licenses, and recommend an architecture NAKAVT can actually
> build in **vanilla JS + Canvas 2D, no build step, GitHub Pages, PWA/offline**. Research
> first — no engine rewrite starts until a direction is approved. **No NBA Live 08 asset,
> model, texture, face, jersey, logo, player, or sound is copied — only movement principles.**

---

## 0. Reference material and how it was analysed

- The reference is **NBA Live 08** PC gameplay, kept **local only** at
  `nakavt/reference/nba-live-08-animation.mp4` (321 MB, 1280×720, 60 fps, 12:00).
  `reference/` and `*.mp4` are gitignored: the footage is copyrighted (EA) and far too
  large for the repo. **Nothing from it is committed, and no asset from it is used.**
- **A real frame analysis was done** (2026-08-30, local machine, ffmpeg 9.0.1):
  - `ffmpeg -i … -vf "fps=3,scale=480:-1"` → **2161 survey frames** in `reference/frames/`.
  - Contact sheets (`reference/sheets/`) to map the footage, then **native-resolution
    1280×720 bursts at 6–8 fps** over the action windows, cropped and Lanczos-upscaled
    2–4× so a player fills ~700 px instead of ~140 px.
  - **16 representative frames** were selected, cropped and named in
    `reference/selected/` (also local only) — listed in §1.0 below.
- **Limits of this footage, stated honestly:** it is a single continuous broadcast-camera
  game capture. There is **no isolated free throw and no unobstructed catch-and-shoot
  jumper** anywhere in it, and no slow-motion replay. Players are 140–200 px tall at
  native resolution, so **wrist and finger detail is not readable**. What *is* readable —
  and what §1 below is now grounded in — is pelvis/COM, weight transfer, foot plant,
  knee compression, torso lean, shoulder counter-rotation, head stabilisation, arm-swing
  asymmetry and the hand↔ball relationship. The shot evidence is a **putback/gather chain
  and a held follow-through**, not a full gather→release jumper; that one sub-phase stays
  reasoned from animation theory rather than observed, and is flagged as such in §1.3.

---

## 1. Visual Reference Analysis — the central question

> **Why do NBA Live 08 players feel like real basketball players even though the models are
> simple, while NAKAVT's procedural characters feel "drawn"?**

The honest one-sentence answer: **NBA Live 08 is motion-captured animation blended on a
weighted, IK-grounded rig — so every frame obeys real biomechanics and momentum — whereas
NAKAVT drives each body part with independent sine offsets, switches poses instantly, slides
its feet, and glues the ball to a fixed hand point.** The gap is *not* "number of poses." It
is six structural properties NAKAVT does not yet have. Broken down:

### 1.0 Frame observations (verified, not inferred)

Sixteen frames in `reference/selected/` (local only). Timestamps are into the source MP4.

| Frame | ≈t | What the pixels actually show |
|---|---|---|
| `idle_ready.png` | 404.0 | Standing "alive" hold: feet **wider than shoulders**, knees softly bent, hips low, arms hanging *away* from the torso with bent elbows, head up and turned toward the ball. Never a straight-legged rest pose. |
| `walk_dribble.png` | 504.5 | Upright-ish carry, knees still bent, **ball low and out to the ball-side**, that hand reaching down onto it, head tipped toward the ball. |
| `crossover_step.png` | 504.6 | Ball swung across the body; **front foot flat and planted**, back knee driving through, deep knee flexion, torso pitched forward over the base. |
| `drive_lunge.png` | 504.9 | Deep gather: feet **planted wide and both flat**, hips dropped below knee height, chest over the knees, **ball out in front and low with the hand on top of it**, off-arm out for balance, gaze down at the ball. |
| `stop_plant.png` | 505.1 | Braking / change-of-direction plant: **both feet down, wide, flat**, COM dropped hard, shoulders squared over the base. The silhouette is unmistakably *wide and low* versus the running silhouette. |
| `gather_rise.png` | 505.4 | Ball pulled in to the chest, body straightening, weight coming up off the wide base. |
| `sprint_plant.png` | 501.6 | **The single most instructive frame.** Trail leg fully extended behind with the **ankle plantar-flexed (sole facing up/back)**; lead leg bent with the **foot flat and fixed on the floor**; torso ~20–25° forward; **head level and forward, not rotated with the torso**; near arm bent ~90° driven forward, far arm swung back — **elbows never straighten**; near shoulder forward, i.e. shoulder line counter-rotated against the hips. Contact shadow is tight and **under the plant foot only**, not a blob under the body centre. |
| `sprint_extend.png` | 501.8 | Next stride: full extension, brief float. The pose is **asymmetric at every instant** — one leg planted-and-bent, the other extended-and-pointed. |
| `jump_load.png` | 404.1 | Anticipation crouch before rising: knees bent, hips back, weight on one loaded leg, arms starting up. |
| `rebound_reach.png` | 404.3 | Body extending upward toward the ball's **actual position**; arms lead the body up; head tracking the ball. |
| `rebound_catch.png` | 404.4 | **Both hands on the ball surface**, cupping it from opposite sides, above and slightly in front of the head; elbows bent and out; torso upright and slightly rotated; head turned to the ball. The ball is *held*, never a decal at a body offset. |
| `land_absorb.png` | 404.5 | Two-foot landing: **wide base, deep knee flexion, knees pushed out, hips dropped**, torso upright but compressed — and the **ball pulled in to the chest** (protect / gather). |
| `turn_pivot.png` | 404.6 | Turning away: the pelvis has already rotated to the new direction while the shoulders still trail it. |
| `run_stride.png` | 404.8 | Normal-speed run: shorter stride, less lean, smaller arm swing than the sprint frames — **the same cycle scaled by speed**. |
| `shoot_follow.png` | 412.9 | Shooter **holds both arms fully extended overhead after release**; the contesting defender holds one arm straight up while his torso leans back over a lunge plant. |
| `post_base.png` | 627.4 | Post / defensive base: very wide flat-footed stance, hips low, arms out and asymmetric. |

**What the frames confirmed.** The §1.1–1.6 principle analysis below was written before the
footage was readable, and the frames back it: no foot ever slides — the plant foot is
**pinned to the floor while the body passes over it**; the pose is **never mirror-symmetric**;
the head stays level while the torso pitches; every explosive action is preceded by a
**crouch** and followed by a **held** extension; and the hand is posed **to the ball**, not
the ball to the hand.

**What the frames corrected or sharpened.** Six changes to the plan, all from pixels:

1. **Foot plant reads through the *ankle*, not just position.** The convincing cue is the
   trail foot being **plantar-flexed (toe pointed)** after push-off while the plant foot is
   **flat**. NAKAVT draws a shoe ellipse at a fixed angle on both feet — so even with foot
   IK, without an ankle angle driven by the stride phase the stride will still read wrong.
   *Not in the original plan; **AE3 must add an ankle/foot angle channel**.*
2. **The braking stop is a two-foot wide plant, not a lead-foot spike.** §1.2 predicted "the
   lead foot spikes forward, the torso pitches back." `stop_plant.png` shows **both** feet
   down, wide and flat, with the COM dropped and the shoulders square. *Implement STOP in
   AE3 as **widen base + drop COM + plant both feet** — also a far easier target than a
   one-foot brake.*
3. **Stance width is a first-class animation channel.** Across `idle_ready`, `drive_lunge`,
   `stop_plant`, `land_absorb` and `post_base` the thing that changes most is **how far
   apart the feet are and how low the hips sit** — not limb angles. NAKAVT's hips are a
   fixed `hipDx`. *Add a `stanceWidth` + `hipDrop` pair driven by state (AE1/AE2): cheap,
   and it carries most of the "weight" read on its own.*
4. **The contact shadow is per-foot, not per-body.** NAKAVT draws one ellipse under the body
   centre; the reference grounds the character with a tight shadow under the **planted
   foot**. Cheap credibility win, fold into AE3.
5. **The head is stabilised *and* aimed.** Level against torso pitch (sprint frames) *and*
   turned toward the ball (`rebound_catch`, `drive_lunge`). Both, not either — AE5.
6. **Elbows never straighten during locomotion.** The arms hold a roughly 90° bend and swing
   from the shoulder. NAKAVT's arm IK hand targets can currently reach full extension, which
   is what makes the run read as flailing. *Clamp the arm hand-target distance in AE2.*

**The central question, answered from frames.** NBA Live 08 reads real because **at every
instant the pose is asymmetric, the base is wide and loaded, one foot is pinned flat to the
floor, the head is level, and the hands are on the ball where the ball actually is.** NAKAVT
reads drawn because it is **symmetric (a mirrored sine), narrow-based, sliding on both feet,
head-locked to the torso, and holding the ball at a fixed offset.** The gap is those five
properties — not pose count.

### 1.1 Body mechanics
| Property | NBA Live 08 (why it reads real) | NAKAVT today |
|---|---|---|
| **Center of gravity** | A single **root/pelvis** carries the body; the COM stays over the base of support, and shifts *ahead* of the feet to start moving, *behind* to brake. | No root; parts offset from a fixed origin. COM never moves. |
| **Weight transfer** | Weight rolls foot-to-foot each stride; the loaded leg compresses. | Both legs mirror a symmetric sine; no load side. |
| **Hip movement** | Pelvis tilts + rotates (counter to the ribcage). | Pelvis is static. |
| **Torso rotation** | Chest counter-rotates against the hips (spinal separation) and leans with acceleration. | Torso is a fixed rectangle. |
| **Shoulder movement** | Shoulders drive the opposite-arm swing and absorb the shot. | Shoulders fixed; arms rooted to fixed shoulder points. |
| **Head stabilization** | Head/gaze is **stabilized** — it holds level and tracks the ball while the body moves under it. | Head rigidly follows the torso; eyes don't track anything. |
| **Knee compression** | Knees bend to absorb landing and load the jump (anticipation). | Knees only bend via a small `tuck`; no absorb/load. |
| **Ankle movement** | Ankle rolls; the plant foot stays flat and *fixed* while the body passes over it. | Feet translate with the body → visible sliding/"skating." |

### 1.2 Locomotion
NBA Live 08 locomotion is a **2-D blend space** (speed × facing/strafe) fed by mocap clips,
plus dedicated **transition** clips:
- **idle**: a breathing *moving hold* (never a frozen frame), small weight sway.
- **walk → jog → run → sprint**: the same cycle blended by speed; stride length, cadence,
  forward lean and arm-swing amplitude all scale with velocity.
- **acceleration**: body leans into the direction *before* reaching top speed (anticipation).
- **deceleration / stop**: a **braking** plant — the lead foot spikes forward, the torso
  pitches back, then a 1–2 frame settle. This "hard stop" is the single most convincing
  moment and NAKAVT has nothing like it.
- **turn / pivot**: the pelvis rotates first, the plant foot pivots, the upper body follows
  (overlapping action) — not an instant mirror-flip of `facing`.
- **lateral movement**: a distinct shuffle (feet never cross), not a rotated run.

### 1.3 Shooting (the money animation)
NBA Live 08's jump shot is a **timed chain** with anticipation and follow-through:
```
pre-shot stance → ball gather (dip) → knee bend / leg drive → hip extension →
torso extension → arm extension (up & slightly fwd) → wrist snap (release) →
follow-through HOLD (wrist flopped, arm extended) → landing absorb → recovery
```
Why it reads real: the **dip is anticipation** (down before up), the **wrist snap is
follow-through**, the release is a single readable contact pose, and the **hold** after
release sells intent. NAKAVT ramps one `armUp` value 0→1 and lands with a squash — no dip,
no leg drive, no wrist, no held follow-through.

### 1.4 Rebound
```
ball tracking (eyes/head to ball) → body orients to the ball → anticipation crouch →
explosive acceleration → jump load → jump → arm extension toward the ball's real position →
ball contact (hands meet ball) → landing absorb (knees) → protect/gather → recovery
```
Why it reads real: the player **tracks and reaches toward where the ball actually is** (IK),
plants and loads before the jump, and absorbs the landing. NAKAVT's AI now *runs* to the
rebound (good — the P7 steering work), but the **body** doesn't crouch-load, jump, reach, or
absorb; it slides over and the ball snaps to hand.

### 1.5 Ball / body relationship — "reaching" vs "glued"
The tell of amateur vs. convincing animation:
```
hand → ball : hands are IK-constrained to the ball's carry point (pose adapts to ball)
eyes → ball : gaze tracks the ball every frame
body → ball : shoulders/torso orient toward the ball
feet → ball : the player steps to bring the ball into a shootable position
```
- **NBA Live 08:** the ball is a **tracked object**; hands are posed *to* it by IK, and on a
  loose ball the arms **reach toward its real position**. Even when "carried," the hand pose
  follows the ball, so the brain reads *control*, not a decal.
- **NAKAVT:** the ball sits at a **fixed offset from the hand** (`b.pos.x = H.pos.x + 14*dir`),
  the hand does not adapt to it, and eyes never track it → reads as **glued**.
- The fix is not physics-accurate ball handling; it's **hand-IK to the ball + head/eye
  tracking**, so the character looks like it's *reaching for and holding* the ball.

### 1.6 The animation principles NBA Live 08 exhibits (and NAKAVT lacks)
| Principle | In NBA Live 08 | Adaptation for NAKAVT |
|---|---|---|
| **Anticipation** | dip before the shot, crouch before the jump, lean before the sprint | add a load/gather sub-phase before every explosive action |
| **Follow-through** | wrist snap + held arm after release; hair/jersey lag | hold the shooting arm after release; add SmoothDamp lag on limbs |
| **Overlapping action** | hips lead, chest follows, arms trail | drive a root → spine → limbs chain, each lagging the parent |
| **Secondary motion** | jersey/shorts/hair sway, arm jiggle | Verlet strands (hair/shorts hem) driven by body velocity |
| **Inertia / momentum** | body keeps moving after input stops; braking | velocity-driven lean + a decoupled visual body that damps toward the physics anchor |
| **Weight shift** | COM rolls foot-to-foot | pelvis sways over the plant foot each stride |
| **Squash / stretch** | compress on landing, stretch at jump apex | already partial — extend to landing absorb + apex stretch |
| **Pose / silhouette readability** | strong contact poses (release, plant, catch) | design 5–6 key contact poses the rig snaps *toward* (eased) |
| **Timing / spacing** | mocap ease-in/out; moving holds | replace linear lerps with eased blends; keep idle a moving hold |
| **Animation blending** | crossfade between clips, no popping | pose crossfade with blend weights in a small state machine |
| **Contact points** | foot-plant, ball-catch, release are locked | lock plant foot (IK) and hand-on-ball (IK) at contacts |

---

## 2. Move-by-move breakdown (target chains for NAKAVT)

Each move as `START → ANTICIPATION → MAIN → CONTACT/RELEASE → FOLLOW-THROUGH → RECOVERY`.
These are the poses/curves the new rig should generate.

| Move | Anticipation | Main | Contact/Release | Follow-through | Recovery |
|---|---|---|---|---|---|
| **IDLE** | — | breathing sway (moving hold) | — | — | — |
| **WALK** | small fwd lean | alternating stride, gentle arm swing, pelvis sway | plant foot flat | trailing leg lifts | — |
| **RUN** | lean into dir | longer stride, bigger swing, more lean | plant foot **fixed** (no slide) | push-off, float phase | — |
| **SPRINT** | deep lean | max stride/cadence, arms drive | double-contact push | full extension float | — |
| **STOP** | — | plant lead foot forward | torso pitches back (brake) | weight settles over feet | back to idle |
| **TURN / PIVOT** | pelvis pre-rotates | plant foot pivots | body swings around plant | shoulders catch up | face new dir |
| **SHOOT** | dip + knee bend (gather) | leg drive + hip/torso extend | wrist snap at apex | **hold** arm/wrist extended | land absorb → idle |
| **JUMP** | crouch load | leg extension | toe-off | apex stretch, arms up | — |
| **LAND** | reach for ground | — | foot contact | knee absorb (squash) | rise to idle |
| **REBOUND** | orient + crouch | accelerate + jump load | arms reach ball's real pos | catch, tuck ball | land absorb → gather |
| **DIRECTION CHANGE** | plant + lean new dir | push off outside foot | crossover step | body reorients | resume run |

**Compare to NAKAVT now:** we have `idle/run/aim/shoot/celebrate/knockout` as *single-frame
pose functions* with a couple of sine terms and one `armUp` ramp. There is **no
anticipation, no follow-through hold, no plant, no braking, no blend** — which is exactly the
"feels drawn" gap.

---

## 3. Current NAKAVT vs. NBA Live 08 — gap table

| Area | Current NAKAVT | NBA Live 08 (reference) | Gap | Required improvement |
|---|---|---|---|---|
| **Running** | symmetric leg sine + arm pump; feet translate | weighted stride, planted feet, pelvis sway, lean scales w/ speed | feet slide, no weight, no lean scaling | foot-IK planting; pelvis/COM sway; velocity-driven lean & stride scaling |
| **Shooting** | one `armUp` ramp + land squash | dip → leg drive → extend → wrist snap → hold | no anticipation/wrist/hold | timed shot chain w/ eased sub-phases + follow-through hold |
| **Jumping** | instant `lift` offset | crouch load → extend → apex stretch | no load/apex | load-and-release jump curve + apex stretch |
| **Rebound** | AI runs to ball (P7) but body static; ball snaps | track → crouch → jump → reach → catch → absorb | body doesn't reach/jump/absorb | reach-IK to ball + jump load/land on the chase's grab |
| **Turning** | instant `facing` flip | pelvis-led pivot, overlap | pose pops | eased turn transition; pelvis leads, upper body follows |
| **Weight** | none (fixed origin) | COM over base, rolls foot-to-foot | no weight at all | root/pelvis with COM shift + squash/stretch |
| **Secondary motion** | none | jersey/hair/arm lag | none | SmoothDamp limb lag + Verlet strands |
| **Ball relationship** | glued at fixed hand offset | hand-IK to ball + eyes track | reads as decal | hand-IK to ball carry/reach point + head/eye tracking |
| **Transitions** | instant pose swap | blended crossfade | popping | pose blend weights in a small state machine |

**Goal restated:** close the **movement-quality gap**, not add pose count.

---

## 4. Current NAKAVT problems (root causes)

1. **No shared root.** `drawCharacter` positions each part from a fixed local origin, so
   there is no COM, no weight, no overlapping action.
2. **Instant pose switches.** Pose is a string; changing it swaps drawing immediately →
   popping. No blend weights, no easing between states.
3. **Feet translate, never plant.** Legs are drawn at the body position; when the body
   moves, feet move → skating.
4. **One-parameter shot.** `armUp = phase*1.7` — no dip, leg drive, wrist, or follow-through.
5. **Ball glued.** Fixed hand offset; hands don't adapt to the ball; eyes don't track it.
6. **No momentum/secondary motion.** Nothing lags or carries inertia.
7. **Pose logic lives inside the renderer.** Animation and drawing are the same function, so
   there's nowhere to compute a rig/blend before drawing. Needs a layer split.

---

## 5. Open-source research findings

Each repo assessed against NAKAVT's constraints. **No code from any of these is copied.**

### 5.1 Creature WebGL — `kestrelm/Creature_WebGL`
```
License:        Apache-2.0 (non-licensed) / Creature License (owners) — dual
Technology:     JS + WebAssembly runtimes for PixiJS / Phaser / Three / Babylon / Cocos
Problem solved: play back high-quality skeletal + MESH-DEFORMATION animation, tiny files
Valuable tech:  bone hierarchy, mesh deformation (bend/squash of the silhouette itself),
                delta-compressed clips (230 KB, 200+ chars @60fps), animation blending
Canvas 2D?      NO — WebGL only
No build?       runtime is prebuilt JS, BUT authoring needs the Creature tool (paid)
GitHub Pages?   works, but pulls in a WebGL engine (Pixi/Three) = new heavy dependency
PWA/offline?    possible but adds MBs and a renderer swap
Perf impact:    excellent at runtime; heavy conceptual/bundle cost to adopt
Dependency:     large (WebGL engine + runtime + authoring tool)
Complexity:     HIGH (renderer swap + external authoring pipeline)
```
**Verdict: REFERENCE ONLY.** Steal the *concepts* — bone hierarchy, **mesh deformation**
(deform the drawn shape, not just rotate limbs), and **delta-compressed blended clips** — not
the runtime. Adopting it would mean abandoning Canvas 2D and adding a paid authoring tool.

### 5.2 2D Procedural Hyper-Motion Controller — `cristhiandrm/2D-Procedural-Hyper-Motion-Controller`
```
License:        MIT (permissive)
Technology:     Unity 2022.3 (C#)
Problem solved: make a procedurally-animated 2D humanoid feel alive WITHOUT clips
Valuable tech:  • PUPPET architecture: physics body decoupled from the visual body
                • limbs follow via SmoothDamp → natural LAG / follow-through / secondary motion
                • elliptical (sin/cos) walk cycle scaled by velocity
                • squash & stretch on impact / high vertical speed
                • angle smoothing (LerpAngle / SmoothDampAngle)
                • Verlet rope/cape for cloth secondary motion
Canvas 2D?      principles YES; code NO (Unity Rigidbody2D/SmoothDamp)
No build?       reimplement — the math is trivial in plain JS
GitHub Pages?   yes (as reimplemented math)
Perf impact:    negligible (a few damped values per limb)
Complexity:     LOW–MEDIUM to reimplement the ideas
```
**Verdict: REFERENCE (principles), reimplement.** This is the **single most valuable** source
for NAKAVT: the **decoupled physics-anchor → visual-body-with-SmoothDamp-lag** pattern gives
follow-through, inertia and secondary motion almost for free, and Verlet strands give
jersey/hair sway. MIT means even direct adaptation is safe *with attribution*, but it's C#, so
we write the (public-domain) math ourselves. SmoothDamp = a critically-damped spring, textbook.

### 5.3 Cani2D — `skeskinen/Cani2D`
```
License:        NONE detected (no LICENSE file) → default "all rights reserved"
Technology:     Vanilla JS + HTML5 Canvas 2D, Blender exporter → JSON models
Problem solved: play back keyframed skeletal animation on a 2D canvas
Valuable tech:  bone hierarchy, JSON rig format, Bezier interpolation between keyframes
Canvas 2D?      YES — exactly our stack
No build?       YES — runs directly, examples on GitHub Pages
GitHub Pages?   YES
Perf impact:    fine for a few characters (author calls it unoptimized)
Maturity:       v0.0.1, 7★, self-described "messy, incomplete"
```
**Verdict: REFERENCE ONLY — do NOT copy code (no license = all rights reserved).** It proves
the *shape* we want (a JSON bone hierarchy + keyframe interpolation drawn on Canvas 2D) and is
the closest architectural precedent for "lightweight canvas bones." We take the **architecture
idea** (bone hierarchy + keyframe/Bezier interpolation) and write our own, license-clean.

### 5.4 IK Procedural Animation — `mradovic38/ik-proc-anim-2d`
```
License:        MIT (permissive)
Technology:     Unity (C#), 2D
Problem solved: procedural locomotion with foot placement + balance, no clips
Valuable tech:  • foot IK via ground raycast + step targets
                • CENTER-OF-MASS balance: step is triggered when COM leaves the foot span
                • swing foot travels an arc (lerped) to the next ground target
                • head tracking (gaze) with spine tilt to terrain
Canvas 2D?      principles YES; code NO (Unity Physics2D/Rigidbody/raycast)
No build?       reimplement (our floor is a flat y, so "raycast" is trivial)
GitHub Pages?   yes (reimplemented)
Perf impact:    negligible
Complexity:     LOW–MEDIUM to reimplement the ideas
```
**Verdict: REFERENCE (principles), reimplement.** The **COM-triggers-a-step** rule and the
**arc-lerp swing foot** are exactly how to kill NAKAVT's foot-sliding and get planted,
weighted strides. Head-tracking maps directly to "eyes → ball." MIT; reimplement anyway (C#).

### 5.5 Others found (not in the brief, worth noting)
| Repo | Tech | License | Relevance | Verdict |
|---|---|---|---|---|
| `not-inept/bonehead` | JS/HTML5, Spine-compatible export | verify | 2D skeletal authoring in-browser | REFERENCE (authoring idea) |
| `urraka/skel2d` | WebGL skeletal tool + custom format | verify | rig/anim format design | REFERENCE ONLY (WebGL) |
| `jasonChen1982/jcc2d` | Canvas2D render engine + timeline/animator | MIT (verify) | tween/timeline patterns on canvas | REFERENCE (timeline idea) |
| Spine / DragonBones runtimes | JS runtimes for pro 2D skeletal tools | Spine=proprietary; DragonBones=MIT-ish | industry rig+mesh-deform standard | REFERENCE (format/quality bar); adopting = external tool + asset pipeline |

---

## 6. License analysis (mandatory)

| Source | License | Classification | Rule applied |
|---|---|---|---|
| Creature WebGL | Apache-2.0 / Creature (dual) | **REFERENCE ONLY** | concepts only; no renderer swap, no paid tool |
| Hyper-Motion Controller | MIT | **SAFE TO ADAPT (w/ attribution)** — but reimplemented | C#→JS rewrite; math is public-domain |
| Cani2D | **none / all-rights-reserved** | **LICENSE RISK — DO NOT USE CODE** | no license ⇒ no copying; architecture idea only |
| ik-proc-anim-2d | MIT | **SAFE TO ADAPT (w/ attribution)** — but reimplemented | C#→JS rewrite; algorithm is public-domain |
| Reynolds steering / 2-bone & FABRIK IK / Penner easing / Verlet / SmoothDamp (critically-damped spring) | public domain (algorithms) | **SAFE TO USE (reimplement fresh)** | already our policy; unit-tested |

**Policy:** we ship **original implementations of public-domain algorithms**. Where an MIT
repo (Hyper-Motion, IK) is the clearest precedent for a technique, we note it as attribution
in `docs/OSS_ADOPTIONS.md` even though we rewrote the code. Nothing from Cani2D (no license) or
any copyrighted source is copied. **No NBA Live 08 asset is used — movement principles only.**

---

## 7. Recommended architecture — NAKAVT Character Animation Engine

Decouple animation from gameplay and from rendering (the layer split NAKAVT lacks today):

```
GAMEPLAY STATE          (scene.js: pos, vel, state: run/chase/shoot/…, ball ref)
      │  (drives, never drawn directly)
      ▼
ANIMATION STATE         (per-character: current + target motion state, blend weights,
      │                  phase clocks, momentum = smoothed velocity)
      ▼
CHARACTER RIG           (root/pelvis → spine → shoulders → 2 IK arms; hips → 2 IK legs;
      │                  neck→head. Bone hierarchy w/ local transforms.)
      ├── SKELETON       parent/child transforms (pelvis leads; overlap via per-bone lag)
      ├── IK             legs: foot-plant + arc swing (COM-triggered step);
      │                  arms: hand-to-ball / hand-to-release (2-bone IK, already built)
      └── PROCEDURAL     velocity→lean, squash/stretch, SmoothDamp limb lag,
          MOTION         Verlet strands (jersey hem / hair), head/eye ball-tracking
      ▼
POSE GENERATION         each frame: sample the active state's curve at its eased phase →
      │                  target joint angles/targets
      ▼
ANIMATION BLENDING      crossfade current↔target pose by blend weight (no popping);
      │                  additive layers (e.g. shot arm over run legs)
      ▼
CHARACTER DEFORMATION   (optional, later) subtle silhouette bend/squash à la mesh-deform
      ▼
LIGHTING / SHADOW / FX  existing contact shadow, rim light, glow, particles
      ▼
RENDER                  existing tapered-capsule limb drawing, fed by rig joints
```

Key decisions:
- **Reuse what exists:** the 2-bone IK (`core/steering.js`), tapered-limb draw
  (`render/characters.js`), easing (`core/ease.js`), camera/particles. This is an
  *evolution* of the P9 articulated renderer into a **rig + blend** system, not a rewrite.
- **Pure & testable:** the rig/pose/IK math goes in `core/` (or `sim/`) as pure functions;
  the renderer just draws the resolved joints. Enables unit tests (COM step trigger, blend
  weight, foot-plant lock, shot-phase timing).
- **No new dependency, no build, no renderer swap** → PWA/offline/GitHub Pages untouched.

---

## 8. Technology decision — options scored

Scored 1–5 (5 = best) for NAKAVT's constraints. **Higher total = better fit.**

| Criterion (weight) | A: improve current procedural | **C: Canvas + procedural IK + rig (rec.)** | B: canvas skeletal (clip-based) | D: WebGL skeletal | E: external runtime (Creature/Spine) |
|---|:--:|:--:|:--:|:--:|:--:|
| Visual quality ceiling | 3 | **4** | 4 | 5 | 5 |
| Performance (mobile) | 5 | **4** | 4 | 4 | 4 |
| Complexity (low=better) | 5 | **3** | 3 | 2 | 2 |
| Bundle size | 5 | **5** | 4 | 2 | 2 |
| GitHub Pages compat | 5 | **5** | 5 | 4 | 3 |
| PWA / offline | 5 | **5** | 5 | 4 | 3 |
| No build step | 5 | **5** | 4 | 3 | 2 |
| Maintainability | 4 | **4** | 3 | 2 | 2 |
| Future animation potential | 2 | **4** | 4 | 5 | 5 |
| Asset pipeline needed | 5 | **5** | 3 | 2 | 1 (paid tool) |
| IP / license safety | 5 | **5** | 4 | 4 | 3 |
| **Total** | **49** | **49** | **43** | **37** | **32** |

- **A and C tie on total**, but A's ceiling (visual quality + future potential) is capped —
  it can't fix foot-sliding, weight, or blending without becoming C anyway.
- **Recommended: Option C — Canvas + procedural IK + a lightweight rig**, built as an
  **evolution of the current renderer**. It keeps every hard constraint (vanilla, no build,
  Canvas 2D, PWA, GitHub Pages, IP-safe) while adding the exact things that create the
  NBA-Live-08 "real movement" feel: a **weighted root**, **planted feet (IK)**, **blended
  transitions**, **momentum/secondary motion**, and **ball-tracking hands**.
- **D/E rejected:** WebGL/external runtimes break no-build/PWA simplicity, add MBs, and (Creature/Spine) need a paid authoring tool — disproportionate for chibi arcade ballers.

---

## 9. Animation roadmap — SHIPPED (AE1–AE7 complete, 2026-08-30)

Every phase: implement → `npm test` → visual QA in real Chrome → commit → push.
Test count went **39 → 149**, all green.

| Phase | Shipped | Module | Acceptance |
|---|---|---|---|
| **AE1 — Rig scaffold** | Pure rig: proportions, pose generation, skeleton resolution, split out of the renderer. `stanceWidth`/`hipDrop` carried from the start. | `core/rig.js` | ✅ pose sheet **byte-identical** to the pre-refactor render |
| **AE2 — Momentum** | Critically-damped spring; smoothed speed → lean + stride length + cadence; squash/stretch from real vertical motion; limb lag; elbow clamp. | `core/anim.js` | ✅ lean and stride scale with speed; arms never lock out |
| **AE3 — Foot planting** | World-space feet: one planted and pinned, the other swings on an arc. Ankle angle (flat plant, pointed toe). Braking stop = wide base + dropped COM. Per-foot shadow. | `core/gait.js` | ✅ plant foot moves **0.0px** across 400 sprint frames |
| **AE4 — Shot chain** | gather → drive → extend → wrist release → **held** follow-through → land absorb, off the two gameplay clocks. | `core/shotchain.js` | ✅ the shot reads as a sequence, not a ramp |
| **AE5 — Ball & gaze** | Shared carry point (ball and hand cannot disagree); hands posed *to* the ball wherever it is; head stabilised against lean **and** aimed at the ball. | `core/rig.js` | ✅ hand tracks the ball to the floor, to head height, and *reaches* for one out of range |
| **AE6 — Blending** | Pose crossfade on the resolved skeleton (feet excluded — the gait owns those); pelvis-led turn through side-on with the shoulders trailing. | `core/blend.js` | ✅ largest per-frame joint jump cut to **under half** |
| **AE7 — Secondary + perf** | Verlet jersey hem and dread swing; performance profile; acceptance chains. | `core/verlet.js` | ✅ **1.56 ms/frame for 10 movers** (15.1 ms headroom at 60 FPS) |

### What the frame analysis changed

All six §1.0 findings shipped: the ankle channel (AE3), the two-foot braking stop
(AE3), stance width and hip drop (AE1→AE4), the per-foot shadow (AE3),
stabilise-*and*-aim for the head (AE5), and the elbow clamp (AE2).

### Bugs the work uncovered — all pre-existing, all the same shape

Four separate cases of **a limb target placed where the limb cannot reach**, so the IK
silently clamped it and the intended motion never appeared:

1. **Legs too short to stand.** Hip-to-floor was `18.5*s` but the leg bones totalled
   `18*s`, so every normal-height knee was pinned straight and feet were already being
   drawn short of their target. Fatal once AE3 asks a foot to stay where it was planted.
   Leg length is now derived from the hip-to-floor span with slack.
2. **Resting hands beyond the arm.** `17.72*s` of reach on a `17*s` arm — the elbows were
   locked in every non-shooting pose, which is much of why the arms read as sticks.
3. **The shot release ~44px from a ~27px arm**, so the arm sat at max extension from the
   first frame and the entire extension ramp was invisible.
4. **The guide hand anchored to the body centre** but measured from its own shoulder, a
   shoulder-width further out than intended.

Every one now has a test that sweeps heights, draw scales and facings and fails if a
target ever lands outside the limb. Two more modelling bugs: feet aimed their step at the
body centre line and **crossed over**; and the braking stance widened the hips but not the
feet, so the wide base was invisible.

### Things that were invisible until the renderer was told about them

The rig moved joints the renderer did not draw from. `hipDrop` moved the pelvis while the
torso was drawn from a fixed origin, so a gather or a landing absorb only moved hidden
hips; `lean` was a whole-body canvas translate, which slides a sprite rather than carrying
a body over its feet. Both now move the drawn upper body. A raised arm was also drawn
*under* the head, hiding the release pose.

### Tooling note

Two QA failures worth recording, because both produced **false confidence** rather than
visible errors:

- A patch script run with stdout and stderr both redirected to `/dev/null` swallowed a
  failed anchor match. AE4's scene wiring never landed, the unit tests and QA strips
  passed anyway (they call the rig directly), and the miss was only caught during AE5.
  Fixed in the AE5 commit; edits are now verified by grepping for the symbol.
- `python -m http.server` sends no `Cache-Control`, so Chrome applied heuristic freshness
  and re-served a stale module after an edit — a visual strip can "prove" a change works
  while rendering the previous build. The local QA server now sends `no-store`.

---

## 10. Acceptance test — MET

```
Chain 1:  RUN → SPRINT → STOP → TURN → SHOOT                     ✅
Chain 2:  RUN → CHASE BALL → REBOUND → JUMP → CATCH → LAND → SHOOT ✅
```

Captured as before/after filmstrips by loading the **pre-AE1 renderer straight out of git**
alongside the current one and running both through the same timeline, so the comparison is
the same motion through two engines rather than two different takes.

**Before:** all twelve frames of each chain are near-identical — the same standing figure
whether running, stopping, turning or shooting, with the ball drifting past a body that
never reacts to it.

**After:** strides differ by speed, the stop drops and widens, the turn passes through
side-on with the shoulders trailing, the shot rises and holds and lands, and the arm tracks
the falling ball the whole way down.

The bar was *"movement quality is visibly different"*, not *"we added more animations"* —
and the difference is structural: at any instant the pose is asymmetric, the base is loaded,
a foot is pinned to the floor, the head is level, and the hand is where the ball is.

Local-only artefacts (gitignored): `reference/shots/ae7_chain1.png`,
`reference/shots/ae7_chain2.png`, plus per-phase strips for AE2–AE6.

---

## 11. Guardrails (unchanged, enforced)
- **No NBA Live 08 (or any) copyrighted asset, model, texture, face, jersey, logo, player, or
  sound.** Movement *principles* only; NAKAVT characters stay original.
- Vanilla JS · ES modules · Canvas 2D · **no build, no framework, no new runtime dependency**.
- Gameplay untouched: knockout rules, ball physics, AI, scoring, roster, arenas, audio, PWA,
  offline, responsiveness. Animation is a **separate layer** above gameplay, below render.
- All existing tests stay green; every phase gated by unit + e2e + visual QA.

---

## 12. Decisions — status

1. **Option C approved** (Canvas + procedural IK + lightweight rig, evolving the current
   renderer). Direction confirmed by the project owner; AE1→AE7 is now the working plan.
2. **Phase-by-phase**, tests + visual QA gating each phase, starting with the rig scaffold at
   visual parity. Every phase: implement → `npm test` (39 green) → run the game locally and
   screenshot → commit → push.
3. ~~Frame analysis blocked~~ — **done** (2026-08-30). ffmpeg was installed locally, the MP4
   sits in the gitignored `reference/`, 2161 frames were extracted and 16 representative
   frames selected and read. Findings are in §0 and §1.0; they added six concrete changes to
   the AE1–AE5 scope (ankle angle, two-foot stop, stance width, per-foot shadow, head
   stabilise-and-aim, elbow clamp). **No frame, video or asset is committed.**

**Local reproduction of the frame work** (nothing here is in git):

```sh
# ffmpeg (Windows):  winget install --id=Gyan.FFmpeg -e --source winget
mkdir -p nakavt/reference/frames
ffmpeg -i nakavt/reference/nba-live-08-animation.mp4 \
       -vf "fps=3,scale=480:-1" nakavt/reference/frames/f_%04d.png
```
