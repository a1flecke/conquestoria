# Claude Design Prompt: Conquestoria Sprites

**This file currently contains exactly one active prompt: Era 13 content-launch sprite
replacements (issue #652), batch B — the 7 remaining buildings/national projects.**
Everything else that used to live here — the original economy-sprite batch, the terrain-tiles
prompt, the naval transport sprites, the legendary beast prompt, the rail-segment addendum, and
now **#652 batch A (5 units + 8 buildings)** — has been **removed from this file because all of
it is already implemented and shipped**. Batch A landed 2026-07-26: `CombatDroneSprite`,
`AutonomousFrigateSprite`, `ExosuitInfantrySprite`, `PropagandistSprite`, `DroneControllerSprite`
in `units.tsx`, and `NetworkOperationsCenterSprite`, `AiSafetyInstituteSprite`,
`DroneFabricatorSprite`, `ElectronicWarfareArraySprite`, `CivicMediaForumSprite`,
`VerticalFarmSprite`, `NeuralRehabilitationCenterSprite`, `OceanRoboticsYardSprite` in
`buildings.tsx` — all verified against real, non-placeholder catalog entries in
`sprite-catalog.ts` and covered by alias-rejection tests in
`tests/renderer/sprites/sprite-catalog.test.ts`. Re-running an already-shipped prompt wastes a
Claude Design conversation regenerating work that exists — that happened three times this session
(terrain, naval transport, and almost batch A again) before this file started getting pruned after
each batch lands. If you need the history of any removed prompt, it's in this file's git history;
there's no reason to resurrect it here.

**Going forward:** when a new sprite/terrain/prompt need is identified, use the
`.claude/skills/generate-sprite-prompt.md` skill to generate it, and append it to this file the
same way the section below was added — dated, scoped to the specific issue, and removed from this
file once shipped (matching this same cleanup) rather than left to accumulate.

---

# === ERA 13 CONTENT-LAUNCH SPRITE REPLACEMENTS (#652), BATCH B — 2026-07-19, revised 2026-07-26 ===

## Developer Instructions (do not copy this section into Claude)

Issue: https://github.com/a1flecke/conquestoria/issues/652 — replaces the remaining 7 temporary
alias mappings in `sprite-catalog.ts` (shipped by #515, Era 13 content launch) with unique,
production SVG components. Batch A (5 units + 8 buildings) already shipped 2026-07-26 — see the
top-of-file note above. Audited base for this batch: `origin/main` as of the batch A integration
commit.

**What's still pending**: the 7 remaining buildings/national projects — `circular_fabricator`,
`modular_arcology`, `carbon_capture_grid`, `immersive_arts_lab`, `national_ai_assurance_program`,
`circular_manufacturing_network`, `mars_robotics_initiative`. All 7 are currently aliased to Era
12 placeholder sprites; three of them (`national_ai_assurance_program`,
`circular_manufacturing_network`, `mars_robotics_initiative`) are national projects and must read
as empire-scale campuses, not ordinary local buildings — see the composition-discipline note in
the prompt below.

Paste everything from `<role>` through `</style_checklist>` below into a Claude Design
conversation. If the repository is private and raw GitHub URLs 403, attach these files instead:
`src/renderer/sprites/sprite-system.tsx`, `buildings.tsx`, `src/assets/sprite-animations-v2.css`,
`src/renderer/sprites/sprite-catalog.ts`.

**What to do with the output**:
1. Insert each function into `buildings.tsx`, after `OceanRoboticsYardSprite` (the last function
   in the file as of the batch A integration — confirm this is still true before pasting, in case
   anything else landed in between).
2. Replace the corresponding placeholder line in `BUILDING_SPRITE_CATALOG` in
   `src/renderer/sprites/sprite-catalog.ts` (exact replacement lines given in each spec below).
3. Remove the `// Era 13 content launch: temporary thematically-close mappings...` comment block
   above the building catalog entries — once these 7 land, all 20 #652 sprites are done and no
   Era 13 placeholder comment should remain anywhere in the file.
4. Update `docs/sprite-design-system.md`'s Era 13 note (added alongside the Buildings table) to
   say all 15 buildings are done, not just batch A's 8.
5. Extend the alias-rejection `describe` block in `tests/renderer/sprites/sprite-catalog.test.ts`
   (`Era 13 batch A sprites are not aliases...`) to also cover these 7 — rename it to drop "batch
   A" once it covers the full 15, matching the pattern already used for batch A's 8.
6. Once this lands, `docs/claude-design-sprites-prompt.md` should be pruned again — remove this
   batch B section, leaving only the top-of-file note (or nothing, if no other prompt is pending).
   #652 will be fully shipped at that point (20/20 sprites).

---

## Prompt (copy everything below this line, through `</style_checklist>`)

<role>
You are a senior SVG sprite artist and TypeScript developer specializing in hand-crafted game graphics. You write clean, geometric SVG in JSX-based TypeScript — no photorealism, no gradient meshes, no blur filters, no embedded raster images. Your work integrates directly into a production codebase.
</role>

<context>
**Goal**: replace 7 temporary Era 13 building/national-project sprites — currently exact visual reuses of Era 12 sprites — with distinct, production-quality silhouettes, three of which must additionally read as empire-scale national projects rather than ordinary local buildings.

**Layout**: each sprite is a standalone 192×192 SVG built on `<BuildingFrame>`/`<BuildingPlinth>`, the same fixed layout every existing building sprite uses.

**Content**: 4 ordinary buildings (Circular Fabricator, Modular Arcology, Carbon Capture Grid, Immersive Arts Lab) plus 3 national projects (National AI Assurance Program, Circular Manufacturing Network, Mars Robotics Initiative). Full per-sprite specs are in `<sprites>` below.

**Audience**: this 192×192 SVG is the established building-sprite asset contract used by every entry in `BUILDING_SPRITE_CATALOG` — correct format and correct catalog registration matter regardless of exactly which UI surface currently renders it (see the honesty note below). Design at the same visual density and scale as the existing Era 10–12 sprites you're referencing, and keep every sprite in this batch visually distinct from the other 6 and from the sprite it replaces.

**A note on current UI wiring, for honesty rather than overclaiming**: `spriteCache.getBuilding()` (the function that would draw one of these sprites) has no live call site in `src/main.ts`, `render-loop.ts`, or `city-render-passes.ts` today — it's only exercised by a unit test. Design to the same quality bar as if it were fully wired up (that wiring is a separate follow-up), but go by the sibling sprites in `buildings.tsx` rather than a live in-game screenshot.

**Project**: Conquestoria — an HTML5 Canvas + DOM strategy game built with TypeScript and Vite. Gameplay spans Eras 1–13. Mobile-first, played by families including children.

**Why three of these are different from a normal building**: `national_ai_assurance_program`, `circular_manufacturing_network`, and `mars_robotics_initiative` are **national projects** — empire-wide, one-per-civ, temporary-effect structures. Per this game's design rules, national projects must visually read as empire-scale initiatives, not ordinary local buildings: give them a larger, more monumental composition (a full campus/complex rather than a single structure) and a clear "this is temporary/programmatic" visual cue (e.g. a countdown/program-status readout), distinct from the permanent local buildings around them. The other 4 sprites in this batch are ordinary single buildings and should not adopt this campus treatment.

**Quality bar**: go beyond a bare placeholder silhouette. Include the small hand-crafted details that make every existing sprite in `buildings.tsx` feel intentional rather than generic. At the same time, every added detail must stay subordinate to the one dominant silhouette element named per sprite below (see "Composition discipline") — for the 3 national projects, "dominant" means the largest single element of the campus, not the whole campus at equal weight; the campus reads as a set of one dominant structure plus smaller satellite pieces, the same one-dominant-plus-supporting principle at a bigger scale, not an exception to it.

**Platform**: Web (Canvas 2D + DOM). Sprites are prerendered to `HTMLImageElement` via SVG blob URLs. Repository: https://github.com/a1flecke/conquestoria
</context>

<reference_files>
1. **Sprite system helpers** (`BuildingPlinth`, `Banner`, `FactionPalette` type, full `MATERIAL_PALETTE` constant, `CATEGORY_TINTS`):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/sprite-system.tsx
2. **All existing building sprites, including the `BuildingFrame` helper itself** (`BuildingFrame` is defined locally near the top of this file, around line 25 — it is NOT exported from `sprite-system.tsx`). Read every function, especially the Era 10 national-project trio (`ManhattanProjectSprite`, `PostwarReconstructionSprite`, `SpaceProgramInitiativeSprite`) for how this codebase visually distinguishes a national project from a normal building, and the Era 12 tail (`AutomatedPortSprite` through `TelemedicineHubSprite`, especially `CyberDefenseCenterSprite`, `DataCenterSprite`, `SmartGridSprite`, `RocketProgramSprite`) for the near-future tech idiom:
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/buildings.tsx
3. **CSS animation system**:
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/sprite-animations-v2.css
4. **Sprite catalog** — shows the exact placeholder lines you are replacing (search for "Era 13 content launch"):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/sprite-catalog.ts
</reference_files>

<design_system>
## Visual Language
- **Style**: Flat geometric SVG, slight isometric/2.5D.
- **Line weight**: `stroke="#1f1a14"` (`P.ink.line`) `strokeWidth="1"` main outlines, `0.5–0.8` interior detail.
- **No gradients, no filters, no drop-shadows.**

## Composition discipline: one dominant silhouette, everything else supporting
This is a hard project rule (`.claude/skills/generate-sprite-prompt.md`'s design brief for this
issue): every sprite is "one dominant silhouette plus a supporting prop." For the 4 ordinary
buildings in this batch, apply it exactly as in Part 2. For the 3 national projects, apply it at
campus scale: one dominant structure (the largest, most detailed element) plus a small number of
clearly smaller satellite structures and a compact status readout — never three or more
equally-sized buildings competing for attention. If a national-project composition starts to feel
like a busy diorama, cut a satellite element rather than shrink everything to fit.

## Material Palette (`P.*`)
```
skin:   warm=#d4a373  cool=#b08968  deep=#8a5a3c
cloth:  tunic=#c19a6b  linen=#e6dcc6  wool=#7a6e5b  dye=#5b4a7a
metal:  iron=#5a6068  steel=#8a929b  bronze=#b8895a  gold=#d4a13c  shine=#e8edf2
wood:   light=#c19a6b  mid=#8a6a3a  dark=#5e3f24
stone:  light=#c4b8a4  mid=#9a8e78  dark=#6a5e4a
ground: grass=#7ea860  dirt=#a08260  sand=#d8c896  water=#3a6e94
ink:    line=#1f1a14  soft=#3a3228
```

## Sci-Fi / Modern Accent Palette (established by Era 10–12 sprites — reuse verbatim; write as literal hex strings, they are not `MATERIAL_PALETTE` members)
```
dark tech panel fills:  #181830  #0a0a20  #111122  #112244
status LEDs / glow:      #00aaff (blue-online)  #00ff44 / #00ff88 (green-active)  #ffaa00 (amber-standby)
glass / display surface: #b8d4e8
power / warning accent:  #ffdd00  #ffd700
exhaust / launch flame:  #ff6600  #cc5500
```

## Faction Color Rules
Every sprite receives `palette: FactionPalette` (`{ dark, mid, bright, trim }`). Primary structure fill → `palette.mid`; shadow/trim → `palette.dark`; glow/highlight → `palette.bright`; small heraldic accent → `palette.trim`. **Never hardcode a faction name or hex for faction identity.**

## Building Sprite Contract
```typescript
export function FooSprite({ palette, svgOnly = false }: BuildingSpriteProps): string
```
- ViewBox: `0 0 192 192`. Wrap in `<BuildingFrame label="Name" sub="Sub" category="..." svgOnly={svgOnly}>` — use the exact `label`/`sub`/`category` given per sprite below. `category` must be a real `CATEGORY_TINTS` key: `food`, `production`, `gold`, `science`, `culture`, `military`, `espionage`.
- Always include `<BuildingPlinth w={...} />` and a faction `<Banner ... palette={palette} />`.
- **Available animated effect CSS classes**: `.cq-fire`, `.cq-smoke`/`.cq-smoke--b`/`.cq-smoke--c`, `.cq-spark`/`.cq-spark--b`/`.cq-spark--c`, `.cq-glow`, `.cq-peek`, `.cq-dust`.
- For continuous motion use inline SVG `<animate>`/`<animateTransform>`, subtle only.
- **National projects specifically**: compose a wider, multi-element "campus" (one dominant structure + 1–2 clearly smaller satellite structures/pads within the same 192×192 frame) rather than one single building, and include one explicit "this is a temporary program" visual cue — a status/countdown readout, a program banner across the facade, or similar. See how `SpaceProgramInitiativeSprite`/`ManhattanProjectSprite` achieve this scale in the reference file.

## Animation & motion ownership
`prefers-reduced-motion` handling and any outer state-driven wrapper classes are owned entirely
by the runtime CSS. Do not add reduced-motion handling inside an individual building function —
use `.cq-glow`/`.cq-fire`/etc. class names and inline `<animate>` as documented, and the runtime
takes care of the rest.

## Example — how this codebase composes a national-project "campus" without losing the one-dominant-shape rule (from `SpaceProgramInitiativeSprite`, already in `buildings.tsx`)
<example>
Read the full `SpaceProgramInitiativeSprite`, `ManhattanProjectSprite`, and
`PostwarReconstructionSprite` functions in the `buildings.tsx` reference file before writing
Sprites 5–7 below. Notice that even the largest, busiest national-project sprites still commit to
one dominant element (a mission-control room, a guarded compound, a skyline under construction)
drawn largest and first, with only 2–3 smaller supporting elements around it — none of them use
more than one dominant focal shape. Match that discipline; do not use the larger 192×192 canvas
as license to add more equally-weighted elements.
</example>
</design_system>

<sprites>

## SPRITE 1 — CircularFabricatorSprite (Building)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `OceanRoboticsYardSprite` (the last sprite from Part 2)
**Catalog entry**: replace `circular_fabricator: SmartGridSprite,` with `circular_fabricator: CircularFabricatorSprite,`
**label**: `"Circular Fabricator"`  **sub**: `"Materials Loop"`  **category**: `production`

### Concept
A modular material-recycling loop — closed-cycle fabrication where output feeds back into input. The defining shape is a circular/looped conveyor or material-flow ring, not Smart Grid's transformer-and-power-lines scene.

### Key requirements
- **Dominant silhouette**: a ring-shaped conveyor or closed circuit of connected pipe segments in `P.metal.steel`, visibly closed (start meets end) — this "circular" shape is the single most important read at a glance and must be established first, larger than anything else in the sprite.
- **Supporting detail — material flow**: small material blocks/pellets (rounded rectangles, `palette.mid` and `P.metal.bronze`) at 3–4 points around the loop to imply continuous flow — kept smaller than the loop itself.
- **Supporting detail — fabricator head**: a compact boxy unit with a small nozzle/output slot, `P.stone.dark`, at one point on the loop.
- **Supporting detail — status**: one or two `#00ff44` flow-indicator LEDs at loop junctions; `.cq-spark`/`.cq-spark--b` at the fabricator head.
- `<Banner palette={palette} scale={0.65}>`.
- Tone: efficient, closed-loop, industrial-green — sustainability through engineering, not a power substation.

---

## SPRITE 2 — ModularArcologySprite (Building)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `CircularFabricatorSprite`
**Catalog entry**: replace `modular_arcology: DataCenterSprite,` with `modular_arcology: ModularArcologySprite,`
**label**: `"Modular Arcology"`  **sub**: `"Dense Housing"`  **category**: `food`
**Note**: `requiresBuildings: ['transplant_hospital', 'factory']` — a special building per `.claude/rules/game-balance.md`, may lean on two thematic elements (housing density + industry) since it's condition-gated.

### Concept
Tall interlocking residential/industrial modules — a dense vertical arcology block built from visibly distinct stacked/interlocking cuboid modules (some glowing warm as living space, some darker as production space), replacing Data Center's server-rack rows with a housing silhouette entirely.

### Key requirements
- **Dominant silhouette**: the whole interlocking-module tower — 6–10 rectangular modules of varying size, offset/staggered (not a uniform grid) so they visibly "interlock," treated as ONE tall composite shape rather than several separate buildings. This tower silhouette must read first, distinct from Data Center's flat rack-row pattern.
- **Supporting detail — mixed-use contrast**: within that one tower, some modules `#e6dcc6`/`P.cloth.linen` warm-lit (residential, small warm window dots), others `P.stone.dark`/`P.metal.steel` (industrial, small `#00aaff` status dot) — this mixed-use contrast lives *inside* the dominant tower shape, it is not a second silhouette.
- **Supporting detail — connectors**: thin connecting walkways/bridges between module clusters, `P.metal.iron`; a central vertical core/spine tying the modules together, `P.stone.mid`.
- **Supporting detail — window glow**: a few small warm window dots (`P.metal.gold`, low opacity) scattered on residential modules.
- `<BuildingPlinth w={130} />` — should read as *tall*, narrower footprint than most food buildings.
- `<Banner palette={palette} scale={0.65}>` near the top of the core spine.
- Tone: dense, vertical, mixed-use — a self-contained micro-city block.

---

## SPRITE 3 — CarbonCaptureGridSprite (Building)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `ModularArcologySprite`
**Catalog entry**: replace `carbon_capture_grid: SmartGridSprite,` with `carbon_capture_grid: CarbonCaptureGridSprite,`
**label**: `"Carbon Capture Grid"`  **sub**: `"Restorative Industry"`  **category**: `production`
**Note**: `requiresBuildings: ['factory', 'environmental_agency']` — special building, two thematic elements allowed.

### Concept
Capture stacks and a pipeline/grid network drawing emissions in and locking carbon away — must read as distinct restorative infrastructure, NOT a generic power plant (the issue explicitly calls this out). No cooling towers, no smokestacks emitting visible smoke — instead, stacks that visibly *pull inward*, and a pipeline grid running to a sequestration point.

### Key requirements
- **Dominant silhouette**: 2–3 slim vertical capture stacks (NOT wide cooling towers) in `P.metal.steel`, each with a filter/mesh cap and small inward-pointing chevron marks near the intake implying air being drawn IN, not smoke going out. This inward-flow read is the critical differentiator from "generic power plant" and must be the first thing read.
- **Supporting detail — pipeline network**: pipes (`P.metal.iron`) running from the stacks to a sequestration node — a small hatched circle or "sealed vault" hatch shape, `P.stone.dark` — kept lower-profile than the stacks.
- **Supporting detail — control building + green accent**: a small control building, `P.stone.mid`, one `#00ff44` active-capture status light; optionally a few small green accents (`P.ground.grass`) reinforcing "restorative," echoing `EnvironmentalAgencySprite` without copying its composition.
- No `.cq-smoke` (that would read as emitting, the opposite of this building's purpose) — if you want a particle effect, use small upward chevron/arrow ticks near the stack intakes instead.
- `<Banner palette={palette} scale={0.65}>`.
- Tone: restorative, green-industrial — pulling carbon down, not a power plant pushing pollution up.

---

## SPRITE 4 — ImmersiveArtsLabSprite (Building)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `CarbonCaptureGridSprite`
**Catalog entry**: replace `immersive_arts_lab: BroadcastTowerSprite,` with `immersive_arts_lab: ImmersiveArtsLabSprite,`
**label**: `"Immersive Arts Lab"`  **sub**: `"Interactive Arts"`  **category**: `culture`

### Concept
A cultural studio built around a projection dome and light-sculpture installation — a rounded geodesic/projection dome as the defining silhouette, replacing Broadcast Tower's tall transmission mast entirely with something low, rounded, and artistic.

### Key requirements
- **Dominant silhouette**: a rounded geodesic dome (a hemisphere built from a handful of visible triangular facets) in `P.stone.light`/translucent `#b8d4e8`, with an interior glow visible through the panels. This rounded-dome shape is the opposite of Broadcast Tower's tall mast and must read first.
- **Supporting detail — light sculpture**: 2–3 thin vertical light beams or a floating abstract light shape beside/above the dome, `palette.bright`/`#ffdd00`, low opacity — kept subordinate to the dome itself.
- **Supporting detail — studio wing**: a small entrance wing beside the dome, `P.stone.mid`, one or two windows with a warm `.cq-glow`.
- **Supporting detail — plaza**: a ground-level reflecting pool or plaza strip in front, `P.ground.water`/light blue.
- `.cq-glow` on the dome interior for a soft pulsing "installation is active" feel.
- `<Banner palette={palette} scale={0.65}>` beside the studio wing (not atop the dome, to keep the dome's rounded silhouette clean).
- Tone: contemplative, artistic, luminous — an immersive gallery, not a transmission tower.

---

## SPRITE 5 — NationalAiAssuranceProgramSprite (National Project)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `ImmersiveArtsLabSprite`
**Catalog entry**: replace `national_ai_assurance_program: CyberDefenseCenterSprite,` with `national_ai_assurance_program: NationalAiAssuranceProgramSprite,`
**label**: `"National AI Assurance Program"`  **sub**: `"National Project"`  **category**: `science`

### Concept
An empire-scale AI-standards and assurance campus — a larger, more monumental relative of `AiSafetyInstituteSprite` (Part 2), not a copy of it. Per the national-project campus guidance above: compose this as one dominant assurance hall plus a small number of clearly smaller satellite pieces, with a visible "program status" readout, since this project's effect is explicitly temporary (fades after era `homeEra + 2`).

### Key requirements
- **Dominant silhouette**: a wide, columned central assurance hall (larger footprint than any single Part 2 building), `P.stone.light`, with the same rounded shield-and-checkmark motif as `AiSafetyInstituteSprite` scaled up and centered above the entrance — reinforcing the family resemblance while reading as clearly bigger/national in scope. This hall is the one dominant element the whole composition organizes around.
- **Supporting detail — satellite pavilions**: 1–2 smaller flanking structures connected by a short covered walkway (`P.stone.mid` columns), each visibly smaller than the main hall, each with a small `#00aaff` status screen.
- **Supporting detail — program status readout**: a banner, plaque, or screen on the facade showing an abstract progress/status bar (a rectangle partially filled — NOT literal text/numbers, per the no-text-as-image rule) signaling "this is an active time-limited program."
- `.cq-glow` on the shield emblem and the status readout.
- `<BuildingPlinth w={175} />` — wider than the single-building Part 2 sprites, to read as a campus.
- `<Banner palette={palette} scale={0.75}>` — larger than typical, for empire-scale presence, placed on the dominant hall.
- Tone: authoritative, national, temporary-but-significant — bigger and more ceremonial than the local AI Safety Institute, never a copy-paste of it.

---

## SPRITE 6 — CircularManufacturingNetworkSprite (National Project)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `NationalAiAssuranceProgramSprite`
**Catalog entry**: replace `circular_manufacturing_network: SmartGridSprite,` with `circular_manufacturing_network: CircularManufacturingNetworkSprite,`
**label**: `"Circular Manufacturing Network"`  **sub**: `"National Project"`  **category**: `production`

### Concept
An empire-scale connected fabrication/logistics network — the national-scale sibling of `CircularFabricatorSprite` (Part 2), but composed as a network of multiple fabrication nodes linked by visible logistics lines, not a single closed loop. This is where "network," not just "circular," must dominate the composition.

### Key requirements
- **Dominant silhouette**: one larger central fabrication node (a bigger echo of `CircularFabricatorSprite`'s ring shape, roughly double the scale of the satellite nodes below) — this central node, not the network of lines, is the element that must read first and largest.
- **Supporting detail — satellite nodes**: two smaller fabricator-loop nodes (~40–50px each, clearly smaller than the central node) positioned across the frame.
- **Supporting detail — logistics lines**: connecting lines/pipes (`P.metal.steel`) linking the three nodes in a hub-and-spoke pattern from the central node — this network topology is the key differentiator from the single-loop local Fabricator, but the lines themselves stay thinner/quieter than any of the three nodes.
- **Supporting detail — status**: `.cq-spark`/`.cq-spark--b` at each fabrication node; a "program status" readout (abstract progress bar, same convention as Sprite 5) on the central node.
- `<BuildingPlinth w={175} />`.
- `<Banner palette={palette} scale={0.75}>` on the central node.
- Tone: expansive, networked, industrial-green — an empire-wide production web organized around one clear hub, not three equal buildings.

---

## SPRITE 7 — MarsRoboticsInitiativeSprite (National Project)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `CircularManufacturingNetworkSprite`
**Catalog entry**: replace `mars_robotics_initiative: RocketProgramSprite,` with `mars_robotics_initiative: MarsRoboticsInitiativeSprite,`
**label**: `"Mars Robotics Initiative"`  **sub**: `"National Project"`  **category**: `science`

### Concept
A national launch-and-robotics complex focused on a Mars mission — must clearly exceed `RocketProgramSprite` (Era 10's early test-rocket-on-a-gantry scene) in scale and specificity: a full launch complex with a visible Mars-mission identity (a red-planet motif on a mission patch, a rover payload visible before launch), not a generic rocket.

### Key requirements
- **Dominant silhouette**: a taller, more modern launch gantry (`P.metal.steel`, more refined than Rocket Program's early scaffold) beside a sleek modern rocket body (`palette.mid`, `P.metal.shine` nose cone) — larger and more advanced-looking than `RocketProgramSprite`. This gantry+rocket pairing is the one dominant element everything else supports.
- **Supporting detail — Mars mission identity**: a small red-orange planet roundel (a simple circle, `#c0522a` or similar, with 1–2 thin surface-feature lines) on the rocket fairing or a mission banner beside the gantry — the single element that makes it read as "Mars," not just "a rocket." Keep it small — a patch, not a second focal shape.
- **Supporting detail — rover payload**: a small wheeled rover (a boxy chassis on 4–6 small wheel circles, an antenna mast) visible in a payload bay or beside the gantry pre-launch, clearly smaller than the rocket.
- **Supporting detail — status + launch pad**: an abstract program-status readout (same convention as Sprites 5–6) on the control building at the gantry base; a launch-pad flame trench at the base, `P.stone.dark`, with a small static `#ff6600`/`#cc5500` exhaust-glow accent (pre-launch readiness, not an active launch).
- `<BuildingPlinth w={175} />`.
- `<Banner palette={palette} scale={0.75}>` on the gantry.
- Tone: ambitious, national-scale, forward-looking — a real Mars program, distinct from any earlier-era generic rocket sprite.

</sprites>

<output_format>
Output one `export function FooSprite(...)` per sprite, in the order above, ready to paste into `buildings.tsx`. State the exact single-line catalog replacement for each (already given above). Output one sprite at a time, pausing for confirmation between each, unless told otherwise.
</output_format>

<style_checklist>
- [ ] ViewBox `0 0 192 192`, wrapped in `<BuildingFrame label="..." sub="..." category="...">` using the exact label/sub/category given per sprite
- [ ] `<BuildingPlinth w={...} />` and a faction `<Banner palette={palette} .../>` present
- [ ] Exactly one dominant silhouette per sprite (named in its spec) — for the 3 national projects, one dominant structure plus clearly smaller satellites, never several equally-weighted buildings
- [ ] All faction color via `palette.mid` / `palette.dark` / `palette.bright` / `palette.trim` — zero hardcoded faction hex
- [ ] Sci-fi accent colors use the literal hex values from the Sci-Fi/Modern Accent Palette above
- [ ] The three national projects (Sprites 5–7) are visibly larger/campus-scale and each includes an explicit temporary-program status readout — they must NOT look like an ordinary single local building
- [ ] Silhouette is unmistakably distinct from the Era 12 sprite it replaces AND from every other sprite in this batch AND from the 8 batch A buildings already shipped
- [ ] No photorealism, gradients, blur filters, embedded raster images, or SVG `<text>` used as in-world signage
- [ ] No reduced-motion handling or state-driven wrapper classes added inside the sprite function
- [ ] Reads clearly at the same effective scale as the sibling sprites already in `buildings.tsx`
</style_checklist>
