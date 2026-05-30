# Sprite Defect Prompts — 2026-05-30

Prompts to give Claude Design to fix issues found during the handoff ZIP review.
Each section is a self-contained prompt; paste one at a time into Claude Design.

---

## DEFECT 1 — V2 animation rollout: 15 units still on V1

**Status**: Canary sprites work. Rollout not finished.

**Background**: The design project already contains four working V2 canary sprites
(`SwordsmanV2Sprite`, `WorkerV2Sprite`, `ArcherV2Sprite`, `SpyOperativeV2Sprite`)
in `lib/units-v2.jsx`, plus the full animation stylesheet in
`lib/sprite-animations-v2.css`. The HANDOFF.md describes the per-sprite checklist
and architecture rules.

**Prompt for Claude Design**:

> Continue the V2 animation rollout following the HANDOFF.md in this project.
> Fifteen units still need V2 ports:
>
> **Like Worker (civilian + tool, arms="free" + armRContent):**
> - SettlerSprite — ox-cart body art, walking staff in armRContent
> - ScoutSprite — spyglass at brow (arm raised via armRContent at shoulder level)
>
> **Like Archer (ranged, arms="locked" + external weapon):**
> - MusketeerSprite — replace bow with musket; add .cq-muzzle-flash at muzzle tip
>
> **Like Swordsman (melee, custom geometry):**
> - WarriorSprite — HumanoidV2 arms="free", club in .cq-weapon, round shield in armLContent
> - PikemanSprite — see DEFECT 2 below (blocked on new keyframe; do the other 14 first)
>
> **Like SpyOperative (cloak + gadget):**
> - SpyScoutSprite — monocular gadget
> - SpyInformantSprite — newspaper/papers gadget
> - SpyAgentSprite — mini radio gadget
> - SpyHackerSprite — handheld terminal
> - ShadowWardenSprite — arms="free", lantern in armRContent, .cq-cape
>
> **Quadrupeds (don't use HumanoidV2; just wrap existing legs for bob):**
> - ScoutHoundSprite — wrap each leg group in outer translate / inner (no hook class), gives body-bob only
> - WarHoundSprite — same pattern
>
> **Naval (just needs auto-phase; .cq-sail already animated):**
> - GalleySprite — confirm no detached parts, add SpriteFrameV2 wrapper
> - TriremeSprite — same
>
> For each sprite: add a V2 row to `anim-compare.jsx`, run the devtools lint
> snippet from HANDOFF.md, and confirm walk + attack loops have no flying parts.
> Commit once all 14 (excluding Pikeman) pass the per-sprite checklist.

---

## DEFECT 2 — PikemanV2 blocked: needs forward-thrust keyframe

**Status**: HANDOFF.md explicitly says to flag this back rather than inventing the keyframe.

**Prompt for Claude Design**:

> Add a `cq-pike-thrust` keyframe to `lib/sprite-animations-v2.css` for the Pikeman's
> attack animation. The pikeman thrusts forward — it should NOT use the generic
> `cq2-swing` rotation because a pike doesn't swing like a sword; it extends linearly.
>
> Desired motion:
> - Idle / walk: pike rests diagonally over the shoulder (no CSS movement needed — the
>   SVG geometry already places it there).
> - Attack: the whole pike assembly translates forward along its shaft axis ~12px,
>   then snaps back over ~0.3s. A very slight rotation (±3°) at the start gives
>   anticipation. Total duration ~1.1s to match the other melee units.
>
> Hook class: `.cq-weapon` (already in CSS scope). Use `data-kind="melee"` selector
> so it only fires on Pikeman (melee units get `data-kind="melee"` from `SpriteFrameV2`).
>
> After adding the keyframe, port PikemanV2Sprite following the HANDOFF.md checklist.
> The pike shaft is long — confirm the tip does not exit the 128×128 viewBox during
> the thrust frame. If it does, shorten the pike geometry slightly.

---

## DEFECT 3 — Wonder sprites not included in handoff

**Status**: Zero wonder sprites delivered. The game has two wonder categories:
legendary (player-built) and natural (discovered on the map).

**Prompt for Claude Design**:

> The Conquestoria handoff ZIP is missing wonder sprites. The game already has
> placeholder canvas renderers for wonders. Replace them with SVG sprites matching
> the S4b/S5 art style (128×128 viewBox, earthy palette, no gradients/filters,
> `stroke-linecap="round"` throughout).
>
> **Legendary wonders** (player-built, shown at city scale — same size as buildings):
> Use `BuildingFrame` / `BuildingPlinth` like the existing building sprites.
> Faction color flows through `palette.*`. Build at least these four first:
>
> | Wonder | Concept |
> |--------|---------|
> | Pyramids | three stepped stone pyramids, desert sand base, tiny workers hauling blocks |
> | Colosseum | oval stone amphitheater cross-section, arched tiers, crowd silhouettes |
> | Great Library | tall columned hall, scroll tubes visible through open doors, .cq-glow inside |
> | Lighthouse | tall lighthouse tower, .cq-beacon rotating light at top, rocky shore plinth |
>
> **Natural wonders** (map features, drawn on hex tile — 128×111 hex viewBox):
> Use the same hex clipPath format as the terrain tiles (`viewBox="0 0 128 111"`,
> `<clipPath id="hex"><polygon points="64,0 128,27.75 128,83.25 64,111 0,83.25 0,27.75"/></clipPath>`).
> No faction palette. SMIL animation is allowed (same pattern as ocean/volcanic tiles).
> Build at least:
>
> | Natural Wonder | Concept |
> |----------------|---------|
> | Mount Olympus | dramatic grey peak, snow cap, lightning bolt accent |
> | El Dorado | golden temple ruins, lush jungle border, gold shimmer SMIL |
> | Fountain of Youth | sparkling pool, stone surround, water ripple SMIL |
> | Krakatoa | volcanic hex tile (derive from volcanic terrain variant), active lava vent |
>
> Deliver: a `wonders-legendary.tsx` and `wonders-natural.tsx` in the `sprites-s6/`
> folder (same layout as `sprites-s5/`), plus a REVIEW.md checklist.

---

## DEFECT 4 — Work-state screenshots show identical idle view

**Status**: Static screenshots only; cannot confirm `data-state="work"` CSS fires correctly.

**Context**: The `dig-test.png` and `s5-work.png` screenshots appear to show the same
idle pose for Expedition. The work-state dust (`cq-work-dust`) and dig animation
(`cq-tool`) are CSS-driven by `[data-state="work"]` selectors. If the preview page
doesn't toggle to `data-state="work"` (it may only toggle idle/walk/attack), the
animation never fires.

**Prompt for Claude Design**:

> In `Conquestoria S5 Sprites.html`, the state toggle buttons currently show
> **Idle | Walk | Attack**. Expedition and Caravan need a **Work** button because
> their action state is `data-state="work"`, not `"attack"`.
>
> Add a **Work** button to the S5 preview (alongside Idle/Walk/Attack) that sets
> `data-state="work"` on all unit SpriteFrame roots. Then:
>
> 1. Confirm the Expedition `cq-dig` animation fires — the pickaxe should swing
>    ~30° down from its resting shoulder position.
> 2. Confirm `cq-work-dust` appears as a brief opacity-in/out puff below the pickaxe.
> 3. Confirm `cq-work-bob` gently bounces the whole figure.
> 4. Confirm the Caravan `cq-deliver` coins appear and shimmer.
>
> If any of these don't fire, debug the CSS selector chain — check that the SpriteFrame
> root has `data-state="work"` set (not just the inner figure), since all selectors
> are `[data-state="work"] .cq-*`.
>
> Take a screenshot of each animation mid-frame and attach to the review.

---

## NOT A DEFECT — S5 class= vs className= inconsistency

The S5 sprite TSX files (`sprites-s5/units-new.tsx`, `sprites-s5/buildings-new.tsx`)
use raw `class="cq-*"` attributes instead of `className="cq-*"`. Both work with the
game's custom JSX runtime (the runtime passes unknown keys through verbatim, and the
`CAMEL_TO_SVG` map converts `className` → `class`). This is cosmetic inconsistency;
the game integration will normalize to `className` during paste.

No Claude Design action needed.
