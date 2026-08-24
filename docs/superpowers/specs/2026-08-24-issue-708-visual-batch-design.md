# Issue 708 Ancient Mounted and Beast Visual Batch Design

## Goal

Replace the remaining temporary unit-sprite mappings owned by issue 708 with distinct,
repo-native animated SVG art, and make that exact art reviewable remotely in the same
draft pull request.

## Re-audited scope

The historical issue body lists Chariot, Cavalry/Cuirassier, Beast Handler, and War
Elephant. Current `origin/main` differs: Chariot was de-aliased in #769 and Cavalry
already has native v2 art. This batch therefore replaces only these live aliases:

| Unit ID | Existing temporary donor | Final visual identity |
| --- | --- | --- |
| `beast_handler` | `WarHoundSprite` | A human handler and trained hound: command-and-support silhouette |
| `war_elephant` | `WarHoundSprite` | A large tusked elephant with howdah and rider: heavy shock silhouette |
| `cuirassier` | `KnightSprite` | An early-modern armored horseman with breastplate and pistol/sabre: heavy-cavalry silhouette |

No unit definition, balance value, save data, production rule, audio cue, or player action
changes in this batch. Chariot and Cavalry remain untouched.

## Architecture

Each unit receives a hand-authored `src/renderer/sprites/v2/*.svg.ts` module and a native
entry in `UNIT_SPRITES` through `src/renderer/sprites/v2/index.ts`. The existing
`UNIT_SPRITE_CATALOG` supplies the low-zoom/static pipeline; its three aliases are
replaced with corresponding distinct repo-native functions in `units.tsx` where that
pipeline requires them. Both render paths retain faction palette flow and never hardcode
civilization identity.

Native v2 art must use the existing 128 × 128 wrapper, right-facing 2.5D silhouette, warm
materials, ink outlines, and appropriate state hooks. Cuirassier uses `data-kind="melee"`;
the handler and elephant use a dedicated supported quadruped/beast hook only when the
existing animation CSS proves it is valid. Otherwise they use the canonical melee body plan
without claiming unsupported animation semantics.

## Remote visual review

The same draft PR includes a Markdown board under `docs/reviews/` and committed PNG assets
under `docs/reviews/assets/issue-708/`. The board embeds the assets using repository-relative
paths and labels every unit and state. It shows the final implementation—not concept art—at:

- map and mobile scales;
- normal and high-contrast faction palettes;
- visible, selected, and fog-obscured map contexts; and
- idle plus reduced-motion-safe static presentation.

The board names the visual cue that distinguishes each unit from its prior donor and its
adjacent family member. It does not claim that fog reveals hidden-unit information: the
fog image verifies only the renderer's existing obscuring treatment.

## Acceptance criteria

- Focused tests are added before source changes and first fail because the three units are
  not native v2 entries / still serialize identically to their temporary donors.
- The three catalog aliases are removed and Chariot/Cavalry remain unchanged.
- Each unit resolves for every supported faction, includes its documented animation and
  semantic markers, and remains available through the existing minor-civilization fallback.
- Review images are reproducibly generated from the committed sprites and embedded in the
  Markdown board in the same draft PR.
- Existing map/mobile/fog/high-contrast and reduced-motion behavior remains intact.
- No production, mechanics, state, save, UI-action, or audio changes are present.

## Verification

Run the sprite catalog and v2-index tests, any focused overlay/render tests needed by the
preview generator, the source-rule checker for changed `src/` files, `git diff --check`, the
production build, and the durable test suite before the draft PR is marked ready for review.

## Delivery

Create one draft PR titled for issue 708's remaining mounted-and-beast visual batch. Its
description calls out the Chariot scope drift, links the embedded visual board, lists no
mechanics changes, and identifies the PR as an independently mergeable visual-only subset of
the parent visual/audio plan.
