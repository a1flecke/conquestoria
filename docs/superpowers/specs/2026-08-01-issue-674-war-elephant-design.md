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

## Inline cross-discipline review and resolutions

| Dimension | Finding in the first draft / live seam | Required resolution and proof |
| --- | --- | --- |
| Balance and fun | A 43-strength, 110-cost Era 4 shock unit needs a reliable answer rather than a resource lottery. The existing generic polearm counter is 50%, not the requested 35%. | Keep Ivory optional and encode a more-specific War Elephant polearm counter of exactly 1.35 that takes precedence over the generic 1.50 mounted row; Spearman and Pikeman remain the answer while their other mounted matchups do not change. Add deterministic matchups against Beast Handler, Spearman, Pikeman, and a same-era generalist. |
| New mechanics and play styles | Reusing `onRoughGround` would also penalize volcanic and mountain terrain, although the contract names only forest, jungle, swamp, and hills. A pure strength modifier cannot represent reduced return damage. | Add typed terrain-set metadata: open is the passable land complement of the four named rough terrains; only those four receive −15%. Add a catalog-driven combat-exchange rule that reduces return damage to 0.85 only when the attacker is War Elephant and defender is not Spearman/Pikeman. Show the public result in previews/history. |
| Ages 7–43, UI, and UX | The first description has to make the tactical tradeoff understandable before stat detail; contradictory or hidden counter language would create a trap for younger and returning players. | Use a <=18-word first sentence: “A powerful charger that thrives in open ground but fears polearms and rough terrain.” The unit detail surface then lists exact values, Tactics, optional Ivory discount, terrain conditions, shock, counter, and Beast Handler direction using icon plus text; it must refresh from canonical state on selection/production changes. |
| Difficulty and AI | A role label alone does not prove that computer players will produce, research toward, and use the unit without hidden rival information. | Give the unit typed `shock`, `mobile`, and `capture` AI roles, use existing catalog eligibility/cost functions, and add Explorer/Standard/Veteran fixtures proving the same legality, cost, research target, production candidate, and public combat exchange result. Add an AI attack fixture where shock changes its assessed exchange, and a negative polearm fixture where it does not. |
| Architecture and extensibility | `getCombatExchangeModifiers` is currently an air-only unit-ID branch. `CLASS_COUNTERS` returns the first match, so a new specific row must be selected deliberately rather than stacked accidentally. | Generalize exchange effects into typed rule definitions evaluated from public attacker/defender types; retain the existing air rules as data. Resolve counters by specificity (exact defender type before class), never by additive stacking. Keep UI and AI consumers on the shared combat/production helpers, with no `basic-ai`, panel-handler, or save-final-state special case. |
| Data, production, and saved games | `getProductionCostForItem` currently folds Circular Manufacturing’s substitute into live resources. It is currently safe only because Ivory is not selectable; the contract needs a durable boundary. | Resource-advantage evaluation receives live resources separately from an optional substitution and each advantage declares whether substitution can satisfy it. War Elephant Ivory is live-only; Circular Manufacturing can never grant it. No schema increment: unit and queue records remain unchanged. Regression-load a pre-#674 Beast Handler save unchanged and round-trip a saved War Elephant unit/queue unchanged. |
| SFX and sprites | A generic temporary animal fallback can work, but it must be visibly and audibly labelled temporary so it is not mistaken for delivery of the bespoke asset. | Register a working temporary animal sprite and beast-combat SFX through exhaustive catalogs with explicit `#708` and `#714` comments; verify catalog coverage and the fallback event path. #708 owns the bespoke War Elephant sprite and #714 owns the bespoke War Elephant audio replacement. |
| Solo, hot-seat, and regressions | Owner-only prerequisite completion and public combat facts need separate viewer boundaries. Shared state must not let a hot-seat rival infer a player’s uncompleted research. | Test solo production/combat and two-human hot-seat rendering: public terrain/shock/polearm facts are visible to both battle participants; only the owner sees prerequisite-completion guidance. Confirm a rival cannot observe uncompleted Tactics or resource ownership through the panel. |

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

Open terrain means a passable land target tile other than forest, jungle, swamp, or hills.
The War Elephant row must not reuse the broader Chariot `onRoughGround` predicate. Its
110 production cost is a `power-spike` pacing entry (the documented eleven-turn Era 4
ceiling), not a core-unit budget exception.

The 15% Ivory benefit applies only to new city production when the empire currently controls
live Ivory. It does not discount upgrades, queued grandfather production, crisis actors,
Circular Manufacturing substitutions, or any other unit. Stable/Cavalry Academy family
discounts remain #677 and are not introduced here.

## Presentation, AI, and accessibility

The first unit-description sentence is plain language and at most 18 words. Role details
surface shock, terrain bonus/penalty, polearm vulnerability, Tactics, Ivory's optional
production discount, the Beast Handler upgrade direction, and its terminal state using icon
plus text. Owner-only prerequisite completion remains hidden from a hot-seat rival.

The AI consumes the typed shock/mobile/capture roles and catalog eligibility, selects it only
for a genuine shock demand, respects the same resource-optional production costs, and never
reads hidden rival state. Explorer, Standard, and Veteran share definitions, legality,
modifiers, cost rules, and information boundaries; tests prove that parity.

## Data, saves, and assets

This adds catalog data and typed rule definitions only. Persisted unit and queue shapes remain
plain objects and need no schema increment; save normalization must preserve a pre-#674 Beast
Handler unit/queue and round-trip a current War Elephant unit/queue. The mechanics PR
registers temporary animal sprite and beast-combat SFX fallbacks with explicit comments: #708
replaces the sprite and #714 replaces the audio.

## Verification matrix

- TDD red/green tests cover each exact combat modifier, the four-terrain-only negative/positive
  boundary, polearm negation, no-Ivory legality, live-Ivory-only discount, and
  upgrade/crisis/Circular-Manufacturing discount exclusions.
- Deterministic balance fixtures cover Beast Handler predecessor, Spearman/Pikeman counter,
  and a same-era generalist.
- AI production/research/upgrade and exchange-assessment coverage is catalog-driven and
  non-omniscient across Explorer, Standard, and Veteran.
- Owner/rival rendered-panel tests prove viewer-scoped requirements and immediate canonical
  refresh; solo and two-human hot-seat cases share the canonical combat/production paths.
- Focused system/AI/UI/asset/save tests, source-rule checks, build, and durable full suite
  complete release verification.
