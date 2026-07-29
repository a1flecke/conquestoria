# Unit Sprite v2 Live-Fallback Design

> Fixes issue #755. Overlaps but is deliberately narrower than #611 (which additionally covers
> buildings, damage-state semantics, and coordination with #364 — out of scope here).

## Problem

The DOM-overlay animation pipeline (`sprite-overlay.ts` inserting live `<svg>` elements, which is
what lets `sprite-animations-v2.css`'s ambient-effect classes — `.cq-glow`, `.cq-fire`, `.cq-smoke`,
`.cq-wheel`, etc. — actually animate) only works for units with a hand-authored entry in
`UNIT_SPRITES` (`src/renderer/sprites/v2/index.ts`). Today that's 33 of 57 live unit sprite
functions in `units.tsx` (confirmed by diff, 2026-07-28). The other 24 fall through to `null` from
`getUnitSpriteV2`, which `sprite-overlay.ts` treats as "render via Canvas instead" — a permanently
static bitmap regardless of what CSS exists. This includes all 5 of the newest Era 13 units, whose
`.cq-glow` usage (shipped in PR #756) is currently invisible in the live game.

`UNIT_SPRITES` entries are hand-authored in a **separate, parallel content tree**
(`design/conquestoria-sprites/lib/units-v2.jsx`, using a `{faction, state, phase}` prop
convention), regenerated into `.svg.ts` files via `scripts/serialize-sprites.mjs`. This is not a
config gap — closing it for all 24 units the same way would mean hand-authoring real art, which
is out of scope for a mechanism fix.

### The v2 pipeline is richer than "pre-serialized with animation"

`civTypeToFaction()` (`src/renderer/civilization-visual-family.ts`) maps all 30 playable civs down
to 6 visual-style families (`imperials`, `vikings`, `pharaohs`, `hellenes`, `khanate`, `shogunate`),
and the v2 dialect hand-authors **distinct body/armor art per family** — a Viking Archer and an
Imperial Archer are different drawings, not just different colors. `FACTION_SPRITE_ACCENT` bakes a
fixed placeholder hex per family at author time; `applyFactionCivColor()` swaps it for the actual
civ's chosen color via string-replace at render time.

The live `units.tsx` catalog has none of this — one universal shape per unit type, recolored via
`FactionPalette` (`{dark, mid, bright, trim}`) derived from an arbitrary hex color via
`derivePalette()`. So closing the gap by switching wholesale to live functions would be a visible
regression for the 33 already-v2-native units (they'd lose their per-family variation).

## Goals

- Close the full 24-unit animation gap now (not just the 5 newest units) — via a **hybrid live
  fallback**, not new hand-authored art.
- Zero regression to the 33 existing v2-native units' archetype variation.
- Make "silently returns null / stays static forever" structurally impossible going forward, with
  a regression test that would have caught #755 before it shipped.
- File a follow-up issue for incrementally upgrading fallback-tier units to real v2-native
  archetype art — explicitly non-blocking for this design.

## Non-goals

- Building DOM-overlay coverage (`kind: 'building'` `SpriteEntity`s are never constructed for the
  live map at all — tracked separately in #658/#659; unrelated to this fix, which is unit-only).
- 4-tier damage-state art extension (#364) — the fallback tier gets whatever `units.tsx` already
  has inline (some units have partial `data-state="attack"`-gated elements like muzzle flash; none
  have wound-tier art), unchanged by this design.
- Full #611 scope (buildings, semantic body-plan matrix, coordinated damage-state policy).
- Authoring any new v2-native archetype art in this change — that's the follow-up issue.

## Architecture

`getUnitSpriteV2(unitType, faction)` in `src/renderer/sprites/v2/index.ts` gains a third parameter,
`civColor`, and a fallback branch:

```ts
export function getUnitSpriteV2(unitType: string, faction: string, civColor: string): string | null {
  const sprites = UNIT_SPRITES[unitType];
  if (sprites) {
    if (sprites.pirates) return faction === 'pirates' ? sprites.pirates : null;
    return sprites[faction] ?? sprites.beast ?? buildLiveFallbackUnitSprite(unitType, civColor);
  }
  return buildLiveFallbackUnitSprite(unitType, civColor);
}
```

Note the fallback also covers the narrower case where `sprites` exists (the unit type is in
`UNIT_SPRITES`) but has no entry for this specific `faction` and no shared `.beast` fallback either
— today that combination doesn't occur among the 24 missing units (verified: none are beasts or
pirate hulls, both fully v2-native already), but wiring it generically here — falling through to
the live function rather than `null` — costs nothing and closes a latent gap the same structural
guarantee test (see Testing) will otherwise have to special-case around.

`buildLiveFallbackUnitSprite(unitType: string, civColor: string): string | null`:

```ts
function buildLiveFallbackUnitSprite(unitType: string, civColor: string): string | null {
  const spriteFn = UNIT_SPRITE_CATALOG[unitType as UnitType];
  if (!spriteFn) return null; // genuinely unknown type — Canvas handles it, unchanged today
  const palette = civColor ? derivePalette(civColor) : NEUTRAL_FACTION_PALETTE;
  const rawSvg = spriteFn({ palette, svgOnly: true });
  // SpriteFrame's svgOnly output bakes in a fixed pixel width/height (unit sprites: 128x128).
  // The DOM overlay's outer wrapper (created in sprite-overlay.ts) controls actual display size
  // via CSS derived from camera.hexSize; the inner <svg> must fill it responsively instead of
  // carrying its own fixed size — same class of bug fixed for the building-icon feature (#665),
  // same fix shape: replace the baked attribute pair in place, never prepend a duplicate.
  const svg = rawSvg.replace(
    /(<svg\b[^>]*?)\swidth="\d+"\s+height="\d+"/,
    '$1 width="100%" height="100%"',
  );
  // data-kind deliberately omitted: no ambient-effect CSS class (.cq-glow, .cq-fire, etc.) is
  // data-kind-scoped, and guessing wrong (e.g. tagging a land unit "naval") risks triggering an
  // unrelated body-plan animation rule. Revisit per-unit once real v2-native art exists.
  return `<div class="cq-sprite-wrap cq-v2" data-state="idle" style="--phase:0">${svg}</div>`;
}
```

Imports added to `v2/index.ts`: `UNIT_SPRITE_CATALOG` from `@/renderer/sprites/sprite-catalog`,
`derivePalette`, `NEUTRAL_FACTION_PALETTE` from `../sprite-system`, and the `UnitType` type from
`@/core/types` (`UNIT_SPRITE_CATALOG` is typed `Record<UnitType, UnitSpriteComponent>`, so the
lookup needs `unitType as UnitType` — confirmed via `sprite-catalog.ts:223`). Confirmed no
circular import risk — `sprite-catalog.ts` has no dependency on anything under `v2/`.

`sprite-overlay.ts`'s private `lookupSprite(entity: SpriteEntity): string | null` gains a second
parameter, `civColor: string`, threaded through from its one call site (which already computes
`newCivColor` in the same scope for the later `applyFactionCivColor` call — no new plumbing, just
passing an existing local one call earlier):

```ts
case 'unit': return getUnitSpriteV2(entity.subtype, entity.faction, civColor);
```

`applyFactionCivColor(rawSvgHtml, entity.faction, newCivColor)` still runs unconditionally on
whatever `lookupSprite` returns, for both native and fallback output. For native output it performs
its existing accent-swap. For fallback output it is a **harmless no-op** — the fallback's color is
already final (baked in directly via `derivePalette`, not via a placeholder-accent substitution),
so there is nothing in the string for it to find and replace. This will be called out with an
inline comment on the `buildLiveFallbackUnitSprite` return so a future reader doesn't mistake the
no-op for a bug.

## Data flow

No change to `RenderLoop`'s entity-building or its call to `spriteOverlay.sync()`. On a pool miss
(a unit-sprite instance never seen before), `sync()` already computes `newCivColor =
colorLookup[entity.civId] ?? ''` before calling `lookupSprite`; that value is now passed through.
Once generated, the HTML string is cached in the sprite pool exactly like native sprites — the
extra function call and regex only run once per unit-instance-appearing-on-screen, not per frame.

### Edge cases

- **Genuinely unknown/typo'd unit type** (missing from both `UNIT_SPRITES` and
  `UNIT_SPRITE_CATALOG`): still returns `null` → Canvas, unchanged from today.
- **Empty/missing `civColor`**: falls back to `NEUTRAL_FACTION_PALETTE` rather than calling
  `derivePalette('')`, which would propagate `NaN` through the HSL math into a garbage hex string
  (confirmed by reading `hexToHsl`/`hslToHex` — `parseInt('', 16)` is `NaN`, and nothing downstream
  guards against it). Same defensive pattern already used in the city-panel building-icon feature.
- **Barbarians**: `colorLookup` is pre-seeded with `{ barbarian: '#8b4513' }`, so barbarian-owned
  units get a real, valid palette through the normal path — no special case needed. The
  `.claude/rules/sprites.md` note "barbarians and minor civs are not preloaded" is about the
  *Canvas* sprite cache's eager-preload behavior (a different pipeline, a performance/caching
  decision), not a "must stay static" requirement for the DOM overlay — this design does not
  change or conflict with that Canvas-cache rule.
- **Pirates and beasts**: unaffected. None of the 24 currently-missing units are pirate hulls or
  beasts (both are already 100% v2-native today) — their existing dedicated branches in
  `getUnitSpriteV2` are untouched by this change, and the new fallback line at the bottom of the
  `sprites` branch (see Architecture) only matters if that ever changes in the future.

## Testing

New/extended coverage in `tests/renderer/sprites/v2-index.test.ts` (or the closest existing v2 test
file — confirm during planning):

1. **Structural guarantee test** (the one that would have caught #755): loop over every key in
   `UNIT_SPRITE_CATALOG` — the canonical live roster — and assert
   `getUnitSpriteV2(type, 'imperials', '#4a90d9')` is never `null`. This stays correct automatically
   as new units are added; it's what makes "no unit ever silently stays static" a structural
   guarantee rather than a documentation promise.
2. Per-fallback-unit tests (the 24 units, or a representative sample plus the full-catalog loop
   above for exhaustiveness): output contains `cq-sprite-wrap cq-v2`, contains
   `width="100%" height="100%"` **exactly once each** (regression-guarding the duplicate-attribute
   mistake class fixed in #665), does not contain `data-kind`.
3. **Native-unit regression test**: for a v2-native unit (e.g. `archer`), assert the returned string
   is byte-identical to calling `UNIT_SPRITES.archer[faction]` directly — proves the new fallback
   branch is never reached for already-covered units.
4. **Empty/invalid civColor guard test**: `getUnitSpriteV2('rifleman', 'imperials', '')` does not
   throw and the output contains no `NaN` substring.
5. **Genuinely-unknown-type test**: `getUnitSpriteV2('not-a-real-unit', 'imperials', '#4a90d9')`
   returns `null`.
6. Full `yarn test` + `yarn build` at the end, per repo convention.

## Guardrail file updates

- **`.claude/hooks/check-src-edit.sh`**: the hardcoded-pixel-size `case` pattern (currently scoped
  to exactly `*/src/renderer/sprite-overlay.ts`) gains a second matched path,
  `*/src/renderer/sprites/v2/index.ts` — this is exactly the mistake class the check exists to
  prevent (a literal `128px`/`192px` instead of the responsive `100%` this design requires), and
  the new fallback code lives in a file the hook doesn't currently watch.
- **`tests/hooks/check-src-edit.test.sh`**: add a block case (hardcoded `width:128px` in
  `v2/index.ts`) and an allow case (the real `width="100%"` regex-replace pattern), mirroring the
  existing `sprite-overlay.ts` pair.
- **`.claude/rules/sprites.md`**: new subsection documenting the fallback mechanism as an
  intentional, permanent pattern — what triggers it, the `width="100%"` requirement, the
  deliberate omission of `data-kind`, and a pointer to the follow-up migration issue. Update the
  "Extension Recipe — Unit or Building Sprite" list to note that adding a new unit's catalog entry
  (existing step 5) now automatically grants DOM-overlay animation via the fallback — v2-native
  archetype art is optional richness, not a required step.
- **`docs/sprite-design-system.md`**: add a "Live render surfaces" paragraph to the Units section
  (the same pattern already used for Buildings after #659), explaining the two-pipeline split
  (DOM overlay = animated, Canvas = static fallback), the new three-tier reality (v2-native /
  live-fallback / — after this ships — zero units on silent static-only), and a pointer to the
  follow-up issue for the fallback-tier roster. Deliberately not retrofitting the existing
  40-row Units table (already flagged elsewhere in the doc as unmaintained past Era 5) with a new
  data axis.

## Follow-up issue (filed alongside this design, non-blocking)

Title: `art: migrate live-fallback unit sprites to native v2 archetype art`

Contents:
- **Detection, not a frozen list**: `Object.keys(UNIT_SPRITE_CATALOG).filter(t => !(t in
  UNIT_SPRITES))` as the canonical, always-current way to regenerate the fallback-tier roster —
  plus today's snapshot (the 24 units enumerated above) for immediate actionability, explicitly
  labeled as a snapshot, not a source of truth.
- **Claude Design prompt recipe**: pointing at `.claude/skills/generate-sprite-prompt.md`, plus
  what's different about v2-native art specifically — the `{faction, state, phase}` prop
  convention (vs. live `{palette, svgOnly}`), the 6 archetype body/armor styles each unit needs,
  the walk-cycle/attack/wound-tier CSS class contract (`cq-leg-l`, `cq-weapon`, `cq-wound-1..3`,
  etc.), and the `scripts/serialize-sprites.mjs` regeneration + verification step.
- Explicitly non-blocking: this design's fix does not depend on it; it's the incremental-richness
  path for whenever there's appetite for it.

## Self-review notes

- **Scope check**: unit-only, matching #755's actual title/scope; buildings and damage-tier art
  are explicitly out of scope and cross-referenced to their own tracking issues (#658/#659, #364).
- **Placeholder scan**: no TBD/TODO; every code sketch is a complete, real signature.
- **Internal consistency**: the `sprites[faction] ?? sprites.beast ?? buildLiveFallbackUnitSprite(...)`
  fallthrough in Architecture and the "latent gap" note in the same section agree with each other
  and with the Edge Cases section's "pirates and beasts unaffected today" claim — the extra
  fallthrough exists for future-proofing, not because a live gap exists today.
- **Ambiguity check**: `data-kind` omission, the `applyFactionCivColor` no-op behavior, and the
  civColor-empty-string guard were all candidates for being under-specified: each now has an
  explicit decision and rationale rather than being left to implementation-time judgment.
