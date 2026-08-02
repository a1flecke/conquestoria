# Claude Design Prompt: Conquestoria Sprites

**Active prompt below**: #769 batch 3 (real, distinct live-catalog sprites for `freight_convoy`,
`recon_aircraft`, `air_freighter`, `bomber`, `jet_freighter`), drafted 2026-08-02. Copy the prompt
in the "Active Prompt" section below into Claude Design, then prune it back out of this file once
the batch ships (see "When a new sprite/terrain/prompt need comes up" at the bottom).

The last shipped batch — #769 batch 2 (`frigate`, `destroyer`, `merchant_wagon`, drafted
2026-08-01 as [issue #775](https://github.com/a1flecke/conquestoria/issues/775)) — shipped
2026-08-01. All 3 now render their own bespoke `units.tsx` sprite function instead of aliasing
another unit's exact art. The batch before that — #769 batch 1 (`chariot`, `infantry`,
`artillery`, `marine`, `cyber_unit`) — shipped 2026-08-01 in PR #773 (merged).

## Durable note: check for other issues owning the same units before scoping a batch

When #769 was filed, it audited `UNIT_SPRITE_CATALOG` and found 17 aliased units, without checking
whether any were already owned by a pre-existing tracked issue. They were: issue **#708** (part of
the larger #547 combat-roster initiative) already owned `chariot`/`beast_handler`/`war_elephant`/
`cuirassier`'s bespoke-sprite work, with its own design doc and implementation plan, before #769
was ever filed. This was discovered mid-batch-1 (2026-08-01) when a delivered sprite batch's own
authored comments correctly cited `#708` — because the generation prompt's reference files pulled
the live repo's existing `sprite-catalog.ts`, which already had `// #708 owns ...` comments on
those exact lines.

**Resolution**: `chariot` shipped under #769 (folding in that slice of #708's scope; #708's
comment was updated to reflect it). `beast_handler`/`war_elephant`/`cuirassier` remain #708's
scope, not #769's — removed from #769's batch plan. `armored_car` (a newly-added alias discovered
during the same reconciliation) belongs to issue #709, also not #769.

A second round of this happened mid-batch-2 (2026-08-01): `anti_tank_gun` and `wwii_fighter`
landed on `main` from unrelated work with no owning-issue comment. Decision (2026-08-02): folded
into #769 as a new **Batch 5** (after batch 4) rather than silently added to batch 3/4.

**Before drafting any future #769 batch:**
1. Run the audit script (below) to get the live alias list — don't trust a roster pasted into an
   old prompt or issue body.
2. For every alias it reports, check whether the comment already on that catalog line names a
   different issue (`grep -B2 "<unit_id>:" src/renderer/sprites/sprite-catalog.ts`). If so, that
   issue owns it — don't add it to #769 without reconciling first (ask before assuming).
3. Only units with no other stated owner are genuinely #769's to batch — and even then, ask before
   silently folding a newly-discovered drift unit into an existing batch (see the
   `anti_tank_gun`/`wwii_fighter` → Batch 5 precedent above).

## Audit before starting every batch

```bash
bash scripts/run-with-mise.sh yarn node scripts/audit-sprite-aliases.mjs
```

This re-derives the alias list directly from `sprite-catalog.ts` (not from this doc or any issue
body) and exits non-zero while any alias remains. As of batch 3 drafting (2026-08-02) it reports
13 total: 9 in #769's scope across batch 3 (this prompt, 5 units), batch 4 (2 units, not yet
scoped), and batch 5 (2 units, `anti_tank_gun`/`wwii_fighter`, not yet scoped) — plus
`beast_handler`/`war_elephant`/`cuirassier` (owned by #708) and `armored_car` (owned by #709).
Cross-check its output against:
- `tests/renderer/sprites/sprite-catalog.test.ts` → `describe('#769 pending sprite-alias audit
  baseline', ...)` — the mechanically-enforced remaining-scope list for #769 specifically. A unit
  is only "done" when its row is deleted here — that deletion is the proof, not a checkbox in prose.
- Issue #769's body, for the batch grouping of whatever's left.

If the audit reports a unit not in either place, don't assume it's #769's — check for another
owning issue first (see "Durable note" above), then update both the baseline test and #769's plan
in the same PR.

---

## Active Prompt — #769 Batch 3 (drafted 2026-08-02)

Five units currently render as an exact silhouette copy of a unit from a different era or role —
not similar art, the literal same SVG. Every donor here is also visually wrong for the unit's own
era per `src/systems/unit-system.ts`/`tech-definitions-eras*.ts`, not just "reused": `recon_aircraft`
and `jet_freighter` are gated by `jet-aviation` (era 10, jet age) but currently render as
`BiplaneSprite`/`JetFighterSprite`-adjacent placeholders where the biplane one is a WWI-era
double-wing prop plane; `air_freighter` is gated by `air-superiority` (era 9, WWII-contemporary)
but renders as the same WWI biplane; `bomber` is gated by `nuclear-weapons` (era 10) but renders
as `JetFighterSprite` verbatim (a small single-seat fighter, not a heavy bomber); `freight_convoy`
is gated by `highway-network` (era 10, production icon 🚛 — a truck) but renders as `CaravanSprite`,
a walking pack-donkey with no wheels at all.

```
<role>
You are a senior SVG sprite artist and TypeScript developer specializing in hand-crafted game graphics. You write clean, geometric SVG — no photorealism, no gradient meshes, no blur filters. Your work integrates directly into a production codebase.
</role>

<context>
**Project**: Conquestoria — HTML5 Canvas + DOM strategy game, mobile-first, played by families including young children. All map graphics are inline SVG rendered to Canvas via cached HTMLImageElement.

**Audience**: Sprites appear on a hex tile map at 40–120 px. Bold, readable silhouettes. Children should recognize what each unit is at a glance.

**This batch**: five units currently render as an *exact* silhouette copy of a unit from the wrong era or role — not similar art, the literal same SVG.
- `freight_convoy` (era 10, gated by `highway-network`, production icon 🚛 — a truck) renders as `CaravanSprite` (an ancient walking pack-donkey with no wheels at all).
- `recon_aircraft` (era 10, gated by `jet-aviation` — jet age, unarmed reconnaissance) renders as `BiplaneSprite` (a WWI-era double-wing propeller plane — three eras too early).
- `air_freighter` (era 9, gated by `air-superiority` — WWII-contemporary) also renders as `BiplaneSprite` (still WWI-era, one era too early).
- `bomber` (era 10, gated by `nuclear-weapons`) renders as `JetFighterSprite` verbatim — a small single-seat swept-wing fighter, not a large multi-engine strategic bomber.
- `jet_freighter` (era 10, gated by `jet-aviation`) also renders as `JetFighterSprite` verbatim — same fighter-jet silhouette as `bomber`'s current placeholder and the real `jet_fighter`/`wwii_fighter` units, with no cargo identity at all.

Each new sprite must be visually distinct from its current placeholder donor AND historically/mechanically appropriate to its own era — not just a recolor. Two of these (`bomber`, `jet_freighter`) currently share the *same* donor (`JetFighterSprite`) as each other and as the real `jet_fighter`/`wwii_fighter` units, so they also need to read as distinct from one another, not just from the donor.

**Repository**: https://github.com/a1flecke/conquestoria
</context>

<reference_files>
1. Sprite system helpers (SpriteFrame, BuildingFrame, Humanoid, Banner, Shadow, HexBase, BuildingPlinth, full MATERIAL_PALETTE):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/sprite-system.tsx

2. Existing unit sprites (read every function — internalize style and proportions; pay special attention to `CaravanSprite`, `MerchantWagonSprite` (the wheeled successor already shipped in batch 2 — freight_convoy is the next successor after that), `BiplaneSprite`, and `JetFighterSprite`, the donor sprites this batch must look nothing like):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/units.tsx

3. Existing building sprites (style reference only):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/buildings.tsx

4. CSS animation system (all keyframes and class hooks):
   https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/sprite-animations-v2.css
</reference_files>

<design_system>
### Style
- **Flat geometric SVG.** No photorealism, no gradients, no blur filters.
- **2.5D perspective.** Figures/vehicles/aircraft face right, slightly toward the viewer. Not top-down, not full side-on.
- **Warmth.** Earthy, hand-made feel. Ink line `#1f1a14` holds everything together.

### Line Weights
- Major outlines: `stroke="#1f1a14"` `strokeWidth="1"`
- Interior detail: `strokeWidth="0.5"–"0.8"`
- Thin highlights: same color, `opacity="0.3–0.5"`

### Material Palette (`MATERIAL_PALETTE` in `sprite-system.tsx`, aliased as `P`)
```
skin:   warm=#d4a373  cool=#b08968  deep=#8a5a3c
cloth:  tunic=#c19a6b  linen=#e6dcc6  wool=#7a6e5b  dye=#5b4a7a
metal:  iron=#5a6068  steel=#8a929b  bronze=#b8895a  gold=#d4a13c  shine=#e8edf2
wood:   light=#c19a6b  mid=#8a6a3a  dark=#5e3f24
stone:  light=#c4b8a4  mid=#9a8e78  dark=#6a5e4a
thatch: straw=#d6b46a  shadow=#8a6a3a
ground: grass=#7ea860  dirt=#a08260  sand=#d8c896  water=#3a6e94
ink:    line=#1f1a14   soft=#3a3228
hud:    food=#7bb850  prod=#c98a3a  gold=#e8c64a  sci=#5fb4d4  cult=#c46db4  mil=#c4413a  esp=#7a5ec4
```

### Faction Color (`FactionPalette`)
```typescript
{ dark: string; mid: string; bright: string; trim: string }
```
Generated by `derivePalette(civColor)`. Every unit receives a `palette` prop — never hardcode a faction name or civ color.
- `palette.mid` → primary paint/livery/hull-trim fill
- `palette.dark` → belt/shadow/outline accent
- `palette.bright` → gem, glow, highlight dot
- `palette.trim` → heraldic accent, flag/roundel/ensign

### Unit Sprite Contract
```typescript
export function FooSprite({ palette, svgOnly = false }: UnitSpriteProps): string
```
- **ViewBox**: `0 0 128 128`
- **Wrapper**: `<SpriteFrame svgOnly={svgOnly}>` — never a raw `<svg>`
- **Required**: `<Shadow />`
- **data-kind on outermost group**: `civilian` for `freight_convoy` (matches `caravan`/`merchant_wagon`'s own data-kind convention — it's a non-combat trade unit). For `recon_aircraft`, `air_freighter`, `bomber`, and `jet_freighter`: **do not set `data-kind`** — there is no `air` value in the animation system's body-plan taxonomy (`civilian | melee | ranged | naval | hound | spy | building`, see `sprite-animations-v2.css`'s SELECTOR TAXONOMY comment), and the existing `BiplaneSprite`/`JetFighterSprite` donors set none either. Follow that exact precedent rather than inventing a new value.
- **Faction pennant/roundel**: `<Banner x={…} y={…} palette={palette} scale={…} />`
- **Animation**: CSS class names only — relevant hooks for this batch: `cq-deliver` (trade-goods glint, already used by `CaravanSprite`/`MerchantWagonSprite` — reuse for `freight_convoy` to keep the "delivering" motif consistent across the trade-unit line, and it is now a *live* animation as of #769's bonus fix, not decoration)
</design_system>

<sprites>

## SPRITE 1 — FreightConvoySprite (Unit)

**Insert into**: `src/renderer/sprites/units.tsx`, immediately after `MerchantWagonSprite`
**Catalog entry**: `freight_convoy: withMotion('freight_convoy', FreightConvoySprite),` (replaces
the current `withMotion('freight_convoy', CaravanSprite)` line and its two-line placeholder comment
in `sprite-catalog.ts`)
**data-kind**: civilian

### Concept
An era-10 motorized freight convoy — the mechanized successor to the horse-drawn Merchant Wagon
(shipped in batch 2), gated by `highway-network` and represented by a 🚛 truck icon in the
production menu. This must read as a real motor truck, not a recolored wagon: a cab with an
engine hood and windshield, rubber tires (not spoked wooden wheels), and an enclosed or
flatbed cargo box — no draft animal, no reins, no wooden axle.

### Key requirements
- A truck cab at the front with a short hood, a windshield, and a driver visible through it —
  replaces Merchant Wagon's harnessed draft horse and open driver's bench entirely
- Rubber tires (black, `P.ink.line` outline, hubcap detail in `palette.bright` or `P.metal.steel`)
  — the defining silhouette difference from both Caravan (no wheels) and Merchant Wagon (wooden
  spoked wheels); at least 2 visible wheels, a rear dual-wheel pair reads as more "convoy"-scaled
  than a simple wagon
- An enclosed cargo box or flatbed with a tarp behind the cab — larger and boxier than Merchant
  Wagon's open crate-stacked bed, implying a bigger hauling capacity befitting the higher
  production cost (220 vs. 90)
- A short exhaust stack or tailpipe with a small `.cq-smoke` puff — a detail neither Caravan nor
  Merchant Wagon has, signaling "motorized" at a glance
- `palette.mid` as the cab/cargo-box livery color, `palette.trim` on a small pennant or company
  emblem on the cab door
- Faction `<Banner>` mounted on a short staff at the cab roof or cargo-box front
- Animated element: reuse the `cq-deliver` class (coin/gold glint at the cargo box) — same
  trade-unit "delivering goods" motif as `CaravanSprite`/`MerchantWagonSprite`, for continuity
  across the full trade-unit line
- Tone: industrial, purposeful, modern commerce

## SPRITE 2 — ReconAircraftSprite (Unit)

**Insert into**: `src/renderer/sprites/units.tsx`, immediately after `JetFighterSprite`
**Catalog entry**: `recon_aircraft: withMotion('recon_aircraft', ReconAircraftSprite),` (replaces
the current `withMotion('recon_aircraft', BiplaneSprite)` line)

### Concept
An era-10 jet-age unmanned/lightly-crewed reconnaissance aircraft, gated by `jet-aviation` (the
same tech that unlocks `jet_fighter`) and production-icon 🔭 — surveillance, not combat (it has
0 strength and no `attackProfile`). It must read as decades more advanced than `BiplaneSprite`'s
WWI double-wing prop plane: a single thin high-aspect-ratio monoplane wing, a slender jet-age
fuselage, and a camera/sensor pod — no struts, no biplane double-wing, no visible propeller.

### Key requirements
- A single long, thin, high-aspect-ratio wing (glider-like, not stubby) mounted high on the
  fuselage — replaces Biplane's stacked double wings and cross-strut rigging entirely
- A slender, elongated fuselage tapering to a fine nose — no radial engine cowling, no propeller
  hub at the front (Biplane's defining nose feature must not appear here)
- A ventral camera/sensor pod bulge underneath the fuselage — a recon-specific detail neither
  Biplane nor JetFighter has, this is the unit's whole visual identity as an unarmed spy-plane
- A single small jet intake or thin tail-mounted engine nacelle (not the twin swept tail fins of
  JetFighterSprite, and no afterburner glow — this aircraft doesn't fight)
- `palette.mid` as a thin fuselage stripe, `palette.trim` on a small tail roundel
- Faction `<Banner>`-style roundel marking (use `<Banner>` at a wingtip or tail position, scaled down)
- Tone: quiet, high-altitude, watchful — deliberately less aggressive-looking than a fighter

## SPRITE 3 — AirFreighterSprite (Unit)

**Insert into**: `src/renderer/sprites/units.tsx`, immediately after `ReconAircraftSprite` (see
Sprite 2 above)
**Catalog entry**: `air_freighter: withMotion('air_freighter', AirFreighterSprite),` (replaces the
current `withMotion('air_freighter', BiplaneSprite)` line and its placeholder comment block)

### Concept
An era-9 WWII-contemporary twin-engine cargo transport, gated by `air-superiority` (the same tech
as `wwii_fighter`) — the air trade line's first rung, successor in spirit to the ground
`merchant_wagon`. It must read as a boxy propeller-driven cargo hauler one clear generation past
`BiplaneSprite`'s WWI double-wing plane: a single monoplane wing, twin engine nacelles, and a
boxy fuselage with a visible cargo door — no biplane struts, no single small radial cowling at
the nose.

### Key requirements
- A single monoplane wing mounted low or mid-fuselage (not stacked double wings) — the primary
  silhouette break from Biplane
- Two engine nacelles with propellers mounted on the wing (not one nose-mounted radial engine) —
  reads immediately as "one era newer" than Biplane's single nose engine
- A boxy, deep fuselage (cargo-hauling profile, not a slim fighter/scout body) with a visible
  rectangular cargo door or window strip along the side
- Fixed or lightly-faired landing gear beneath the fuselage — utilitarian, not sleek
- `palette.mid` as a fuselage cargo-line stripe, `palette.trim` on a small tail marking
- Faction `<Banner>`-style roundel on the tail fin (use `<Banner>` scaled down)
- Animated element: reuse the `cq-deliver` class (a small cargo-door glint) to keep the "delivering
  goods" motif consistent with the ground/naval trade lines
- Tone: sturdy, utilitarian, wartime workhorse

## SPRITE 4 — BomberSprite (Unit)

**Insert into**: `src/renderer/sprites/units.tsx`, immediately after `AirFreighterSprite` (see
Sprite 3 above)
**Catalog entry**: `bomber: withMotion('bomber', BomberSprite),` (replaces the current
`withMotion('bomber', JetFighterSprite)` line and its explanatory placeholder comment above it in
`sprite-catalog.ts` — that comment should also be removed as part of this change)
**data-kind**: none (see design_system note above)

### Concept
An era-10 heavy strategic bomber, gated by `nuclear-weapons`, production icon 💣, with a
`bombard`-kind attack profile at range 3 — a large multi-engine aircraft built to carry a heavy
payload a long way, not a nimble dogfighter. It must read as clearly larger and heavier than
`JetFighterSprite`'s small single-seat swept-wing silhouette: a long straight or gently-swept wing
carrying multiple engines, a long slab-sided fuselage with a visible bomb-bay line, and no
afterburner glow.

### Key requirements
- A long, straight or gently-swept wing (not JetFighterSprite's sharply swept-back delta wing)
  with at least 2 podded engine nacelles visible under or on the wing — JetFighterSprite has none
  of this, its "wing" is a single swept panel with no engine detail
- A long slab-sided fuselage, noticeably longer and less tapered than JetFighterSprite's compact
  tapered body — big enough to read as "carries a large payload," with a visible bomb-bay
  seam/line along the belly
- A single-fin or twin-fin tail noticeably larger in proportion than JetFighterSprite's small
  swept tail fins
- No afterburner glow at the tail (this is a payload hauler, not an interceptor — JetFighterSprite's
  orange afterburner ellipse must not appear here)
- `palette.mid` as a fuselage stripe/nose marking, `palette.trim` on a tail roundel
- Faction `<Banner>`-style roundel on the tail (use `<Banner>` scaled down)
- Tone: heavy, deliberate, ominous — the opposite mood of a quick fighter

## SPRITE 5 — JetFreighterSprite (Unit)

**Insert into**: `src/renderer/sprites/units.tsx`, immediately after `BomberSprite` (see Sprite 4
above)
**Catalog entry**: `jet_freighter: withMotion('jet_freighter', JetFreighterSprite),` (replaces the
current `withMotion('jet_freighter', JetFighterSprite)` line)

### Concept
An era-10 jet-age cargo freighter, gated by `jet-aviation` (same tech as `jet_fighter` and
`recon_aircraft`) — the air trade line's final rung, successor to `AirFreighterSprite` (Sprite 3
above). It must read as a large-bellied cargo jet, not a fighter: a wide fuselage with a
cargo-door seam, underwing (not tail-mounted) jet engine pods, and no weapons or afterburner —
and it must also look clearly distinct from this same batch's `AirFreighterSprite` (propeller,
twin nacelles, boxy WWII transport) despite both being "the freighter."

### Key requirements
- A wide, deep fuselage — noticeably fatter/rounder in cross-section than JetFighterSprite's
  slim tapered fighter body, reading as "cargo hold," not "cockpit + fuel tank"
- Two underwing jet engine pods hanging below the wing on pylons (turbofan-style, not
  JetFighterSprite's implied tail/fuselage-mounted jet) — this is the primary silhouette
  differentiator from both JetFighterSprite and Sprite 3's propeller nacelles
- A visible cargo-door seam or nose-hinge line along the fuselage side (or a raised cockpit ahead
  of a lower cargo hold, "jumbo freighter" profile)
- No cockpit-canopy bubble in JetFighterSprite's fighter style — use a small flight-deck window
  strip instead
- No afterburner glow at the tail — replace with a plain twin-jet exhaust silhouette
- `palette.mid` as a cargo-line livery stripe along the fuselage, `palette.trim` on a small tail
  logo/roundel
- Faction `<Banner>`-style roundel on the tail fin (use `<Banner>` scaled down)
- Animated element: reuse the `cq-deliver` class (a small cargo-glint near the fuselage door) to
  keep the "delivering goods" motif consistent with `freight_convoy`/`air_freighter`
- Tone: bulky, businesslike, high-capacity — deliberately un-aggressive next to `JetFighterSprite`

</sprites>

<output_format>
Output one TypeScript export function per sprite (`FreightConvoySprite`, `ReconAircraftSprite`,
`AirFreighterSprite`, `BomberSprite`, `JetFreighterSprite`), each following the exact
`UnitSpriteProps` signature above, ready to paste into `src/renderer/sprites/units.tsx`. Also
output the exact `sprite-catalog.ts` line-by-line diff needed: the five updated
`UNIT_SPRITE_CATALOG` lines, the five new imports to add to the `units.tsx` import block, and
removal of the placeholder comments this batch replaces (including the `bomber` explanatory
comment block and the `freight_convoy`/`air_freighter` two-line comments). Output sprites one at a
time, in the order above, so each can be reviewed before the next.
</output_format>

<style_checklist>
- [ ] ViewBox `0 0 128 128`, wrapped in `<SpriteFrame svgOnly={svgOnly}>`
- [ ] `<Shadow />` present
- [ ] `freight_convoy`'s outermost group has `data-kind="civilian"`; the four air units set no `data-kind` at all (matches `BiplaneSprite`/`JetFighterSprite` precedent — no `air` value exists in the taxonomy)
- [ ] Faction color flows only through `palette.*` — no hardcoded civ-identity hex values
- [ ] All ink outlines use `#1f1a14`, major outline `strokeWidth="1"`, interior detail `0.5–0.8`
- [ ] Each sprite's silhouette is unambiguously distinct from its donor sprite at a glance — no shared distinctive shapes carried over (freight_convoy: no draft animal/wooden wheels/reins; recon_aircraft & air_freighter: no biplane double-wing/strut/nose-cowling; bomber & jet_freighter: no fighter-jet delta wing/afterburner glow, and distinct from *each other* too)
- [ ] Historically/mechanically appropriate to the unit's own era per the tech gates listed in each Concept section, not the donor's era
- [ ] Faction `<Banner>`/roundel present at an appropriate mount point
- [ ] Animation classes used are real hooks from `sprite-animations-v2.css` (`cq-deliver`, `cq-smoke[--b][--c]`) — no invented class names
</style_checklist>
```

---

## When a new sprite/terrain/prompt need comes up

Use the `.claude/skills/generate-sprite-prompt.md` skill for live-catalog (`units.tsx`/
`buildings.tsx`) sprites, or hand-write a v2-native prompt (see git history for #759 batch 1's
prompt as a template) for animation-hook rigging work. Append the new prompt to this file the same
way this one was — dated, scoped to the specific issue — and prune it back out once shipped rather
than leaving it to accumulate. Everything that has ever lived in this file (economy sprites,
terrain tiles, naval transports, legendary beasts, rail segments, both Era 13 batches, #759 batch
1, #769 batch 1, #769 batch 2, and now #769 batch 3) was pruned the same way, verified against
actual source each time before removal — the history is in git, not preserved here.
