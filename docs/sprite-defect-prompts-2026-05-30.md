# Sprite Defect Prompts — 2026-05-30 (updated after S6 handoff)

## Status summary

| Defect | Status |
|--------|--------|
| Work-state preview button missing (S5) | ✅ Fixed — preview now has Idle / Walk / Work tabs |
| Wonders not included | ✅ Fixed — S6 delivers 4 legendary + 4 natural wonders |
| V2 animation rollout (15 units) | ❌ Still outstanding |
| PikemanV2 forward-thrust keyframe | ❌ Still outstanding |
| More wonders (beyond S6 4+4) | ❌ Not yet started |

Prompts below are for the three remaining gaps.

---

## DEFECT 1 — V2 animation rollout: 15 units still on V1

**Status**: Four canary sprites work (SwordsmanV2, WorkerV2, ArcherV2, SpyOperativeV2).
The remaining 14 (excluding blocked Pikeman) need V2 ports following HANDOFF.md.

**Prompt for Claude Design**:

> Continue the V2 animation rollout following the HANDOFF.md in this project.
> These units still need porting — group them by which canary they follow:
>
> **Like Worker (civilian + tool, `arms="free"` + `armRContent`):**
> - SettlerSprite — ox-cart body art, walking staff in `armRContent`
> - ScoutSprite — spyglass at brow (`armRContent` at shoulder-level, not hand-level)
>
> **Like Archer (ranged, `arms="locked"` + external weapon):**
> - MusketeerSprite — replace bow with musket; add `.cq-muzzle-flash` at muzzle tip
>
> **Like Swordsman (melee, custom geometry):**
> - WarriorSprite — HumanoidV2 `arms="free"`, club in `.cq-weapon`, round shield in `armLContent`
>
> **Like SpyOperative (cloak + gadget):**
> - SpyScoutSprite — monocular gadget
> - SpyInformantSprite — newspaper/papers gadget
> - SpyAgentSprite — mini radio gadget
> - SpyHackerSprite — handheld terminal
> - ShadowWardenSprite — `arms="free"` + `.cq-cape` + lantern in `armRContent`
>
> **Quadrupeds (just wrap existing legs for body-bob, no articulation):**
> - ScoutHoundSprite — outer translate / inner wrapper (no hook class) per leg
> - WarHoundSprite — same
>
> **Naval (auto-phase only; `.cq-sail` already animated):**
> - GalleySprite — confirm no detached parts, add `SpriteFrameV2` wrapper
> - TriremeSprite — same
>
> For each sprite: add a V2 row to `anim-compare.jsx`, run the devtools lint
> snippet from HANDOFF.md, and confirm walk + attack loops have no flying parts.
> Do NOT port PikemanSprite — it is blocked on DEFECT 2 below.

---

## DEFECT 2 — PikemanV2 blocked: needs forward-thrust keyframe

**Status**: HANDOFF.md explicitly says to flag this rather than invent the keyframe alone.

**Prompt for Claude Design**:

> Add a `cq-pike-thrust` keyframe to `lib/sprite-animations-v2.css` for the Pikeman's
> attack animation. A pike thrusts linearly — it must NOT use the generic `cq2-swing`
> rotation (which looks like a sword).
>
> Desired motion:
> - Idle / walk: pike rests diagonally over the shoulder (static geometry).
> - Attack: the whole pike assembly translates forward ~12px along its shaft axis,
>   with a slight anticipatory pullback (−4px) in the first 15% of the cycle, then
>   snaps forward and returns. Total duration ~1.1s to match other melee units.
>
> Hook class: `.cq-weapon` on `data-kind="melee"` units. Scope it with a
> `[data-kind="pikeman"]` attribute (or a dedicated `data-subkind`) so it only
> fires on Pikeman and doesn't override Swordsman / Warrior.
>
> After adding the keyframe, port PikemanV2Sprite following HANDOFF.md checklist.
> The pike shaft is long — confirm the tip doesn't exit the 128×128 viewBox during
> the thrust frame.

---

## DEFECT 3 — Additional wonders (beyond S6 4+4)

**Status**: S6 delivered the minimum four of each category. The note in the S6
REVIEW.md says "Say the word for the rest of each category."

**Prompt for Claude Design** (additional legendary wonders):

> Add four more legendary wonder sprites to the `sprites-s7/` folder, following
> the same S6 conventions (`BuildingFrame` · 192×192 · `palette.*` · existing hooks only):
>
> | Wonder | Category | Concept |
> |--------|----------|---------|
> | Hanging Gardens | food | multi-level terraced garden, waterwheels feeding canals, `.cq-water-stream`, lush `#7ea860` terraces |
> | Great Wall | military | crenellated wall section in `P.stone.mid`, watchtower at left, `.cq-smoke` beacon fire |
> | Leviathan Drydock | economy | enormous dry dock, half-built warship hull, `.cq-spark` metalwork, `.cq-smoke` furnace |
> | Moonwell Gardens | science | moonlit reflecting pool, stone observatory dome, `.cq-glow` pool surface, starfield detail |
>
> Deliver: `sprites-s7/wonders-legendary.tsx` (paste-ready into `wonders.tsx`),
> plus a `REVIEW.md` checklist confirming no new animation keyframes were needed.

**Prompt for Claude Design** (additional natural wonder tiles):

> Add four more natural wonder hex tiles to `sprites-s7/wonders-natural.tsx`,
> following the S6 hex tile format (`viewBox 0 0 128 111`, unique `clipPath id="hexW-*"`,
> SMIL only, no faction palette):
>
> | Wonder ID | Concept | SMIL |
> |-----------|---------|------|
> | `coral_reef` | turquoise water, fan corals, darting fish silhouettes | fish `<animateTransform type="translate">` + gentle wave `<animate>` on water |
> | `aurora_fields` | dark tundra, sweeping aurora bands in teal/violet | aurora `<animate attributeName="opacity">` + slow colour shift |
> | `frozen_falls` | icy blue cliff, frozen waterfall curtain, snow dusting | light particle drift matching snow tile pattern |
> | `grand_canyon` | layered rust-red strata, river glint at base, long shadows | river glint `<animate attributeName="opacity">` shimmer |
>
> Deliver: `sprites-s7/wonders-natural.tsx` with the four new entries in the
> `NATURAL_WONDER_TILES` record. These will be merged into the game's
> `src/renderer/terrain/wonder-tiles.ts`.
