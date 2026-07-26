# Claude Design Prompt: Conquestoria Sprites

**This file currently contains exactly one active prompt: Era 13 content-launch sprite
replacements (issue #652).** Everything that used to live here — the original economy-sprite
batch (Caravan/Expedition/Caravanserai/Bank/Stock Exchange/Resource Outpost), the terrain-tiles
prompt, the naval transport sprites (Carrack/Galleon/Steamship/Troop Transport), the legendary
beast prompt, and the rail-segment addendum — has been **removed from this file because all of it
is already implemented and shipped**, verified directly against the source (real, non-placeholder
`export function` sprites in `units.tsx`/`buildings.tsx`/`beasts.tsx`, `terrain-tiles.ts` fully
wired into `main.ts`, `rail-segment-marker.ts` implemented). Re-running any of those against
Claude Design regenerates work that's already done — that happened twice this session (terrain,
naval transport) before this cleanup. If you need the history of those old prompts, they're in
this file's git history before this cleanup commit; there's no reason to resurrect them here.

**Going forward:** when a new sprite/terrain/prompt need is identified, use the
`.claude/skills/generate-sprite-prompt.md` skill to generate it, and append it to this file the
same way the Era 13 section below was added — dated, scoped to the specific issue, and removed
from this file once shipped (matching this same cleanup) rather than left to accumulate.

---

# === ERA 13 CONTENT-LAUNCH SPRITE REPLACEMENTS (#652) — 2026-07-19, revised 2026-07-19 ===

## Developer Instructions (do not copy this section into Claude)

Issue: https://github.com/a1flecke/conquestoria/issues/652 — replaces the 20 temporary alias
mappings in `sprite-catalog.ts` shipped by #515 (Era 13 content launch) with unique, production
SVG components. Audited base: `22e176e067986ea9ec5f79fb9c3938d48553014b` (`origin/main`).

**Revision note**: this section was checked against Anthropic's published Claude Design and
prompt-engineering guidance (multishot examples, XML structuring, explicit quality modifiers,
Goal/Layout/Content/Audience framing) and against the live codebase, and four inaccuracies from
the first draft were corrected:
1. `BuildingFrame` is a **local helper defined inside `buildings.tsx`** (line ~25), not exported
   from `sprite-system.tsx` — the reference-file list below now attributes it correctly.
2. `SpriteFrame` **automatically wraps every unit's children** in `<g class="cq-sprite-figure">` —
   sprite authors never add that class themselves. The first draft listed it as a class to assign,
   which was wrong; only assign the finer-grained limb classes, and only on `<Humanoid>`-based
   figures.
3. The issue's own acceptance criteria require the five units to "remain distinct at **32px**,"
   not 40px — the audience/size guidance below is corrected to match.
4. **Building sprites currently have no live renderer call site.** `spriteCache.getBuilding()` in
   `src/renderer/sprites/sprite-loader.ts` is exercised only by `tests/renderer/sprites/sprite-loader.test.ts`
   — grepping `src/main.ts`, `render-loop.ts`, and `city-render-passes.ts` turns up zero calls to it,
   unlike `spriteCache.getUnit()` which `unit-renderer.ts` calls on every frame. The production
   chooser, queue, and city panel most likely still render `PRODUCTION_ICONS` emoji today. Treat
   the 192×192 SVG as the established **asset contract** (correct format, correct catalog
   registration, ready for whenever a UI surface consumes it) rather than asserting it is already
   visibly live everywhere the issue's acceptance criteria describe — the prompt below no longer
   overclaims this. **This dead-call-site gap is a separate, pre-existing issue outside #652's
   art-only scope** — flag it for a follow-up if you want it wired up; do not fold it into this
   sprite-replacement change.

This batch has **three independent parts** — paste each into its own Claude Design conversation
(20 sprites in one conversation risks truncated/rushed output, and per Claude's prompt-engineering
guidance, focused prompts with fewer competing instructions produce more reliable output):

- **Part 1 (5 unit sprites, 128×128):** `combat_drone`, `autonomous_frigate`, `exosuit_infantry`,
  `propagandist`, `drone_controller`. Output goes into `src/renderer/sprites/units.tsx`.
- **Part 2 (8 building sprites, 192×192 — batch 1):** `network_operations_center`,
  `ai_safety_institute`, `drone_fabricator`, `electronic_warfare_array`, `civic_media_forum`,
  `vertical_farm`, `neural_rehabilitation_center`, `ocean_robotics_yard`. Output goes into
  `src/renderer/sprites/buildings.tsx`.
- **Part 3 (7 building/national-project sprites, 192×192 — batch 2):** `circular_fabricator`,
  `modular_arcology`, `carbon_capture_grid`, `immersive_arts_lab`,
  `national_ai_assurance_program`, `circular_manufacturing_network`, `mars_robotics_initiative`.
  Output goes into `src/renderer/sprites/buildings.tsx`.

Each part below is **fully self-contained** — paste everything from `<role>` through
`</style_checklist>` for that part into a fresh Claude Design conversation. If the repository is
private and raw GitHub URLs 403, attach these files instead: `src/renderer/sprites/sprite-system.tsx`,
`units.tsx`, `buildings.tsx`, `src/assets/sprite-animations-v2.css`, `src/renderer/sprites/sprite-catalog.ts`.

**What to do with the output**:
1. Insert each function into the file/anchor named in its spec (Part 1 → `units.tsx` after
   `MissileSubmarineSprite`; Part 2 → `buildings.tsx` after `TelemedicineHubSprite`; Part 3 →
   `buildings.tsx` after the Part 2 block you just added, i.e. after `OceanRoboticsYardSprite`).
2. Replace the corresponding placeholder line in `UNIT_SPRITE_CATALOG` / `BUILDING_SPRITE_CATALOG`
   in `src/renderer/sprites/sprite-catalog.ts` (exact replacement lines given in each spec below —
   do **not** touch `UNIT_MOTION_STYLES`, it's already correctly configured for these 5 units).
3. Remove the `// Era 13 content launch: temporary thematically-close mappings...` comment block
   above the building catalog entries once all 15 are replaced (see `.claude/rules/wonder-content.md`-
   style hygiene — stale placeholder comments must go once the swap lands).
4. Update `docs/sprite-design-system.md`'s asset inventory table only after the replacements are
   live in the same PR, per the issue's acceptance criteria.
5. Run the catalog completeness tests (`tests/renderer/sprites/sprite-catalog.test.ts`) plus any
   new alias-rejection tests the issue's acceptance criteria call for.

---

## Prompt — PART 1: UNITS (copy everything below this line, through the end of Part 1's `</style_checklist>`)

<role>
You are a senior SVG sprite artist and TypeScript developer specializing in hand-crafted game graphics. You write clean, geometric SVG in JSX-based TypeScript — no photorealism, no gradient meshes, no blur filters, no embedded raster images. Your work integrates directly into a production codebase.
</role>

<context>
**Goal**: replace 5 temporary Era 13 unit sprites — currently exact visual reuses of older-era units — with distinct, production-quality silhouettes that fit the game's existing hand-drawn flat-geometric style.

**Layout**: each sprite is a standalone 128×128 SVG rendered onto a hex tile at 32–120px, viewed from a slight 2.5D angle (facing right, slightly toward viewer) — the same layout every existing unit sprite uses.

**Content**: 5 units — Combat Drone (an autonomous UAV), Autonomous Frigate (unmanned naval hull), Exosuit Infantry (powered-armor soldier), Propagandist (civilian broadcaster), Drone Controller (field operator with a companion micro-drone). Full per-unit specs are in `<sprites>` below.

**Audience**: children and adults playing a mobile-first family strategy game. Silhouettes must be instantly recognizable and stay visually distinct from each other and from the sprite each currently reuses, down to 32px (this is the game's smallest unit-render scale and the literal bar set by this issue's acceptance criteria — do not design only for a larger comfortable size and assume it scales down cleanly).

**Project**: Conquestoria — an HTML5 Canvas + DOM strategy game built with TypeScript and Vite. Gameplay spans Eras 1–13, from Stone Age to a near-future "Information Age." All game sprites are inline SVG generated by JSX functions, rendered into Canvas via cached `<img>` elements.

**Why this batch is distinct from most of the catalog**: Era 13 is the newest, most futuristic era — autonomous drones, exosuit infantry, AI-safety institutes, Mars robotics. These five units currently render as **exact reuses of older-era sprites** (Combat Drone reuses the WWII Jet Fighter silhouette, Autonomous Frigate reuses the 19th-century Ironclad, etc.) as a temporary launch placeholder. Stay inside the game's established flat-geometric visual language, but use the sci-fi accent colors already introduced by the Era 10–12 sprites (see `<design_system>` below) rather than defaulting to purely medieval-earthy tones — these must read as near-future tech.

**Quality bar**: go beyond a bare placeholder silhouette. Include the small hand-crafted details — a rivet line, a panel seam, a single status light, a texture accent — that make every existing sprite in `units.tsx` feel intentional rather than generic. At the same time, every added detail must stay subordinate to the one dominant silhouette element named per sprite below (see "Composition discipline") — more detail should read as *texture on* the dominant shape, never as a second competing focal point.

**Platform**: Web (Canvas 2D + DOM). Sprites are prerendered to `HTMLImageElement` via SVG blob URLs. CSS animations drive idle/walk/attack states, entirely from the outside — see "Animation & motion ownership" below. Repository: https://github.com/a1flecke/conquestoria
</context>

<reference_files>
Read all of the following before writing any code — they define the entire visual language, helper components, material palette, and animation system you must match:

1. **Sprite system helpers** (`SpriteFrame`, `Humanoid`, `Banner`, `Shadow`, `HexBase`, `FactionPalette` type, full `MATERIAL_PALETTE` constant — note `BuildingFrame` is NOT here, it lives in `buildings.tsx`, irrelevant to this unit-only part):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/sprite-system.tsx
2. **All existing unit sprites** — read every function, but pay special attention to the Era 9–11 tail (`JetFighterSprite`, `CarrierSprite`, `AttackHelicopterSprite`, `MissileSubmarineSprite`) for the established sci-fi/military-tech idiom, and to `MissionarySprite` / `SpyHackerSprite` for humanoid civilian/spy conventions:
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/units.tsx
3. **CSS animation system** — all keyframes and class hooks. Confirms that `data-state`, `prefers-reduced-motion` handling, and the outer `cq-v2` wrapper class are applied by the runtime DOM overlay, never by the sprite SVG itself:
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/sprite-animations-v2.css
4. **Sprite catalog** — shows the exact placeholder lines you are replacing (search for "Era 13 temporary launch silhouettes"):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/sprite-catalog.ts
</reference_files>

<design_system>
## Visual Language
- **Style**: Flat geometric SVG. Slight isometric/2.5D — figures/vehicles face right, slightly toward viewer.
- **Line weight**: `stroke="#1f1a14"` (`P.ink.line`) at `strokeWidth="1"` for main outlines; `0.5–0.8` for interior detail.
- **No gradients, no filters, no drop-shadows.** Single highlight layer at `opacity="0.3–0.5"`.

## Composition discipline: one dominant silhouette, everything else supporting
This is a hard project rule (`.claude/skills/generate-sprite-prompt.md`'s design brief for this
issue): every sprite is "one dominant silhouette plus a supporting prop," never several
competing focal shapes. Each of the 5 sprite specs below opens its **Key requirements** with a
line labeled **Dominant silhouette** — that is the one shape that must read first, even in flat
grey silhouette form, at 32px. Every other bullet is labeled **Supporting detail** and must stay
visually smaller/quieter than the dominant shape — it should read as a clarifying accent, not a
second thing competing for the eye. If in doubt, cut a supporting detail rather than let it
rival the dominant silhouette.

## Material Palette (use as `P.*` — imported as `MATERIAL_PALETTE as P`)
```
skin:   warm=#d4a373  cool=#b08968  deep=#8a5a3c
cloth:  tunic=#c19a6b  linen=#e6dcc6  wool=#7a6e5b  dye=#5b4a7a
metal:  iron=#5a6068  steel=#8a929b  bronze=#b8895a  gold=#d4a13c  shine=#e8edf2
wood:   light=#c19a6b  mid=#8a6a3a  dark=#5e3f24
stone:  light=#c4b8a4  mid=#9a8e78  dark=#6a5e4a
ground: grass=#7ea860  dirt=#a08260  sand=#d8c896  water=#3a6e94
ink:    line=#1f1a14  soft=#3a3228
```

## Sci-Fi / Modern Accent Palette (introduced by Era 10–12 sprites — reuse these exact hex values verbatim for Era 13 continuity; they are NOT in `MATERIAL_PALETTE`, write them as literal hex strings same as the existing code does)
```
dark tech panel fills:  #181830  #0a0a20  #111122  #112244
status LEDs / glow:      #00aaff (blue-online)  #00ff44 / #00ff88 (green-active)  #ffaa00 (amber-standby)
glass / display surface: #b8d4e8
heat / exhaust / afterburner: #ff6600  #cc5500
warning / power accent:  #ffdd00  #ffd700
```

## Faction Color Rules
Every sprite receives `palette: FactionPalette` (`{ dark, mid, bright, trim }`).
- Primary hull/armor/chassis fill → `palette.mid`
- Belt/shadow/panel-line/undercarriage → `palette.dark`
- Highlight/sensor-glow/status-light/gem → `palette.bright`
- Faction pennant/roundel/small heraldic accent → `palette.trim`
- **Never hardcode a faction name or a specific hex color for faction identity.** The sci-fi accent hex values above are for *non-faction* tech details (screens, LEDs, exhaust) — faction identity always flows through `palette.*`.

## Unit Sprite Contract
```typescript
export function FooSprite({ palette, svgOnly = false }: UnitSpriteProps): string
```
- ViewBox: `0 0 128 128`. Wrap in `<SpriteFrame svgOnly={svgOnly}>` — do NOT write a raw `<svg>` tag.
- Always include `<Shadow />` (adjust `cx`/`cy`/`rx`/`ry` to match silhouette footprint, see `IroncladSprite`/`JetFighterSprite` for naval/air shadow proportions).
- Use `<Humanoid cx={64} cy={70} ...>` as the base for humanoid figures (exosuit, propagandist, drone controller) — armor/gear layers as additional shapes over/around it, same technique `MachineGunnerSprite`/`SpyHackerSprite` use for helmets, packs, and held gadgets.
- Use `<Banner ... palette={palette} />` for a faction pennant/roundel — this is always a **supporting detail**, never the dominant silhouette.
- **`SpriteFrame` automatically wraps everything you return in `<g class="cq-sprite-figure">`** (see its source in `sprite-system.tsx`) — do not add that class yourself. Only assign the finer-grained classes, and only where they apply: `cq-arm-l`, `cq-arm-r`, `cq-leg-l`, `cq-leg-r`, `cq-weapon`, `cq-cape` exist for `<Humanoid>`-based figures with discrete limbs (Exosuit Infantry, Propagandist, Drone Controller). Vehicle sprites with no limbs (Combat Drone, Autonomous Frigate) need none of these class names — follow `JetFighterSprite`/`IroncladSprite`, which set none.
- No explicit `data-kind` attribute is required on these five (follow the precedent of the sprites they replace — `IroncladSprite`, `JetFighterSprite`, `MachineGunnerSprite`, `MissionarySprite`, `SpyHackerSprite` — none of which set one); `UNIT_MOTION_STYLES` in `sprite-catalog.ts` already correctly maps each of these five types to its motion style (`air`, `naval`, `humanoid` default) and does not need to change.

## Animation & motion ownership
All idle/walk/attack states, `prefers-reduced-motion` handling, and the outer `cq-v2` wrapper
class are applied by the runtime DOM sprite overlay (`sprite-overlay.ts`), never by the sprite
function you write. Do not add `data-state`, a `cq-v2` class, or any reduced-motion handling
yourself — it would be redundant at best and could conflict with the overlay's own attributes at
worst. Your only job is to assign the plain class names listed above where a sprite has a
matching moving part; the CSS file and the overlay wire everything else automatically.

## Example — matching the existing sci-fi/military idiom (from `JetFighterSprite`, already in `units.tsx`)
<example>
```tsx
export function JetFighterSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={110} rx={48} ry={4} />
      {/* fuselage — sleek tapered body */}
      <path d="M64,30 L72,58 L70,80 L58,80 L56,58 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1.2" />
      {/* swept wings */}
      <path d="M64,55 L8,78 L12,88 L64,68 L116,88 L120,78 Z" fill={palette.bright} stroke={P.ink.line} strokeWidth="1" />
      {/* afterburner glow */}
      <ellipse cx="64" cy="88" rx="5" ry="10" fill="#ff6600" opacity="0.7" />
      <Banner x={64} y={16} palette={palette} scale={0.6} />
    </SpriteFrame>
  );
}
```
Note the pattern this demonstrates: one dominant shape (the fuselage+wing silhouette, drawn first, largest), a small number of supporting details (nose cone, cockpit, afterburner glow — each a single shape, not a cluster), faction color only on `palette.*` fills, and the sci-fi accent `#ff6600` used as a literal hex string exactly as documented above. Match this density — not sparser, not busier.
</example>
</design_system>

<sprites>

## SPRITE 1 — CombatDroneSprite (Unit)

**Insert into**: `src/renderer/sprites/units.tsx`, after `MissileSubmarineSprite` (end of file)
**Catalog entry**: replace `combat_drone: withMotion('combat_drone', JetFighterSprite),` with `combat_drone: withMotion('combat_drone', CombatDroneSprite),` in `sprite-catalog.ts`
**data-kind context**: air (motion style already set)

### Concept
A compact autonomous combat UAV — small, boxy, and mechanical, nothing like a manned jet. A central sensor pod with a glowing camera "eye" sits at the nose, flanked by two paired ducted-fan rotors (quadcopter-style, not swept wings) that lift it. A small under-slung precision payload (a single stubby missile or camera/targeting pod) hangs beneath. No cockpit, no pilot, no afterburner — it must read as unmanned at a glance, the opposite silhouette of `JetFighterSprite`.

### Key requirements
- **Dominant silhouette**: the central chassis + its glowing sensor eye. A short, flat-sided hexagonal or rounded-rectangle body in `palette.mid` with `P.metal.steel` panel-seam lines, and a circular lens on the nose — `#0a0a20` housing with a glowing `#00aaff` iris. This eye is the single most important read at 32px; everything else must stay visually quieter than it.
- **Supporting detail — ducted fans**: two pairs of ring-shaped ducted fans (4 total, or 2 if space is tight) in `P.metal.iron`/`P.metal.steel` with thin blade lines inside, positioned symmetrically around the chassis — NOT swept aircraft wings, and kept smaller/lower-contrast than the sensor eye.
- **Supporting detail — payload pod**: a small stubby cylinder/box in `P.metal.iron` underneath, one `palette.bright` status LED.
- **Supporting detail — faction identity**: a small `<Banner scale={0.5}>` or a thin `palette.trim` stripe on the chassis — small, since this is a machine, not a flag-bearer.
- Optional supporting detail: a thin antenna or sensor whisker off the rear, `P.metal.steel`.
- Tone: cold, mechanical, purposeful. No warmth, no crew — the antithesis of every earlier-era unit's hand-made feel.

---

## SPRITE 2 — AutonomousFrigateSprite (Unit)

**Insert into**: `src/renderer/sprites/units.tsx`, after `CombatDroneSprite`
**Catalog entry**: replace `autonomous_frigate: withMotion('autonomous_frigate', IroncladSprite),` with `autonomous_frigate: withMotion('autonomous_frigate', AutonomousFrigateSprite),` in `sprite-catalog.ts`
**data-kind context**: naval (motion style already set)

### Concept
A low, unmanned naval frigate — sleek and faceted like a real-world stealth hull, nothing like the riveted iron slab of `IroncladSprite`. No smokestack, no visible crew, no gun turrets with barrels — instead a flush deck, a slim radar/sensor mast, and a single remote weapon module. It should look like it drives itself.

### Key requirements
- **Dominant silhouette**: the low, angular faceted hull — straight diagonal panel lines meeting at sharp angles (stealth-ship faceting), not `IroncladSprite`'s rounded riveted slab. Fill `palette.mid`, seams in `P.metal.steel`. This faceted-wedge shape alone must read as "not Ironclad" even in flat grey silhouette.
- **Supporting detail — sensor mast**: replaces the smokestack entirely. A thin vertical `P.metal.steel` mast topped with a small flat phased-array panel (`#112244` fill, thin `#00aaff` scan-line accents) instead of a rotating dish — must stay lower-profile than the hull.
- **Supporting detail — remote turret**: one small unmanned weapon module amidships, a low box on a ring mount in `P.metal.iron`, no visible barrel crew, one `palette.bright` targeting-sensor dot.
- **Supporting detail — waterline + wake**: a thin low-opacity `palette.bright` waterline stripe, plus bow/stern wake using the same white curved-line technique as `MissileSubmarineSprite`.
- Small faction `<Banner>` on the mast — subordinate to the hull silhouette; this is a warship, not ceremonial.
- Tone: low-profile, stealthy, unmanned. Should read as clearly distinct from Ironclad's boxy riveted-iron silhouette even in flat grey silhouette form.

---

## SPRITE 3 — ExosuitInfantrySprite (Unit)

**Insert into**: `src/renderer/sprites/units.tsx`, after `AutonomousFrigateSprite`
**Catalog entry**: replace `exosuit_infantry: withMotion('exosuit_infantry', MachineGunnerSprite),` with `exosuit_infantry: withMotion('exosuit_infantry', ExosuitInfantrySprite),` in `sprite-catalog.ts`
**data-kind context**: humanoid (motion style already set)

### Concept
A human soldier wearing a powered exoskeleton frame — bulkier and more mechanical than `MachineGunnerSprite`'s WWI-era infantryman, but still clearly a person inside armor (not a robot). Hydraulic-jointed limb frames overlay a `<Humanoid>` base, a plated torso shell, and a recognizable held weapon — this is Conquestoria's late-game line-infantry apex, distinct from both Tank (a vehicle) and Machine Gunner (unarmored).

### Key requirements
- **Dominant silhouette**: the armored torso plate over the `<Humanoid cx={64} cy={70} scale={1.05} ...>` base — a segmented chest/shoulder shell in `palette.mid`, `P.metal.steel` trim, riveted or paneled seams. A person is still visibly inside; this is armor, not a mech. This bulked-up torso silhouette is what must read first at 32px.
- **Supporting detail — hydraulic limb frame**: visible exoskeleton struts running alongside the arms/legs — thin parallel lines or narrow rectangles in `P.metal.iron`, small piston/joint circles (`P.metal.steel`) at elbow and knee. Keep these thin so they read as struts on the dominant torso, not a second silhouette.
- **Supporting detail — helmet**: an enclosed visor helmet (not a soft cap) — dark `#0a0a20` visor with a thin `palette.bright` HUD-line accent, `palette.dark` shell.
- **Supporting detail — weapon**: either a held rifle bulkier than `RiflemanSprite`'s, or a powered gauntlet with a glowing knuckle accent (`palette.bright`) — pick exactly one, keep it a single strong read, don't add both.
- **Supporting detail — power unit**: a small rounded backpack box between the shoulders, `P.metal.iron`, one `#00ff44` status light.
- `cq-arm-l`/`cq-arm-r`/`cq-leg-l`/`cq-leg-r`/`cq-weapon` class names on the corresponding `<Humanoid>`-derived parts, per the Unit Sprite Contract above.
- Small faction `<Banner scale={0.6}>`.
- Tone: heavy, powerful, still human — armored muscle, not a drone or a tank.

---

## SPRITE 4 — PropagandistSprite (Unit)

**Insert into**: `src/renderer/sprites/units.tsx`, after `ExosuitInfantrySprite`
**Catalog entry**: replace `propagandist: withMotion('propagandist', MissionarySprite),` with `propagandist: withMotion('propagandist', PropagandistSprite),` in `sprite-catalog.ts`
**data-kind context**: humanoid civilian (motion style already set)

### Concept
A civilian information operator — modern dress, not robes, carrying a portable speaker/projector rig instead of `MissionarySprite`'s censer. Clearly non-combat, clearly modern, clearly a public communicator rather than a religious figure. Think: a field broadcaster or activist with amplification gear.

### Key requirements
- **Dominant silhouette**: the `<Humanoid cx={64} cy={70} scale={1} ...>` base in plain modern civilian clothing (a jacket/vest in `P.cloth.wool` or a muted modern tone, NOT `MissionarySprite`'s linen robe) with **no hat/hood** — bare head or a simple cap. The bare-headed modern-dress read, at a glance, is what separates this from Missionary's robed-hood silhouette.
- **Supporting detail — speaker/projector**: a rectangular device slung over one shoulder or held out, `P.metal.iron` casing, a small round speaker cone or lens (`#0a0a20` housing with a `palette.bright` glow ring) — this fully replaces Missionary's swinging censer, but must stay smaller than the figure itself.
- **Supporting detail (optional)**: a thin antenna or a small handheld screen/tablet in the other hand, `#112244` screen fill with a thin bright scan-line — only add this if the speaker prop above doesn't already crowd the silhouette.
- Clear non-combat stance: open hand or gesturing pose, no weapon, no shield — same peaceful posture spirit as `CaravanSprite`'s merchant.
- Small `<Banner scale={0.55}>` — subdued, civilian, not a religious pennant.
- Tone: modern, persuasive, civic — a public-facing communicator, not a preacher and not a soldier.

---

## SPRITE 5 — DroneControllerSprite (Unit)

**Insert into**: `src/renderer/sprites/units.tsx`, after `PropagandistSprite`
**Catalog entry**: replace `drone_controller: withMotion('drone_controller', SpyHackerSprite),` with `drone_controller: withMotion('drone_controller', DroneControllerSprite),` in `sprite-catalog.ts`
**data-kind context**: humanoid spy-adjacent (motion style already set)

### Concept
A field operator running a swarm of Combat Drones — visibly a technician, not a cloaked spy. Carries a tablet/control rig with an antenna, and is accompanied by one small hovering micro-drone (a miniature callback to `CombatDroneSprite`'s design) rather than `SpyHackerSprite`'s laptop-in-shadow. This is a formation-coordination specialist, out in the open, not sneaking.

### Key requirements
- **Dominant silhouette**: the `<Humanoid cx={64} cy={70} scale={0.95} ...>` base in practical field-technician gear — `P.cloth.wool` vest/jacket, **no full cloak** (SpyHackerSprite's defining silhouette is a dark cloak — deliberately avoid that here, an open-stance technician is the whole point).
- **Supporting detail — micro-drone companion**: one small hovering shape near the shoulder or above the head — a miniature version of `CombatDroneSprite`'s ducted-fan-and-eye silhouette (~15–20% of figure height), with its own tiny `#00aaff` eye dot. This is the signature element distinguishing this unit from every other humanoid in the roster — keep it small and clearly a companion, not a second dominant shape.
- **Supporting detail — control rig**: held in both hands or on a chest harness — a flat rectangle, `#0a0a20` bezel, `palette.bright` screen glow, one or two thin `#00aaff` UI lines (echo `SpyHackerSprite`'s gadget technique, but brighter/more open).
- **Supporting detail — antenna**: a thin whip antenna off the rig or a backpack unit, `P.metal.steel`, small tip node.
- No cloak, no shadow-cloaked hood — brighter tone than the spy family.
- Small `<Banner scale={0.5}>`.
- Tone: technical, coordinated, confident — a field controller in daylight, not a covert operative.

</sprites>

<output_format>
Output one `export function FooSprite(...)` per sprite, in the order above, as plain TypeScript ready to paste into `units.tsx`. State the exact single-line catalog replacement for each (already given above) so the developer can apply them without re-deriving them. Output one sprite at a time, pausing for confirmation between each, unless told otherwise.
</output_format>

<style_checklist>
- [ ] ViewBox `0 0 128 128`, wrapped in `<SpriteFrame svgOnly={svgOnly}>`
- [ ] `<Shadow />` present with footprint-appropriate `rx`/`ry`
- [ ] Exactly one dominant silhouette per sprite (named in its spec); every other element is visibly smaller/quieter and reads as a supporting detail, not a second focal point
- [ ] All faction color via `palette.mid` / `palette.dark` / `palette.bright` / `palette.trim` — zero hardcoded faction hex
- [ ] Sci-fi accent colors (LED/glow/panel) use the literal hex values from the Sci-Fi/Modern Accent Palette above, not invented ones
- [ ] Silhouette is unmistakably distinct from the sprite it replaces (Jet Fighter / Ironclad / Machine Gunner / Missionary / Spy Hacker), and from the other four sprites in this batch, even in flat grey silhouette
- [ ] No photorealism, gradients, blur filters, or embedded raster/text-as-image
- [ ] `cq-sprite-figure` is NOT added manually (SpriteFrame adds it automatically); limb/weapon class names are used only on the three humanoid sprites, never on the two vehicles
- [ ] No `data-state`, `cq-v2` class, or reduced-motion handling added inside the sprite function — that is entirely the runtime overlay's responsibility
- [ ] Reads clearly and stays distinct from the other four units at **32px**, not just at a larger comfortable preview size
</style_checklist>

---

## Prompt — PART 2: BUILDINGS BATCH 1 (copy everything below this line, through the end of Part 2's `</style_checklist>`)

<role>
You are a senior SVG sprite artist and TypeScript developer specializing in hand-crafted game graphics. You write clean, geometric SVG in JSX-based TypeScript — no photorealism, no gradient meshes, no blur filters, no embedded raster images. Your work integrates directly into a production codebase.
</role>

<context>
**Goal**: replace 8 temporary Era 13 building sprites — currently exact visual reuses of Era 12 sprites — with distinct, production-quality silhouettes that continue the game's established near-future tech idiom.

**Layout**: each sprite is a standalone 192×192 SVG built on `<BuildingFrame>`/`<BuildingPlinth>`, the same layout every existing building sprite uses. This is the game's fixed building-sprite asset format, used consistently across the ~60 buildings already in `buildings.tsx` — match it exactly rather than inventing a new layout.

**Content**: 8 buildings — Network Operations Center, AI Safety Institute, Drone Fabricator, Electronic Warfare Array, Civic Media Forum, Vertical Farm, Neural Rehabilitation Center, Ocean Robotics Yard. Full per-building specs are in `<sprites>` below.

**Audience**: this 192×192 SVG is the established building-sprite asset contract used by every other entry in `BUILDING_SPRITE_CATALOG` — correct format and correct catalog registration matter regardless of exactly which UI surface currently renders it (see the honesty note below). Design at the same visual density and scale as the existing Era 12 sprites you're replacing (roughly 60–140px effective render size), and keep every building in this batch visually distinct from the other 7 and from the Era 12 sprite it replaces.

**A note on current UI wiring, for honesty rather than overclaiming**: `spriteCache.getBuilding()` (the function that would draw one of these sprites) has no live call site in `src/main.ts`, `render-loop.ts`, or `city-render-passes.ts` today — it's only exercised by a unit test. The production chooser, queue, and city panel most likely still show `PRODUCTION_ICONS` emoji rather than these SVGs. Design to the same quality bar as if it were fully wired up today (that wiring is a separate, smaller follow-up), but don't assume a live in-game screenshot exists to check your work against — go by the sibling sprites in `buildings.tsx` instead.

**Project**: Conquestoria — an HTML5 Canvas + DOM strategy game built with TypeScript and Vite. Gameplay spans Eras 1–13. Mobile-first, played by families including children.

**Why this batch is distinct from most of the catalog**: Era 13 ("Information Age") buildings currently render as **exact reuses of Era 12 sprites** (e.g. Network Operations Center reuses the Data Center sprite verbatim) as a temporary launch placeholder. Stay inside the game's established near-future tech idiom (the Sci-Fi/Modern Accent Palette below is a continuation of Era 10–12's visual language, not a new one).

**Quality bar**: go beyond a bare placeholder silhouette. Include the small hand-crafted details — a rivet, a panel seam, a status LED, a texture accent — that make every existing sprite in `buildings.tsx` feel intentional rather than generic. At the same time, every added detail must stay subordinate to the one dominant silhouette element named per sprite below (see "Composition discipline") — more detail should read as texture on the dominant shape, never as a second competing focal point.

**Platform**: Web (Canvas 2D + DOM). Sprites are prerendered to `HTMLImageElement` via SVG blob URLs. Repository: https://github.com/a1flecke/conquestoria
</context>

<reference_files>
1. **Sprite system helpers** (`BuildingPlinth`, `Banner`, `FactionPalette` type, full `MATERIAL_PALETTE` constant, `CATEGORY_TINTS`):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/sprite-system.tsx
2. **All existing building sprites, including the `BuildingFrame` helper itself** (`BuildingFrame` is defined locally near the top of this file, around line 25 — it is NOT exported from `sprite-system.tsx`, it lives here). Read every function, but pay special attention to the Era 12 tail (`AutomatedPortSprite` through `TelemedicineHubSprite`, especially `CyberDefenseCenterSprite`, `DataCenterSprite`, `SignalsHubSprite`, `SmartGridSprite`, `PrecisionFarmSprite`) for the established near-future tech idiom you must continue:
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
issue): every sprite is "one dominant silhouette plus a supporting prop," never several
competing focal shapes. Each spec below opens its **Key requirements** with a line labeled
**Dominant silhouette** — that is the one shape that must read first, even in a small production-
queue thumbnail. Every other bullet is labeled **Supporting detail** and must stay visually
smaller/quieter than the dominant shape. If in doubt, cut a supporting detail rather than let it
rival the dominant silhouette.

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
medical cross:           #dd2222
power / warning accent:  #ffdd00
```

## Faction Color Rules
Every sprite receives `palette: FactionPalette` (`{ dark, mid, bright, trim }`). Primary structure fill → `palette.mid`; shadow/trim → `palette.dark`; glow/highlight → `palette.bright`; small heraldic accent → `palette.trim`. **Never hardcode a faction name or hex for faction identity** — the sci-fi accent hex values above are for non-faction tech details only.

## Building Sprite Contract
```typescript
export function FooSprite({ palette, svgOnly = false }: BuildingSpriteProps): string
```
- ViewBox: `0 0 192 192`. Wrap in `<BuildingFrame label="Name" sub="Sub" category="..." svgOnly={svgOnly}>` — use the exact `label`/`sub`/`category` given per sprite below. `category` must be one of the real `CATEGORY_TINTS` keys used elsewhere in the codebase: `food`, `production`, `gold`, `science`, `culture`, `military`, `espionage` (each spec below already tells you which one).
- Always include `<BuildingPlinth w={...} />` and a faction `<Banner ... palette={palette} />` — the banner is always a supporting detail, never the dominant silhouette.
- **Available animated effect CSS classes** (assign class name only): `.cq-fire`, `.cq-smoke`/`.cq-smoke--b`/`.cq-smoke--c`, `.cq-spark`/`.cq-spark--b`/`.cq-spark--c`, `.cq-glow` (soft pulse — this is the workhorse for "screen glow"/"status light" effects in the Era 12 sprites, use it liberally), `.cq-peek`, `.cq-dust`.
- For continuous motion (radar sweep, rotating fan, etc.) use inline SVG `<animate>`/`<animateTransform>` exactly as `SignalsHubSprite`'s dish-ring `<animate>` or `DockSprite`'s water does — keep it subtle.

## Animation & motion ownership
As with units, `prefers-reduced-motion` handling and any outer state-driven wrapper classes are
owned entirely by the runtime (the CSS file's `@media (prefers-reduced-motion: reduce)` block
covers every sprite globally). Do not add reduced-motion handling inside an individual building
function — just use `.cq-glow`/`.cq-fire`/etc. class names and inline `<animate>` as documented,
and the runtime takes care of the rest.

## Example — matching the existing near-future tech idiom (from `DataCenterSprite`, already in `buildings.tsx`)
<example>
```tsx
export function DataCenterSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Data Center" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={148} />
      <rect x="16" y="72" width="160" height="64" rx="3" fill="#181830" stroke={P.metal.steel} strokeWidth="1.4" />
      {/* rack rows */}
      <rect x="24" y="80" width="32" height="48" rx="2" fill="#0a0a20" stroke={P.metal.steel} strokeWidth="0.8" />
      <rect x="62" y="80" width="32" height="48" rx="2" fill="#0a0a20" stroke={P.metal.steel} strokeWidth="0.8" />
      {/* status LEDs */}
      <circle cx="48" cy="88" r="2" fill="#00aaff" />
      <circle cx="86" cy="88" r="2" fill="#00ff44" />
      <Banner x={30} y={20} palette={palette} scale={0.65} />
    </BuildingFrame>
  );
}
```
Note the pattern this demonstrates: one dominant shape (the wide dark rack-wall, `#181830`, drawn
first and largest), a small number of supporting details (individual rack units, a couple of LED
dots — not a dozen), faction color only on `Banner`, and the sci-fi accent hex values used
literally exactly as documented above. Match this density per sprite — not sparser, not busier.
</example>
</design_system>

<sprites>

## SPRITE 1 — NetworkOperationsCenterSprite (Building)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `TelemedicineHubSprite` (end of file)
**Catalog entry**: replace `network_operations_center: DataCenterSprite,` with `network_operations_center: NetworkOperationsCenterSprite,`
**label**: `"Network Operations Center"`  **sub**: `"Infrastructure"`  **category**: `science`

### Concept
An empire-wide network coordination hub — an antenna crown atop a control building, with a live network-topology display instead of Data Center's plain server racks. This building's whole identity is "the empire's network is coordinated from here," so the antenna array should dominate the silhouette, not rack boxes.

### Key requirements
- **Dominant silhouette**: an antenna crown — 3–5 short mast antennas of varying height rising from a low control-room roofline (`P.stone.mid`/`#181830` mixed fill), each tipped with a small `palette.bright` node dot, arranged like a crown. This must be the first thing read at thumbnail size, echoing but not copying `DataCenterSprite`'s dark-panel base.
- **Supporting detail — network topology display**: a small diagram on the facade of dots connected by thin lines (`#00aaff`, 4–6 nodes, a few connecting segments) — visually distinct from Data Center's rack-row pattern, and smaller than the antenna crown above it.
- **Supporting detail (optional, keep minor)**: one small rack-like element as a quiet echo of Data Center — must stay clearly subordinate to the antenna crown.
- `.cq-glow` on the topology display panel for a soft pulsing "live network" feel.
- `<Banner palette={palette} scale={0.65}>` on the tallest antenna or roof corner.
- Tone: coordinated, empire-scale infrastructure — the calm nerve-center, not a data warehouse.

---

## SPRITE 2 — AiSafetyInstituteSprite (Building)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `NetworkOperationsCenterSprite`
**Catalog entry**: replace `ai_safety_institute: CyberDefenseCenterSprite,` with `ai_safety_institute: AiSafetyInstituteSprite,`
**label**: `"AI Safety Institute"`  **sub**: `"Civic Research"`  **category**: `science`

### Concept
A civic research institute focused on AI oversight — closer to a research campus / courthouse than Cyber Defense Center's server-and-firewall aesthetic. A shield-and-checkmark oversight motif should be the dominant symbol (distinct from Cyber Defense's angular shield-with-X). Think: a public trust institution, not a defensive bunker.

### Key requirements
- **Dominant silhouette**: a rounded shield-and-checkmark emblem in `palette.mid`/`palette.bright` — softer and more rounded than Cyber Defense's angular shield, with a clear checkmark inside (not an X or lightning bolt). This is the single most important distinguishing symbol from `CyberDefenseCenterSprite` and must read first.
- **Supporting detail — civic base structure**: a modest civic building silhouette behind the emblem — a few shallow entrance steps, `P.stone.light` facade, one or two dignified columns (echo `LibrarySprite`/`ArchiveSprite` civic conventions) — kept low-key so the emblem stays dominant.
- **Supporting detail — oversight screens**: 2–3 small monitors visible through a window/opening, `#112244` with `#00ff44` status dots, implying human review of AI systems rather than raw server racks.
- `.cq-glow` on the shield emblem for a soft trust/authority pulse.
- `<Banner palette={palette} scale={0.65}>`.
- Tone: trustworthy, deliberate, civic — oversight and accountability, not raw defense.

---

## SPRITE 3 — DroneFabricatorSprite (Building)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `AiSafetyInstituteSprite`
**Catalog entry**: replace `drone_fabricator: AutomatedPortSprite,` with `drone_fabricator: DroneFabricatorSprite,`
**label**: `"Drone Fabricator"`  **sub**: `"Robotics Production"`  **category**: `production`

### Concept
A robotic production cell that builds and coordinates autonomous drones (it's the `trainedFromBuilding` for both Combat Drone and Drone Controller units) — a factory floor with a visible articulated robotic arm assembling a drone frame, not a dockside crane like Automated Port. This should look unmistakably like where `CombatDroneSprite` gets built.

### Key requirements
- **Dominant silhouette**: an articulated robotic arm (2–3 jointed segments, small pivot circles at each joint, `P.metal.iron`/`P.metal.steel`) reaching toward a partially-assembled drone frame on the shop floor — a clear visual callback to `CombatDroneSprite`'s ducted-fan-and-eye shape, one ring/fan visible, one still an open frame. This arm+frame pairing is the defining silhouette, distinct from any crane shape, and must read first.
- **Supporting detail — fabrication bay**: an industrial shell behind the arm, open front or large window, `P.stone.mid`/`P.metal.steel`, kept subordinate to the arm.
- **Supporting detail — sparks**: `.cq-spark`/`.cq-spark--b` near the arm's working tip.
- **Supporting detail — status panel**: one or two `#00aaff`/`#00ff44` LEDs on a control panel beside the arm.
- `<Banner palette={palette} scale={0.65}>`.
- Tone: precise, mechanical, productive — a robotics assembly line, not a shipping port.

---

## SPRITE 4 — ElectronicWarfareArraySprite (Building)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `DroneFabricatorSprite`
**Catalog entry**: replace `electronic_warfare_array: SignalsHubSprite,` with `electronic_warfare_array: ElectronicWarfareArraySprite,`
**label**: `"Electronic Warfare Array"`  **sub**: `"Signal Denial"`  **category**: `military`

### Concept
A directional jamming/counter-signal installation — reuse the general dish-and-mast language of `SignalsHubSprite` (which this replaces) but shift the visual story from "receiving signals" to "disrupting/interfering with them": a directional phased array instead of a parabolic dish, and jagged interference-pattern arcs instead of clean signal rings.

### Key requirements
- **Dominant silhouette**: a flat rectangular phased-array panel (not a curved dish) angled outward on a short, stockier mast than Signals Hub's — `P.metal.steel` frame, `#112244` panel face with a grid of small `#ffaa00` emitter dots. This flat-panel-vs-curved-dish contrast is what must read first against Signals Hub.
- **Supporting detail — interference pattern**: jagged/zigzag broadcast arcs (angular `<path>` zigzags, not Signals Hub's smooth dashed arcs) in `palette.bright`, opacity 0.5–0.7, radiating from the array — kept thin so it doesn't overwhelm the panel.
- **Supporting detail — equipment shed**: a small hardened shed at the base, `P.stone.dark`, one narrow slit window with a `#00aaff` glow.
- `<Banner palette={palette} scale={0.6}>`.
- Tone: aggressive, hardened, disruptive — countermeasure, not communication.

---

## SPRITE 5 — CivicMediaForumSprite (Building)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `ElectronicWarfareArraySprite`
**Catalog entry**: replace `civic_media_forum: BroadcastTowerSprite,` with `civic_media_forum: CivicMediaForumSprite,`
**label**: `"Civic Media Forum"`  **sub**: `"Public Discourse"`  **category**: `culture`

### Concept
A public plaza where citizens gather around a large public screen and a speaker's platform — an open civic square, not a broadcast tower. This is the ground-level "the public actually gathers here" counterpart to `BroadcastTowerSprite`'s one-way transmission tower.

### Key requirements
- **Dominant silhouette**: a low, wide plaza platform/stage (`P.stone.light`) — this building must read as *wide and low*, the opposite silhouette of Broadcast Tower's *tall and narrow*. That width-vs-height contrast is the key differentiator and must be established first.
- **Supporting detail — public screen**: one large flat screen/projection surface (`#112244` fill, `#00aaff` display content — abstract bars/icons only, never literal words, per the game's no-`innerHTML`-string convention) mounted at one end of the plaza.
- **Supporting detail — megaphone**: a stylized megaphone/PA-horn shape (`palette.mid`, `P.metal.steel` rim) on the speaker's platform.
- **Supporting detail — citizen silhouettes**: 2–3 small simplified citizen shapes (flat 2-color torso+head, the same lightweight technique `StockExchangeSprite` uses for its merchant figures) gathered facing the screen — small enough not to compete with the plaza/screen.
- `.cq-glow` on the screen for a soft "live broadcast" pulse.
- `<Banner palette={palette} scale={0.65}>` on a flagpole beside the stage.
- Tone: open, communal, democratic — a town square, not a transmission mast.

---

## SPRITE 6 — VerticalFarmSprite (Building)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `CivicMediaForumSprite`
**Catalog entry**: replace `vertical_farm: PrecisionFarmSprite,` with `vertical_farm: VerticalFarmSprite,`
**label**: `"Vertical Farm"`  **sub**: `"Urban Agriculture"`  **category**: `food`

### Concept
A stacked greenhouse tower — multiple visibly distinct growing levels stacked vertically inside a glass/frame structure, replacing Precision Farm's ground-level tractor-and-crop-rows scene entirely with a *tall* silhouette. This should be the tallest, most vertical food building in the game.

### Key requirements
- **Dominant silhouette**: a tall glass-and-frame tower with 4–5 stacked horizontal growing levels, each a shallow tray/shelf visible through a glass facade (`#b8d4e8` glass fill, `P.metal.steel` frame mullions between levels). The stacking is the whole visual point — make each level clearly countable, and this tall tower shape must read first.
- **Supporting detail — crops**: small green plant/leaf shapes (rounded triangles or ellipse clusters, `#44aa44`/`P.ground.grass`) in each tray, varying density slightly for interest — kept subordinate to the tower's overall silhouette.
- **Supporting detail — grow lighting**: a thin `palette.bright`/`#ffdd00` light strip along the underside of each level.
- **Supporting detail — irrigation**: a slim rooftop water tank, `P.metal.steel`, small pipe down the tower's side.
- `<BuildingPlinth w={110} />` — narrower footprint than most buildings, since it's a tower, not a wide structure.
- `<Banner palette={palette} scale={0.65}>` near the top.
- Tone: bright, green, dense — urban agriculture stacked skyward, distinctly not a tractor-in-a-field scene.

---

## SPRITE 7 — NeuralRehabilitationCenterSprite (Building)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `VerticalFarmSprite`
**Catalog entry**: replace `neural_rehabilitation_center: TelemedicineHubSprite,` with `neural_rehabilitation_center: NeuralRehabilitationCenterSprite,`
**label**: `"Neural Rehabilitation Center"`  **sub**: `"Unit Recovery"`  **category**: `food`

### Concept
A medical campus specializing in neural/rehabilitation therapy for wounded units (mechanically: nearby units heal faster) — reuse Telemedicine Hub's medical-cross language but replace its remote-consultation screen with a neural/brainwave motif, and give it a rehabilitation-campus feel (an outdoor recovery courtyard) rather than a single consultation room.

### Key requirements
- **Dominant silhouette**: a calm medical campus building, `#f0f4f0`/`P.stone.light` facade (echo Telemedicine Hub's clinical-white base for family resemblance), with the `#dd2222` medical cross convention kept as the primary identifying mark — same cross convention as Telemedicine Hub/Gene Therapy Clinic for instant "healing building" recognition.
- **Supporting detail — neural/brainwave motif** (the key differentiator from Telemedicine Hub): a simplified brain silhouette with a few branching internal lines, or 4–5 small dots connected by thin curved lines (a neural-network graphic), in `#00aaff`/`palette.bright`, replacing Telemedicine Hub's remote-patient screen — kept smaller than the medical-cross+facade.
- **Supporting detail — recovery courtyard**: a small bench or low garden hedge (`P.ground.grass`) beside the building, implying physical rehabilitation space.
- `.cq-glow` on the neural diagram for a gentle pulsing "active recovery" feel.
- `<Banner palette={palette} scale={0.6}>`.
- Tone: calm, restorative, clinical-but-warm — recovery, not just remote diagnosis.

---

## SPRITE 8 — OceanRoboticsYardSprite (Building)

**Insert into**: `src/renderer/sprites/buildings.tsx`, after `NeuralRehabilitationCenterSprite`
**Catalog entry**: replace `ocean_robotics_yard: AutomatedPortSprite,` with `ocean_robotics_yard: OceanRoboticsYardSprite,`
**label**: `"Ocean Robotics Yard"`  **sub**: `"Autonomous Naval"`  **category**: `production`
**Note**: this building is `coastalRequired: true` and is the `trainedFromBuilding` for `autonomous_frigate` — it should visually connect to `AutonomousFrigateSprite`'s design.

### Concept
A coastal slipway purpose-built for constructing autonomous naval vessels — must clearly differ from `AutomatedPortSprite` (which it currently reuses as a placeholder and which represents generic automated cargo handling) by putting a partially-built `AutonomousFrigateSprite`-style hull on the slipway as the focal element, not shipping containers.

### Key requirements
- **Dominant silhouette**: a partially-built autonomous hull on the slipway — a faceted low hull shape echoing `AutonomousFrigateSprite`'s angular stealth-panel silhouette, partially scaffolded, sitting on an angled ramp running into `P.ground.water` with `P.stone.mid` retaining walls. This hull-on-slipway pairing is the single most important visual link between the building and the unit it trains, and must read first.
- **Supporting detail — robotic gantry**: an overhead gantry frame (not a traditional crane hook) with a small robotic arm segment, `P.metal.steel`, positioned over the hull, smaller/quieter than the hull itself.
- **Supporting detail — status lights**: 1–2 `#00aaff`/`#00ff44` lights on the hull or gantry control panel.
- **Supporting detail — sparks**: `.cq-spark`/`.cq-spark--b` at the gantry arm's working point.
- `<Banner palette={palette} scale={0.65}>`.
- Tone: coastal, industrial, robotics-forward — a naval drone shipyard, distinct from a generic automated cargo port.

</sprites>

<output_format>
Output one `export function FooSprite(...)` per sprite, in the order above, ready to paste into `buildings.tsx`. State the exact single-line catalog replacement for each (already given above). Output one sprite at a time, pausing for confirmation between each, unless told otherwise.
</output_format>

<style_checklist>
- [ ] ViewBox `0 0 192 192`, wrapped in `<BuildingFrame label="..." sub="..." category="...">` using the exact label/sub/category given per sprite, `category` matching a real `CATEGORY_TINTS` key
- [ ] `<BuildingPlinth w={...} />` and a faction `<Banner palette={palette} .../>` present
- [ ] Exactly one dominant silhouette per sprite (named in its spec); every other element is visibly smaller/quieter and reads as a supporting detail, not a second focal point
- [ ] All faction color via `palette.mid` / `palette.dark` / `palette.bright` / `palette.trim` — zero hardcoded faction hex
- [ ] Sci-fi accent colors use the literal hex values from the Sci-Fi/Modern Accent Palette above
- [ ] Silhouette is unmistakably distinct from the Era 12 sprite it replaces AND from the other 7 sprites in this batch
- [ ] No photorealism, gradients, blur filters, embedded raster images, or SVG `<text>` used as in-world signage (screens show abstract bars/dots/icons only, never literal words, per the game's no-`innerHTML`-string convention)
- [ ] No reduced-motion handling or state-driven wrapper classes added inside the sprite function — that is entirely the runtime's responsibility
- [ ] Reads clearly at the same effective scale as the sibling sprites already in `buildings.tsx`
</style_checklist>

---

## Prompt — PART 3: BUILDINGS BATCH 2 (copy everything below this line, through the end of Part 3's `</style_checklist>`)

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
- [ ] Silhouette is unmistakably distinct from the Era 12 sprite it replaces AND from every other sprite across both Part 2 and Part 3
- [ ] No photorealism, gradients, blur filters, embedded raster images, or SVG `<text>` used as in-world signage
- [ ] No reduced-motion handling or state-driven wrapper classes added inside the sprite function
- [ ] Reads clearly at the same effective scale as the sibling sprites already in `buildings.tsx`
</style_checklist>
