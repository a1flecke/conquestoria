# Issue 708 visual review — mounted and beast formations

> The previous silhouette illustration was a review placeholder, not renderer output, and has been removed from this review. Do not use it to judge this MR.

For an actual interactive review, open [`sprite-preview.html`](assets/issue-708/sprite-preview.html) through the repository's Vite server. It mounts the committed generated modules directly and provides idle, walk, and attack state controls.

This draft-PR review covers the native source currently rendered by the map DOM overlay. The committed native SVG modules are the source of truth.

| Unit | Player-readable identity | Replaces | Animation/accessibility contract |
| --- | --- | --- | --- |
| Beast Handler | Masked handler, forked staff, rune leash, and collared hound | War Hound | `hound/war`: diagonal-pair `cq-leg-*` gait, body lunge, command-sigil information layer. |
| War Elephant | Plated head, ears, trunk, two tusks, howdah crew, and rune standard | War Hound | `animal/elephant`: diagonal-pair gait, slow heavy cadence, short charge lunge, retained trunk/howdah/standard layers. |
| Cuirassier | Horse head/mane, saddle armour, breastplate rider, sash, and bright sabre | Knight | `animal/mount`: diagonal-pair gait, mounted lunge, pivoted `cq-weapon` sabre and `cq-hit-spark`. |

## Implementation and safety review

- Gameplay balance, mechanics, production, AI, difficulty, data, saves, SFX, and solo/hot-seat rules are unchanged. This PR changes only the existing rendering paths.
- The existing viewer-scoped fog filter remains upstream of sprite resolution. The new art cannot reveal an unseen unit or leak a previous hot-seat player's information.
- The existing overlay preserves selected and health decorations, map/mobile sizing, and reduced-motion static presentation; focused regressions cover all three unit IDs.
- The source-of-truth pipeline is `units-v2.jsx` → serializer → generated per-faction module → `v2/index.ts`. No generated module was hand edited.
- Palette-driven faction identity, 128×128 view boxes, ink outlines, `data-kind`, phase desynchronization, animation hook wrapping, and CSS reduced-motion suppression follow the sprite design system.
- Animation proof is committed and tested: the v2-index regression checks all four animal/hound leg hooks and the Cuirassier weapon/hit-spark hooks; the CSS regression checks idle, walk, attack, variant cadence, diagonal-pair legs, and mounted weapon animation; the overlay regression checks combat and reduced-motion state propagation.
- A local interactive preview was attempted for visual QA but is blocked before game startup by the unrelated `fortification-system.ts` import error (`mapNeighbors` is absent from `hex-utils.ts`). The production build and automated sprite/overlay tests remain the delivery evidence for this draft.

## Out of scope

Chariot was already de-aliased in #769 and remains unchanged. Cavalry already has native v2 art. This visual-only subset does not include Task 44's audio work or any later combat-program visual batch.
