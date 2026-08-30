# Claude Design Prompt: Conquestoria Sprites

**The active Issue #710 corrective prompt is at the end of this file.** The last shipped one — #769 batch 5, the FINAL batch (real,
distinct live-catalog sprites for `anti_tank_gun`, `mobile_aa`, `wwii_fighter`) — shipped
2026-08-04. All three now render their own bespoke `units.tsx` sprite function instead of aliasing
another unit's exact art. With this batch merged, **#769's own scope is fully complete** — the
audit script now reports only the 6 units owned by #708/#709/#711, none left for #769. Close #769
after confirming that (see the "Suggested first steps" / final-sweep note in git history for this
file, batch 5's drafting revision, for the exact close-out checklist).

The batch before that — #769 batch 4 (`global_air_cargo`, `stealth_bomber`) — shipped 2026-08-03
([PR #782](https://github.com/a1flecke/conquestoria/pull/782), commit `639449b1`). Both now render
their own bespoke `units.tsx` sprite function instead of aliasing another unit's exact art. Batch 3
(`freight_convoy`, `recon_aircraft`, `air_freighter`, `bomber`, `jet_freighter`) — merged into
`main` 2026-08-02 ([PR #780](https://github.com/a1flecke/conquestoria/pull/780), commit
`26e7705f`). Batch 2 (`frigate`, `destroyer`, `merchant_wagon`, drafted 2026-08-01 as [issue
#775](https://github.com/a1flecke/conquestoria/issues/775)) shipped 2026-08-01. Batch 1 (`chariot`,
`infantry`, `artillery`, `marine`, `cyber_unit`) shipped 2026-08-01 in PR #773 (merged).

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
into #769 as a new **Batch 5** (after batch 4) rather than silently added to batch 3/4. A third
round happened mid-batch-3 (2026-08-02, from #681 mechanized infantry): `mechanized_infantry` is
owned by #709, `mobile_aa` was unclaimed and got folded into Batch 5 alongside the first two. A
fourth round happened mid-batch-4 (2026-08-03, from #682 dreadnought construction): a rebase onto
`main` picked up `battleship`, owned by **#711** — out of #769's scope entirely, no batch action
needed. This confirms the pattern is not a one-time fluke: rebase onto `main` and re-run the audit
before *every* batch, not just when starting the arc.

**Before drafting any future #769 batch:**
1. Run the audit script (below) to get the live alias list — don't trust a roster pasted into an
   old prompt or issue body.
2. For every alias it reports, check whether the comment already on that catalog line names a
   different issue (`grep -B2 "<unit_id>:" src/renderer/sprites/sprite-catalog.ts`). If so, that
   issue owns it — don't add it to #769 without reconciling first (ask before assuming).
3. Only units with no other stated owner are genuinely #769's to batch — and even then, ask before
   silently folding a newly-discovered drift unit into an existing batch (see the
   `anti_tank_gun`/`wwii_fighter`/`mobile_aa` → Batch 5 precedent above).

## Audit before starting every batch

```bash
bash scripts/run-with-mise.sh yarn node scripts/audit-sprite-aliases.mjs
```

This re-derives the alias list directly from `sprite-catalog.ts` (not from this doc or any issue
body) and exits non-zero while any alias remains. As of batch 5 shipping (2026-08-04) it reports 6
total, all owned elsewhere and out of #769's scope: `beast_handler`/`war_elephant`/`cuirassier`
(owned by #708) and `armored_car`/`mechanized_infantry`/`battleship` (owned by #709/#711). #769
itself has 0 remaining — its scope is fully shipped. Cross-check its output against:
- `tests/renderer/sprites/sprite-catalog.test.ts` → `describe('#769 pending sprite-alias audit
  baseline', ...)` — the mechanically-enforced remaining-scope list for #769 specifically. A unit
  is only "done" when its row is deleted here — that deletion is the proof, not a checkbox in prose.
- Issue #769's body, for the batch grouping of whatever's left.

If the audit reports a unit not in either place, don't assume it's #769's — check for another
owning issue first (see "Durable note" above), then update both the baseline test and #769's plan
in the same PR.

---

## When a new sprite/terrain/prompt need comes up

Use the `.claude/skills/generate-sprite-prompt.md` skill for live-catalog (`units.tsx`/
`buildings.tsx`) sprites, or hand-write a v2-native prompt (see git history for #759 batch 1's
prompt as a template) for animation-hook rigging work. Append the new prompt to this file the same
way this one was — dated, scoped to the specific issue — and prune it back out once shipped rather
than leaving it to accumulate. Everything that has ever lived in this file (economy sprites,
terrain tiles, naval transports, legendary beasts, rail segments, both Era 13 batches, #759 batch
1, #769 batches 1 through 5) was pruned the same way, verified against actual source each time
before removal — the history is in git, not preserved here. #769 itself is fully shipped as of
batch 5 (2026-08-04) — its own scope is complete, though its "Durable note" above stays as a
process lesson for any future sprite-alias issue.

---

## 2026-08-24 — Issue 708 grounded-mythic mounted and beast reference brief

<role>
You are a senior SVG sprite artist and TypeScript developer. Produce editable, flat geometric SVG/JSX source; this is not a raster-art task.
</role>

<context>
Project: Conquestoria, a family-friendly strategy game. Units appear at 40–120 px on a hex map. The final source is one 128×128 right-facing 2.5D silhouette per unit with animation hooks, not a detailed illustration.
</context>

<reference_files>
1. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/sprite-system.tsx
2. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/units.tsx
3. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/sprite-animations-v2.css
4. https://raw.githubusercontent.com/a1flecke/conquestoria/main/docs/sprite-design-system.md
</reference_files>

<design_system>
Use flat geometric shapes, warm ancient/medieval fantasy, right-facing 2.5D composition, `#1f1a14` major outlines, no gradients, blur, photorealism, text, or logos. Use materials only from: skin `#d4a373/#b08968/#8a5a3c`; cloth `#c19a6b/#e6dcc6/#7a6e5b/#5b4a7a`; metal `#5a6068/#8a929b/#b8895a/#d4a13c/#e8edf2`; wood `#c19a6b/#8a6a3a/#5e3f24`. Faction identity must use `f.dark`, `f.mid`, `f.bright`, and `f.trim`, never a hard-coded civilisation colour.
</design_system>

<sprites>
## BeastHandlerV2Sprite
Insert in `design/conquestoria-sprites/lib/units-v2.jsx`; use `SpriteFrameV2`, `kind="hound"`, `variant="war"`. A masked woodland handler on foot holds a short forked command staff beside a lean rune-collared hound. The 40px silhouette must read as staff + person + dog. Include four hound leg hooks, `cq-shadow`, and a small static `cq-command-sigil`; the leash must visually connect handler and collar without filling the tile.

## WarElephantV2Sprite
Insert in `design/conquestoria-sprites/lib/units-v2.jsx`; use `SpriteFrameV2`, `kind="animal"`, `variant="elephant"`. Make the trunk, two tusks, wide ears, plated head, broad body, wooden howdah, two crew silhouettes, and a small rune standard readable before surface decoration. Each leg must use one of `cq-leg-fl`, `cq-leg-fr`, `cq-leg-bl`, `cq-leg-br` in a wrapper-separated group. Include `cq-elephant-trunk`, `cq-howdah`, `cq-rune-standard`, and `cq-shadow`. No more than one rune glow and no more than three armour plate groups.

## CuirassierV2Sprite
Insert in `design/conquestoria-sprites/lib/units-v2.jsx`; use `SpriteFrameV2`, `kind="animal"`, `variant="mount"`. Make a horse’s head, mane, saddle, rider breastplate, closed helm, bright diagonal sabre, and a small faction sash read at 40px. Use four animal leg hooks in wrapper-separated groups. Add a restrained `cq-moonsteel-inlay` on the breastplate, plus `cq-weapon` with a correct viewBox pivot and `cq-hit-spark`. The sabre is the attack focal point; do not turn the rider into a generic knight.
</sprites>

<output_format>
Output one source component at a time with no prose. Preserve `SpriteFrameV2` and the existing JSX runtime. Use `_P2` for material fills and `_fa2(faction)` for faction colours. Do not create raster assets or new animation kinds.
</output_format>

<style_checklist>
- 128×128 native wrapper; 40px silhouette passes before details.
- Static forms carry SVG transforms; CSS-animation hooks are in untransformed inner wrappers.
- Four-legged units use diagonal gait hooks and retain a visible ground shadow.
- Idle, walk, attack, hurt, death, and reduced-motion states preserve meaningful information.
- No gradients, blur, text, hard-coded faction colours, or duplicated donor art.
</style_checklist>


---

## 2026-08-25 — Issue 710 corrective native-v2 reference brief

<role>
You are a senior SVG sprite artist and TypeScript developer. Produce editable flat geometric SVG/JSX source for an existing strategy game; do not produce raster art, a mockup, or generic icons.
</role>

<context>
Project: Conquestoria. These sprites appear at 40–120px on a hex map. Each needs a readable right-facing 2.5D silhouette at 40px before detail. A prior review rejected arrow-shaped aircraft, a paratrooper with no parachute, a board-shaped carrier, and a limbless General. Those outcomes are prohibited.
</context>

<reference_files>
1. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/sprite-system.tsx
2. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/units.tsx
3. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/assets/sprite-animations-v2.css
4. https://raw.githubusercontent.com/a1flecke/conquestoria/main/docs/sprite-design-system.md
5. https://raw.githubusercontent.com/a1flecke/conquestoria/main/design/conquestoria-sprites/lib/units-v2.jsx
</reference_files>

<design_system>
Use flat geometric forms, warm hand-made 2.5D composition, and major outlines in `#1f1a14`. No gradients, blur, photorealism, text, logos, hard-coded faction colors, donor reuse, or a single-polygon icon in place of anatomy. Use only: skin `#d4a373/#b08968/#8a5a3c`; cloth `#c19a6b/#e6dcc6/#7a6e5b/#5b4a7a`; metal `#5a6068/#8a929b/#b8895a/#d4a13c/#e8edf2`; wood `#c19a6b/#8a6a3a/#5e3f24`; stone `#c4b8a4/#9a8e78/#6a5e4a`; ground `#7ea860/#a08260/#d8c896/#3a6e94`; ink `#1f1a14/#3a3228`. Faction treatment uses only `f.dark`, `f.mid`, `f.bright`, and `f.trim` on limited identifier surfaces.

Use `SpriteFrameV2`, `_P2`, and `_fa2(faction)`. Static placement wrappers never animate. Every animated detail is nested beneath its visible owner and uses an untransformed child hook. Use existing kinds only: `ranged` for Paratrooper, `civilian` for both aircraft and General, and `naval` for Supercarrier. Do not create an `air` kind. Aircraft do not receive a generic weapon swing or a forward body thrust.
</design_system>

<sprites>
## ParatrooperV2Sprite
Use `kind="ranged"` and variant `paratrooper`. The top half is a round segmented olive-and-linen parachute canopy. At least six visible suspension lines converge into a shoulder harness around a complete helmeted soldier with rucksack, two arms, two legs, and compact rifle. Add `cq-parachute-canopy`, `cq-parachute-lines`, `cq-paratrooper-harness`, `cq-paratrooper-pack`, `cq-paratrooper-rifle`, arm, leg, and shadow hooks. Attack is local rifle recoil; never a lunge.

## NavalStrikeAircraftV2Sprite
Use `kind="civilian"` and variant `naval-strike-aircraft`. Draw a carrier strike jet, not an arrow: pointed nose, shaded canopy, substantial fuselage, broad swept wings, twin tail fins, tailhook, and a finned torpedo nested below the fuselage. Include `cq-strike-fuselage`, `cq-strike-cockpit`, `cq-strike-wing`, `cq-strike-tail`, `cq-strike-tailhook`, and `cq-naval-strike-torpedo`. Shared attack is a short belly-mount torpedo release; the aircraft glides or banks lightly and never thrusts like a spear.

## MaritimePatrolAircraftV2Sprite
Use `kind="civilian"` and variant `maritime-patrol-aircraft`. This differs from the strike jet: a longer, straight-wing twin-engine patrol aircraft with glazed cockpit, two nacelles, two propeller discs, tailplane, and clear radar dome or belly pod. Include `cq-patrol-fuselage`, `cq-patrol-wing`, `cq-patrol-nacelle-l`, `cq-patrol-nacelle-r`, `cq-patrol-prop-l`, `cq-patrol-prop-r`, and `cq-patrol-radar-dome`. Active state is a small radar scan only. Do not include `cq-weapon`, muzzle flash, torpedo, or gun.

## SupercarrierV2Sprite
Use `kind="naval"` and variant `supercarrier`. Draw a real ship: dark lower hull with distinct right-facing bow and stern, waterline and wake, tapered/foreshortened flight deck, runway stripe, island with mast, and three small parked aircraft with body-plus-wing shapes rather than chevrons. Include `cq-supercarrier-hull`, `cq-supercarrier-bow`, `cq-supercarrier-deck`, `cq-supercarrier-island`, `cq-supercarrier-mast`, `cq-supercarrier-aircraft`, and `cq-supercarrier-wake`. Active state launches one deck aircraft; it stays visually tied to the deck until clear. Do not reduce the ship to a rectangle or board.

## GreatGeneralV2Sprite
Use `kind="civilian"` and variant `great-general`. Use a complete standing officer: head, coat, cap, epaulettes, two bent arms holding an unfolded map, and two planted legs beside a command standard. Add `cq-general-body`, `cq-general-arm-l`, `cq-general-arm-r`, `cq-general-leg-l`, `cq-general-leg-r`, `cq-general-map`, and `cq-general-standard`. A restrained command/map gesture is allowed; weapon, muzzle-flash, and combat attack effects are forbidden.
</sprites>

<output_format>
Output one native source component at a time. Preserve `SpriteFrameV2`, the current JSX runtime, and `Object.assign(window, ...)` export registration. Do not register generated modules in the live native lookup: review evidence must approve them first.
</output_format>

<style_checklist>
- 128×128 native wrapper; each target passes a 40px silhouette check before detail.
- Every physical joint stays attached at idle, walk, active, hurt, death, and reduced motion.
- Local variant motion replaces generic ground weapon/thrust motion where inappropriate.
- Faction color is a small identifier; ink and materials remain readable.
- No gradients, blur, text, hard-coded faction colors, reused donor art, or arrow/board icons.
</style_checklist>

---

## 2026-08-30 — Issue 725 legendary-wonder map-landmarks reference brief

<role>
You are a senior strategy-game landmark artist. Produce an exact visual reference for three editable, flat geometric Canvas 2D landmarks; do not produce raster art, a UI mockup, or a unit sprite sheet.
</role>

<context>
Project: Conquestoria. These are stationary legendary-wonder landmarks rendered as small Canvas glyphs beside their host city. They must read at mobile map scale through one strong silhouette and a few structural details. The established renderer already owns construction ghosts, fog, known-rival presentation, low zoom, and reduced motion. This brief supplies art direction for Canvas draw functions in `src/renderer/wonders/legendary-wonder-bespoke-assets.ts`; it does not create a parallel SVG loader or DOM sprite path.
</context>

<reference_files>
1. https://raw.githubusercontent.com/a1flecke/conquestoria/main/docs/sprite-design-system.md
2. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/sprites/sprite-system.tsx
3. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/wonders/legendary-wonder-bespoke-assets.ts
4. https://raw.githubusercontent.com/a1flecke/conquestoria/main/src/renderer/wonders/legendary-wonder-renderer.ts
</reference_files>

<design_system>
Use flat geometric, layered map-landmark forms with a warm hand-made blend of history and restrained fantasy. Major edges use an ink-dark outline equivalent to `#1f1a14`; materials use stone `#c4b8a4/#9a8e78/#6a5e4a`, clay/wood `#c19a6b/#8a6a3a/#5e3f24`, metal `#5a6068/#8a929b/#b8895a/#e8edf2`, and signal highlights only where appropriate. No gradients, blur, photorealism, text, real-world logos, hard-coded faction colors, attack poses, recoil, walk, thrust, locomotion, or generic unit motion. Each static silhouette must retain all meaningful information. Optional ambient glint or radar sweep is permitted only when reduced motion is off; reduced motion must draw the same information without time variance.
</design_system>

<landmarks>
## Terracotta Army — `terracotta-army-bespoke`

Low, wide earthen mausoleum wall with three staggered ranks of clay soldier heads and upright spear tips. The silhouette must read as organized memorial ranks, never as a live combat formation. Use dark clay, terracotta, and pale earthen accents. A small completed-state glint is optional, but the wall and ranks remain complete without it.

## Crac des Chevaliers — `crac-des-chevaliers-bespoke`

Wide hilltop fortress with stepped curtain walls, twin gate towers, and a central keep. Show layers of light/mid/dark stone rather than a generic hall or active battlefield. A single tiny banner or torch glint may animate, but no assault, weapon, or moving character is allowed.

## NORAD — `norad-bespoke`

Compact command base with a radar dome or dish, antenna mast, and three bounded coverage arcs. It must communicate early warning and coordination without showing aircraft, missiles, text, or a real-world insignia. Use dark command surfaces, steel, and restrained cool signal highlights. A slow radar sweep is optional; fixed arcs must remain legible under reduced motion.
</landmarks>

<output_format>
Describe each landmark as Canvas primitives scaled exclusively from a supplied `radius`, with colors supplied by landmark metadata. Output one landmark at a time. Do not use transforms, sprite animation hooks, unit state machines, faction palettes, a raster asset, or a new renderer path.
</output_format>

<style_checklist>
- Every landmark has a unique silhouette at low zoom and mobile scale.
- Material detail supports, rather than obscures, the first-read silhouette.
- The completed static pose is meaningful without an animation frame.
- Construction remains the shared generic ghost; completed bespoke art never leaks early.
- Fog, unexplored rival locations, and lost races reveal no new map-art information.
- No gradients, blur, text, logos, faction colors, attack animation, or locomotion.
</style_checklist>
