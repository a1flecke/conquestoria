# War Elephant Corps Design

## Goal

Deliver #674 as a resource-optional Era 4 shock unit that completes the Beast Handler
upgrade line while preserving clear polearm counterplay, legal AI production, hot-seat
privacy, and the later #708/#714 asset handoff.

## Current-state and prerequisite audit

- Base: `origin/main` at `e98a3fbf808dccd75e2b9f751e25a22c09af2e85`.
- #666–#669 and #673 are merged. Beast Handler is typed, trainable at Horseback Riding,
  terminal only because this successor does not yet exist, and has no resource gate.
- `tactics`, `ivory`, combat modifier facts, terrain context, generic production-cost
  modifiers, AI catalog production, role presentation, and temporary sprite/SFX catalogs
  are live seams.
- No `war_elephant` type, replacement edge, Ivory discount, or conflicting implementation
  exists. The archived governing design's old paths are re-audited rather than assumed.

## Chosen approach

Add typed definition/catalog metadata and consume it through the existing shared combat and
production helpers. This keeps player combat, AI combat, previews/history, production UI,
and hot-seat viewers on one calculation path. It avoids a special `war_elephant` branch in
`basic-ai`, UI handlers, or final-state scans.

The alternatives rejected are (a) direct unit-ID branches across consumers, which would
duplicate rules and drift, and (b) delaying the modifiers, which would make the advertised
shock unit a strict-stat upgrade rather than #674's tactical decision.

## Gameplay contract

War Elephant Corps is a Tactics-gated Era 4 trainable land unit with:

- production cost 110; strength 43; movement 2; vision 2;
- +20% initiating attack on open terrain;
- −15% initiating attack on forest, jungle, swamp, or hills;
- shock: reduce non-polearm return damage by 15%;
- Spearman and Pikeman gain +35% against it, and this polearm counter ignores shock;
- no hard Ivory requirement; controlled live Ivory discounts city production 15% only;
- `Beast Handler Company → War Elephant Corps` using the explicit Tactics obsolescence
  edge; no invented successor after War Elephant.

The 15% Ivory benefit does not discount upgrades, queued grandfather production, crisis
actors, or any other unit. Stable/Cavalry Academy family discounts remain #677 and are not
introduced here.

## Presentation, AI, and accessibility

The first unit-description sentence is plain language and at most 18 words. Role details
surface shock, terrain bonus/penalty, polearm vulnerability, Tactics, Ivory's optional
production discount, the Beast Handler upgrade direction, and its terminal state using icon
plus text. Owner-only prerequisite completion remains hidden from a hot-seat rival.

The AI consumes the typed shock role and catalog eligibility, selects it only for a genuine
shock demand, respects the same resource-optional production costs, and never reads hidden
rival state. Explorer, Standard, and Veteran share definitions, legality, modifiers, cost
rules, and information boundaries; tests prove that parity.

## Data, saves, and assets

This adds catalog data only. Persisted unit and queue shapes remain plain objects and need
no schema increment; save normalization must preserve old Beast Handler units/queues and
accept the new type after it is saved. The mechanics PR registers temporary animal sprite
and mounted/beast SFX fallbacks with explicit comments: #708 replaces the sprite and #714
replaces the audio.

## Verification matrix

- TDD red/green tests cover each exact combat modifier, polearm negation, rough-terrain
  negative case, no-Ivory legality, and upgrade/crisis-discount exclusions.
- Deterministic balance fixtures cover Beast Handler predecessor, Spearman/Pikeman counter,
  and a same-era generalist.
- AI production/research/upgrade coverage is catalog-driven and non-omniscient.
- Owner/rival rendered-panel tests prove viewer-scoped requirements; solo and two-human
  hot-seat cases share the canonical combat/production paths.
- Focused system/AI/UI/asset/save tests, source-rule checks, build, and durable full suite
  complete release verification.
