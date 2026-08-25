# Issue 708 visual review — mounted and beast formations

> The previous silhouette illustration was a review placeholder, not renderer output, and has been removed from this review. Do not use it to judge this MR.

For an actual interactive review, open [`sprite-preview.html`](assets/issue-708/sprite-preview.html) directly from the working copy or through the repository's Vite server. Its generated embedded payload mounts the committed native output and provides faction, idle, walk, and attack controls.

This draft-PR review covers the native source currently rendered by the map DOM overlay. The committed native SVG modules are the source of truth.

| Unit | Player-readable identity | Replaces | Animation/accessibility contract |
| --- | --- | --- | --- |
| Beast Handler | Masked handler, forked staff, rune leash, and right-facing collared hound | War Hound | `hound/handler`: independent handler brace, four-beat hound walk, tail/ear secondary motion, forward pounce, staff command, leash tension, and sigil pulse. |
| War Elephant | Right-facing plated head, ears, trunk, two tusks, howdah crew, and rune standard | War Hound | `animal/elephant`: slow four-beat weight transfer, ear/trunk/howdah/standard follow-through, and forward head-and-tusk charge. |
| Cuirassier | Right-facing horse head/mane, saddle armour, breastplate rider, sash, and bright sabre | Knight | `animal/mount`: four-beat horse travel, mane/tail/rider secondary motion, forward lunge, rider-led pivoted sabre, and forward `cq-hit-spark`. |

## Implementation and safety review

- Gameplay balance, mechanics, production, AI, difficulty, data, saves, SFX, and solo/hot-seat rules are unchanged. This PR changes only the existing rendering paths.
- The existing viewer-scoped fog filter remains upstream of sprite resolution. The new art cannot reveal an unseen unit or leak a previous hot-seat player's information.
- The existing overlay preserves selected and health decorations, map/mobile sizing, and reduced-motion static presentation; focused regressions cover all three unit IDs.
- The source-of-truth pipeline is `units-v2.jsx` → serializer → generated per-faction module → `v2/index.ts`. No generated module was hand edited.
- Palette-driven faction identity, 128×128 view boxes, ink outlines, right-facing 2.5D silhouettes, `data-kind`, phase desynchronization, animation hook wrapping, and CSS reduced-motion suppression follow the sprite design system. The preview exposes all six supported faction palettes.
- Animation proof is committed and tested: the v2-index regression checks all anatomy/secondary-motion hooks and six distinct faction serializations; the CSS regression checks state-scoped secondary motion and four-beat handler, elephant, and mount travel; the overlay regression checks combat and reduced-motion state propagation.
- The standalone local review page is the visual-QA surface and renders the committed generated modules directly. Full game startup remains blocked by the unrelated `fortification-system.ts` import error (`mapNeighbors` is absent from `hex-utils.ts`); the production build and automated sprite/overlay tests remain the delivery evidence for this draft.

## Out of scope

Chariot was already de-aliased in #769 and remains unchanged. Cavalry already has native v2 art. This visual-only subset does not include Task 44's audio work or any later combat-program visual batch.
