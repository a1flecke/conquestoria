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

That "24 units" count is scoped to unit *type* coverage and undercounts the real gap: a second axis
exists via owner identity. Minor-civ-owned units of *any* type — including the 33 supposedly-native
ones — already silently fall back to static Canvas too, because `getFaction()`
(`unit-map-presentation.ts`) returns the raw owner id string for any owner not in
`state.civilizations` (minor civs live in a separate `state.minorCivs` map), and that raw id never
matches any of the 6 baked archetype-family keys. See Architecture for how the fix handles both
axes with one fallthrough.

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

- Close the full 24-unit animation gap now (not just the 5 newest units), **and** the
  owner-identity gap affecting minor-civ-owned units of any type — via a **hybrid live fallback**,
  not new hand-authored art.
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

The fallback also covers a case that turned out, on closer check, to be real and currently
occurring rather than theoretical: `sprites` exists (the unit type is one of the 33 v2-native
types) but has no entry for this specific `faction`. `getFaction()`
(`src/renderer/unit-map-presentation.ts:95-99`) returns the raw `ownerId` string whenever the owner
isn't in `state.civilizations` — which is exactly the case for minor civs, tracked in a *separate*
`state.minorCivs` map. Minor civs do own real, on-map units (confirmed via ownership/war checks in
`minor-civ-economy-system.ts`), so **today, any minor-civ-owned unit of an already-native type
(e.g. a minor civ's `warrior`) already silently falls back to static Canvas rendering** —
`sprites[minorCivId]` is undefined, `sprites.beast` is undefined for non-beast types, so the
pre-existing code returns `null`. This is the same bug class #755 describes, just triggered by
owner identity instead of unit type, and it was undercounted in the Problem section's "24 units"
framing (that count is scoped to unit *types* covered by name; it doesn't capture this
owner-identity axis at all). This design's generic fallthrough — `sprites[faction] ?? sprites.beast
?? buildLiveFallbackUnitSprite(unitType, civColor)` — fixes it as a real, immediate side effect,
not a hypothetical one.

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

`UNIT_SPRITES` itself is a private, unexported `const` — nothing outside `v2/index.ts` can read it
directly. Add one new exported helper alongside `getUnitSpriteV2`:

```ts
export function isV2NativeUnit(unitType: string): boolean {
  return unitType in UNIT_SPRITES;
}
```

This gives tests and the follow-up issue's detection tooling (see below) a stable, intentional
public boundary instead of reaching into module internals — and it's the fix for two bugs a
second-pass review of this spec found: Testing item 3 originally proposed importing `UNIT_SPRITES`
directly (impossible, it isn't exported), and the follow-up issue's detection snippet had the same
problem. Both now use `isV2NativeUnit`.

`applyUnitMotion`/`withMotion` (in `sprite-catalog.ts`) only rewrite the inner `<g class=
"cq-sprite-figure">` tag (adding `data-motion`/`transform`), never the outer `<svg>` tag — so
calling `UNIT_SPRITE_CATALOG[unitType]({palette, svgOnly:true})` without an explicit `motion`
(defaults to `'idle'` via `props.motion ?? 'idle'`) is correct, and the width/height regex-replace
above is unaffected by it.

**Inner-`<svg>` `data-state`/`data-kind` are deliberately omitted, confirmed harmless**: native
pre-serialized sprites redundantly bake `data-state="idle" data-kind="ranged"` onto *both* the
outer wrapper div and the inner `<svg>` tag, but grep against `sprite-animations-v2.css` confirms
zero CSS selectors ever target `svg[data-state=...]` or `svg[data-kind=...]` directly — every rule
is scoped `.cq-v2[data-state=...] ...` (the outer wrapper). The inner svg's copies are vestigial
carryover from the JSX author-time render, not functional. The fallback's simpler single-copy
(outer div only) is therefore not a behavioral gap. Similarly, the inner `<svg class="cq-anim-idle">`
class inherited from `SpriteFrame`'s raw output has no matching rule when `svgOnly:true` (the
`<style>${ANIM_CSS}</style>` tag that would define `.cq-anim-idle` is only emitted when
`svgOnly:false`) — inert dead markup in both the native and fallback cases alike, not something
this design introduces.

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
- **Minor civs**: `getFaction()` returns the raw minor-civ id as `faction` (not one of the 6
  archetype names), so minor-civ-owned units of native types now correctly reach
  `buildLiveFallbackUnitSprite` via the `sprites[faction] ?? sprites.beast ?? ...` fallthrough
  instead of silently returning `null` as they do today — see Architecture for the full
  explanation. Confirmed `colorLookup` already resolves every minor civ id to a real hex color
  (`render-loop.ts`: populated in a loop over `state.minorCivs` immediately after the
  civilizations loop, via `MINOR_CIV_DEFINITIONS`), so this reaches `derivePalette()` with a valid
  color, not the `NEUTRAL_FACTION_PALETTE` guard — no additional wiring needed.
- **Pirates and beasts**: unaffected by *unit-type* coverage — none of the 24 currently-missing
  unit types are pirate hulls or beasts (both are already 100% v2-native today), and their
  dedicated branches (`sprites.pirates`, `sprites.beast`) in `getUnitSpriteV2` are untouched. The
  general `sprites[faction] ?? sprites.beast ?? buildLiveFallbackUnitSprite(...)` fallthrough does
  reach real cases today (see Minor Civs above) — that's a different axis (owner identity, not
  unit type), and doesn't interact with pirates/beasts specifically since neither is minor-civ
  owned in practice.

## Testing

New/extended coverage in `tests/renderer/sprites/v2-index.test.ts` (or the closest existing v2 test
file — confirm during planning):

1. **Structural guarantee test** (the one that would have caught #755): loop over every key in
   `UNIT_SPRITE_CATALOG` — the canonical live roster — and assert
   `getUnitSpriteV2(type, 'imperials', '#4a90d9')` is never `null`. This stays correct automatically
   as new units are added; it's what makes "no unit ever silently stays static" a structural
   guarantee rather than a documentation promise.
2. Per-fallback-unit tests (the 24 units, or a representative sample plus the full-catalog loop
   above for exhaustiveness): output contains `cq-sprite-wrap cq-v2`, contains `cq-sprite-figure`
   (the actual class the idle-breathing CSS rule targets — asserting just the outer wrapper
   classes isn't enough to prove the ambient-animation hook point survived), contains
   `width="100%" height="100%"` **exactly once each** (regression-guarding the duplicate-attribute
   mistake class fixed in #665), does not contain `data-kind`.
3. **Native-vs-fallback classification test**: `isV2NativeUnit('archer') === true` (a native unit)
   and `isV2NativeUnit('tank') === false` (a fallback unit). Note this can't be proven by comparing
   output markup shape — native output already has `width="100%"` baked in by the design/*.jsx
   serializer too, so both paths converge on the same final attribute values; `isV2NativeUnit` is
   the only reliable signal for which path a given unit takes.
4. **Empty/invalid civColor guard test**: `getUnitSpriteV2('rifleman', 'imperials', '')` does not
   throw and the output contains no `NaN` substring.
5. **Genuinely-unknown-type test**: `getUnitSpriteV2('not-a-real-unit', 'imperials', '#4a90d9')`
   returns `null`.
6. **Minor-civ-owned native-unit regression test** (the real, currently-occurring gap found during
   review, not a hypothetical): `getUnitSpriteV2('warrior', 'some-minor-civ-id', '#7a5a16')` — a
   native unit type with a non-archetype `faction` string — is non-null and uses the fallback path
   (i.e. `isV2NativeUnit('warrior') === true` but the returned markup came from
   `buildLiveFallbackUnitSprite`, not a `UNIT_SPRITES.warrior[...]` entry). This is the test that
   would have caught the fact that minor-civ-owned units of *any* type were silently static before
   this design existed.
7. Full `yarn test` + `yarn build` at the end, per repo convention.
8. **Manual live-render verification (before merge, not automated)**: jsdom tests only prove markup
   shape — they cannot prove a CSS animation actually runs in a real browser. Following the pattern
   already established this session (rsvg-convert-to-PNG for static checks, an Artifact-published
   page checking `getComputedStyle(...).animationName` for live checks), verify at least one
   fallback-tier unit that uses an ambient-effect class (e.g. a unit with `.cq-glow`) genuinely
   animates once rendered through the real DOM overlay path, not just that its markup contains the
   right class names.

## Guardrail file updates

- **`.claude/hooks/check-src-edit.sh`**: **not** a matter of adding `v2/index.ts` to the existing
  `sprite-overlay.ts` case arm — a second-pass review of this spec caught that the existing check's
  grep pattern (`width:[0-9]+px|height:[0-9]+px`) matches CSS `style.cssText` syntax
  (`width:128px`), which is what `sprite-overlay.ts` writes. The code this design adds to
  `v2/index.ts` produces SVG *attribute* syntax instead (`width="128"` — no colon, no `px` unit).
  Reusing the existing pattern on the new file would add a case arm that can structurally never
  fire on the mistake it's meant to catch — a guardrail that looks present but provides zero actual
  protection. Instead, add a **new, separately-patterned** check scoped to
  `*/src/renderer/sprites/v2/index.ts` that greps for a literal hardcoded `width="[0-9]+"` (digits
  immediately followed by the closing quote — i.e. NOT the correct `width="100%"` output, since `%`
  before the quote doesn't match, and NOT the regex source `width="\d+"` either, since `\d` isn't a
  digit character). This correctly flags a future author accidentally hardcoding a literal pixel
  value in the fallback's replacement string while leaving the correct code and this file's own
  pattern-matching regex untouched (both verified by hand against the proposed grep pattern).
- **`tests/hooks/check-src-edit.test.sh`**: add a block case (a literal `width="128" height="128"`
  string in `v2/index.ts`) and two allow cases — the correct `width="100%" height="100%"` output,
  and the regex literal `width="\d+"` itself (proving the hook doesn't flag its own detection
  pattern) — mirroring the existing `sprite-overlay.ts` pair's block/allow structure.
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
- **Detection, not a frozen list**: `Object.keys(UNIT_SPRITE_CATALOG).filter(t =>
  !isV2NativeUnit(t))` — using the exported `isV2NativeUnit` helper this design adds (not
  `UNIT_SPRITES` directly, which is private) — as the canonical, always-current way to regenerate
  the fallback-tier roster, plus today's snapshot (the 24 units enumerated above) for immediate
  actionability, explicitly labeled as a snapshot, not a source of truth.
- **Claude Design prompt recipe**: pointing at `.claude/skills/generate-sprite-prompt.md`, plus
  what's different about v2-native art specifically — the `{faction, state, phase}` prop
  convention (vs. live `{palette, svgOnly}`), the 6 archetype body/armor styles each unit needs,
  the walk-cycle/attack/wound-tier CSS class contract (`cq-leg-l`, `cq-weapon`, `cq-wound-1..3`,
  etc.), and the `scripts/serialize-sprites.mjs` regeneration + verification step.
- Explicitly non-blocking: this design's fix does not depend on it; it's the incremental-richness
  path for whenever there's appetite for it.

## Self-review notes

**First pass** (at authoring time):
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

**Second pass** (requested review against completeness/correctness/rendering/animation/guardrails/
consistency — every item below was a real bug or gap, not a formality check; all fixed inline):
- **Correctness bug**: Testing item 3 and the follow-up issue's detection snippet both referenced
  `UNIT_SPRITES` as if importable — it's a private, unexported `const`, so neither was actually
  runnable as written. Fixed by adding an exported `isV2NativeUnit()` helper and routing both
  through it.
- **Guardrail bug (the most serious finding)**: the hook-extension proposal reused the existing
  `sprite-overlay.ts` check's grep pattern (`width:[0-9]+px`, CSS syntax) for a file
  (`v2/index.ts`) that produces a structurally different syntax (`width="128"`, SVG-attribute
  syntax). That pattern can never match the mistake it's meant to catch on the new file — a
  guardrail that would look present in a diff but provide zero real protection. Replaced with a
  correctly-patterned, separately-scoped check, hand-verified against both the correct output
  (`width="100%"`) and the detection regex's own source text (`width="\d+"`) to confirm neither
  false-positives.
- **Verified, not assumed**: `withMotion`'s `motion` parameter defaults to `'idle'` when omitted
  (checked `sprite-catalog.ts`'s implementation directly rather than assuming), so the Architecture
  code sketch's `spriteFn({palette, svgOnly:true})` call (no explicit `motion`) is correct.
  `applyUnitMotion` only rewrites the inner `<g class="cq-sprite-figure">` tag, never the outer
  `<svg>` tag, confirming the width/height regex-replace is unaffected by it.
  `updateUnitDecorations` (selection ring, stack pill, health bar, fortified badge, role marker)
  reads only from the `entity` object, never from the sprite's own `data-kind`/`data-state`
  attributes — confirmed by reading the full function, not just skimming — so omitting them from
  the fallback's inner `<svg>` cannot break unit decorations.
- **Testing gap**: item 2 originally checked only for `cq-sprite-wrap cq-v2` presence, not
  `cq-sprite-figure` — the actual class the idle-breathing CSS rule targets. A markup shape could
  pass the original assertion while still failing to animate. Fixed.
- **Missing verification tier**: added an explicit manual live-render check (item 8) — jsdom tests
  can prove markup shape but not that a CSS animation actually runs in a real browser; this closes
  that gap using the rsvg-convert/Artifact-based pattern already established elsewhere this
  session, rather than treating passing unit tests as sufficient proof of "proper animation."
- **Completeness gap, the most consequential finding**: the Problem/Goals sections originally
  scoped this fix to "24 unit types" — undercounting the real impact. Tracing `getFaction()`
  (`unit-map-presentation.ts`) showed it returns the raw owner id, not an archetype name, whenever
  the owner isn't in `state.civilizations` — true for minor civs (a separate `state.minorCivs`
  map), which do own real on-map units per `minor-civ-economy-system.ts`'s ownership/war checks.
  So minor-civ-owned units of *any* of the 57 types — not just the 24 fallback-tier ones — are
  *already*, today, silently static, via the same root cause. Verified `colorLookup` already
  resolves minor civ ids to real colors (`render-loop.ts`), so no extra wiring is needed beyond
  this design's existing generic fallthrough — but the Problem, Goals, Edge Cases, and Testing
  sections all needed rewording to state this as a real fix, not a "latent, doesn't occur today"
  footnote (which is what the first pass incorrectly claimed).
