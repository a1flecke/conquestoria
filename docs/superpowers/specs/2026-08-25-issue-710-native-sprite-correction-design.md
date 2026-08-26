# Issue 710 Native Sprite Correction Design

**Issue:** #710 — air-defense and orphaned visual replacements

## Corrective purpose

The first native-v2 candidates were rejected: they skipped the sprite prompt and #709 evidence gate, so aircraft became arrow-like, their motion looked like thrust, the Paratrooper had no parachute, the Supercarrier read as a board, and the General lacked limbs. Those prototypes are discarded and are not a base for iteration.

## Scope

Rebuild both the palette-driven fallback and review-only native-v2 candidate for these five units.

| Unit | Required 40px silhouette | Active-state motion |
| --- | --- | --- |
| Paratrooper | round canopy, six-plus lines, harness, pack, helmeted whole soldier, rifle | local rifle recoil; canopy/harness stay attached |
| Naval Strike Aircraft | carrier jet with nose, cockpit, fuselage, swept wings, twin tail, tailhook, belly torpedo | torpedo releases from belly mount; airframe does not thrust |
| Maritime Patrol Aircraft | long-wing twin-engine prop aircraft with cockpit, tailplane, radar dome/pod | radar scan only; no weapon, flash, or thrust |
| Supercarrier | bow, stern, hull/waterline/wake, tapered deck, island/mast, runway, three parked aircraft | a deck aircraft launches while its parent deck remains coherent |
| Great General | head, coat, cap/epaulettes, two arms, two legs, map held by both hands, standard | command/map gesture only; no weapon or muzzle flash |

SAM Site stays a static building-catalog replacement. The review surface must mount actual SAM Site and Radar Station catalog output together at 40px, 64px, and 128px; Radar Station changes only if this direct comparison exposes a defect.

No gameplay, tech, production, AI, save, audio, or action semantics change.

## Art and motion rules

Use the canonical warm, flat, ink-outlined 2.5D SVG language and material palette. Faction color is limited to identifiers such as a canopy panel, roundel, deck marking, map trim, or standard; it never replaces material hierarchy.

Paratrooper uses existing `ranged`, the two aircraft and General use `civilian`, and Supercarrier uses `naval`. Each variant explicitly replaces inappropriate generic action motion locally; no new global `air` body plan is introduced.

Every moving detail stays nested beneath its physical owner: canopy lines under canopy/harness, torpedo under belly mount, propellers in nacelles, launch aircraft in the deck, and map below both General hand/arm groups. Static placement wrappers never animate; only unpositioned detail/joint children may transform, from an explicit local origin.

## Evidence gate

1. Add red contracts for native identity, role markers, valid kind/variant, forbidden combat hooks on Maritime Patrol and General, fallback parity, CSS motion, and file-safe evidence.
2. Author fallback/native source and serialize review-only payloads. Do not register native output.
3. Capture committed 40/64/128 identity sheets and browser-driven 0/25/50/75% paused phase sheets using the same serialized payload and production CSS the player sees.
4. Review all five, six factions, reduced motion, and SAM-vs-Radar. Any silhouette or attachment defect returns to source authoring.
5. Only after explicit acceptance register the five native payloads and run focused overlay, animation, catalog, preview, and source-rule checks.

The reviewer page alone is not evidence. The review Markdown must link and explain every image.

## Testable native markers

- Paratrooper: `cq-parachute-canopy`, `cq-parachute-lines`, `cq-paratrooper-harness`, `cq-paratrooper-pack`, `cq-paratrooper-rifle`, `cq-arm-l`, `cq-arm-r`, `cq-leg-l`, `cq-leg-r`.
- Naval Strike: `cq-strike-fuselage`, `cq-strike-cockpit`, `cq-strike-wing`, `cq-strike-tail`, `cq-strike-tailhook`, `cq-naval-strike-torpedo`.
- Maritime Patrol: `cq-patrol-fuselage`, `cq-patrol-wing`, `cq-patrol-nacelle-l`, `cq-patrol-nacelle-r`, `cq-patrol-prop-l`, `cq-patrol-prop-r`, `cq-patrol-radar-dome`.
- Supercarrier: `cq-supercarrier-hull`, `cq-supercarrier-bow`, `cq-supercarrier-deck`, `cq-supercarrier-island`, `cq-supercarrier-mast`, `cq-supercarrier-aircraft`, `cq-supercarrier-wake`.
- Great General: `cq-general-body`, `cq-general-arm-l`, `cq-general-arm-r`, `cq-general-leg-l`, `cq-general-leg-r`, `cq-general-map`, `cq-general-standard`.

The review test requires all five states, four paused phases, six factions, reduced motion, no module/import/network/sidecar dependency, ten unit evidence images, and a SAM/Radar comparison.

## Acceptance

At 40px every unit identifies without its label. Aircraft are not arrows and do not thrust; Paratrooper's canopy reads before kit; Supercarrier floats as a ship; General stands as a complete person. Each stated relationship remains attached at every sampled phase and in reduced motion.
