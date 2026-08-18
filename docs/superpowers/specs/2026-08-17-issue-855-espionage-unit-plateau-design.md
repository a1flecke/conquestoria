# Issue #855 — Spy-unit plateau design

## Problem

`spy_operative` (era 4, `cryptography`) is the top trainable spy unit from era 4 through era
11 inclusive — an 8-era plateau with no upgrade, while every other unit class in the game gets
a new tier roughly every 1-2 eras across the same span. This is a split-out follow-up to #442
("Add era-appropriate espionage missions for eras 5-9"), which shipped the era 5/8/9 spy
*missions* (PRs #853, #854) but explicitly deferred the unit-tier fix as a mechanically
separate problem (see #442 design doc, section 10).

All facts below were re-verified against current `main` (commit `9939ca37` at verification
time) per `.claude/rules/spec-fidelity.md` — the original hand-off doc's claim that
`propaganda-campaigns` is a "dead prerequisite-only tech" was found stale (it now gates
`state_broadcasting` + a gold bonus) and is not used here.

## Goals

- Insert two new spy tiers into the existing upgrade chain, closing the plateau without
  inventing new mechanics — every other unit class in this game earns its tier progression
  through stat/cost increments plus a paid upgrade action, and this should match that.
- Keep the new tiers thematically and mechanically honest: no promised capability that isn't
  real (`.claude/rules/content-description-honesty.md`).
- Make the upgrade concretely visible to the player, not just an internal number.

## Non-goals

- No new spy mechanics (promotion behavior, new mission-gating semantics). Spy missions are
  already gated by the civ's completed techs, not by unit type — `getAvailableMissions()` takes
  `completedTechs` only. A new unit tier does not gate any mission by itself.
- No rebalancing of `spy_hacker` or any other already-shipped spy tier.
- No fix for the pre-existing "tech-chain leapfrog" gap described below — it is not introduced
  by this change.

## Unit roster

| Unit | Era | Gating tech | Cost | Movement | Vision | Strength | Infiltration base |
|---|---|---|---|---|---|---|---|
| `spy_operative` (existing) | 4 | `cryptography` | 90 | 3 | 3 | 6 | 0.75 |
| **`spy_intelligence_officer`** (new) | 7 | `covert-operations` | 140 | 3 | 3 | 7 | 0.77 |
| **`spy_station_chief`** (new) | 9 | `counterintelligence` | 185 | 3 | 4 | 8 | 0.78 |
| `spy_hacker` (existing) | 12 | `cyber-warfare` | 234 | 2 | 2 | 5 | 0.80 |

Display names "Intelligence Officer" and "Station Chief" checked clean against every building,
tech, and trainable-unit name in the codebase. Cost and infiltration-base interpolate smoothly
against the existing curve; strength increases ~15-17% per new tier, a proportionally real jump
even though the infiltration-base delta itself is small (see "Visibility fix" below for why the
raw infiltration number is deliberately *not* the headline stat shown to players).

`spy_hacker`'s existing strength=5/vision=2/movement=2 (lower than `spy_operative`'s
strength=6/vision=3/movement=3) is pre-existing, intentional (remote/digital vs. physical
presence) and unrelated to this change.

## Tech gating

Both new units piggyback on existing era-7 and era-9 espionage techs rather than adding new
tech nodes, matching #442's own established pattern of pairing a unit/mission with an existing
tech (`intercept_courier`↔`black-chambers`, `bribe_official`↔`diplomatic-networks`, etc.):

- **`covert-operations`** (era 7) — already gates the `sabotage_relief` mission and a flat spy
  slot/success bonus. Offense-flavored, matching `spy_operative`'s "assassination, forgery, arms
  smuggling" description.
- **`counterintelligence`** (era 9) — already gates the `signals_intercept` mission. Same
  offense/intel flavor continuation.

`secret-police` (era 7) and `propaganda-campaigns` (era 9) were considered and rejected: both
are defensive/unrelated-flavor by comparison, and `propaganda-campaigns` already carries a
building + gold bonus unrelated to spy capability.

No `Tech.unlocks` prose changes are needed — entity names belong exclusively in `unlocksUnits`,
never in `unlocks` text, per `.claude/rules/end-to-end-wiring.md`.

## Chain restructuring

```
spy_operative (era4, cryptography)
  obsoletedByTech: 'cyber-warfare' → CHANGE to 'covert-operations'
  upgradesTo: 'spy_hacker' → CHANGE to 'spy_intelligence_officer'

spy_intelligence_officer (NEW, era7, covert-operations)
  obsoletedByTech: 'counterintelligence', upgradesTo: 'spy_station_chief'

spy_station_chief (NEW, era9, counterintelligence)
  obsoletedByTech: 'cyber-warfare', upgradesTo: 'spy_hacker'

spy_hacker (era12, cyber-warfare) — unchanged
```

This follows the codebase-wide convention (verified against every existing chain in
`TRAINABLE_UNITS`) that `obsoletedByTech(N) === techRequired(N+1)` exactly — the same tech that
retires a tier is the tech that unlocks its replacement. `tests/systems/unit-chain-integrity.test.ts`
enforces era-ordering for this generically.

**Known, accepted, pre-existing risk (not introduced by this change):** `cyber-warfare`'s own
prerequisites are `icbm-development` + `satellite-surveillance` — neither is downstream of the
espionage tech track. A civ that skips the entire espionage track but reaches `cyber-warfare`
via that unrelated path would retain whichever spy tier it last had (never obsoleted, since its
obsoleting tech was never researched) while also gaining `spy_hacker` access. This exact gap
class already exists today (e.g. at the `spy_agent`/`spy_hacker` seam, since `cryptography` is
also not a guaranteed prerequisite of `cyber-warfare`), because `obsoletedByTech` is single-valued
with no OR-condition anywhere in the codebase. Not fixed here — would require a new type-level
mechanism used nowhere else in the game, disproportionate to this MR's scope.

## Visibility fix

`getInfiltrationSuccessChance()` has zero UI callers anywhere in `src/ui/` — the infiltration
base number is invisible at production-choice time for all 5 existing spy tiers today (it only
surfaces indirectly, post-purchase, as a computed mission-success % in `espionage-panel.ts` once
a spy is stationed). Advertising the raw infiltration-base delta explicitly (+2 points, then +1
point) would read as anticlimactic and undercut the entire point of this MR.

Fix: give both new units `publicFacts` entries — the mechanism already used by combat units
(e.g. `armored_car`: `'+15% attack against targets below 60 HP'`) and already rendered in both
the production-choice UI (`city-panel.ts`) and the unit-info panel (`selected-unit-info.ts`).
Point the facts at the strength/vision jumps (proportionally real, ~15-17%) instead of the thin
infiltration delta, and describe infiltration qualitatively rather than numerically:

- `spy_intelligence_officer`: `['Better base infiltration odds than an Operative', '+1 combat strength for self-defense']`
- `spy_station_chief`: `['Better base infiltration odds than an Intelligence Officer', '+1 vision range and +1 combat strength']`

Both claims are verified true against the actual mechanics. No claim about counter-intelligence
resistance is made — that penalty (`cityCI * 0.004`) is flat and unit-tier-independent, so
claiming tier-based CI resistance would violate `content-description-honesty.md`.

The `civilian()` helper in `combat-role-definitions.ts` doesn't expose a `publicFacts` param, so
the two new units use the underlying `role('civilian', ...)` call directly instead of the
shorthand. The 5 existing spy tiers are deliberately left untouched (no `publicFacts` today) —
verified this doesn't create a same-screen inconsistency, since `obsoletedByTech` chaining means
only one spy tier is ever visible in the build queue at a time.

## End-to-end wiring checklist

**Core definitions**
1. `TRAINABLE_UNITS` entry in `city-system.ts` — cost/tech/obsoletedByTech/upgradesTo/pacing
2. `PRODUCTION_ICONS` entry in `city-system.ts`
3. `UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS` in `unit-system.ts`
4. `UNIT_ROLE_DEFINITIONS` in `combat-role-definitions.ts`, via `role('civilian', ...)` with
   `publicFacts` (see Visibility fix)
5. `unlocksUnits` on `covert-operations` and `counterintelligence` in their `tech-definitions-eras*.ts` files

**Spy-identity allowlists** (critical — miss these and the unit is inert)
6. `SPY_UNIT_TYPES` Set in `espionage-system.ts` — backs `isSpyUnitType()`, load-bearing in
   spy-record creation (`turn-manager.ts`, `economy-system.ts`), detection
   (`detection-system.ts`, `espionage-stealth.ts`), safehouse discount (`city-system.ts`), AI
   (`basic-ai.ts`), and the Disguise/Infiltrate/Embed UI buttons (`selected-unit-info.ts`)
7. `UNIT_CLASS_BY_TYPE` in `unit-modifier-definitions.ts` — exhaustive `Record`, TS-enforced
8. `UNSAFE_UNIT_TYPES` Set in `minor-civ-economy-system.ts` — silent gap, not TS-enforced;
   omitting it lets minor civs treat the new units as legitimate defensive combat units
9. `BARBARIAN_ELIGIBILITY_BY_UNIT` in `barbarian-roster.ts` — `exclude('unsupported')`,
   exhaustive/TS-enforced by the file's own design

**Rendering**
10. Unit-renderer icon in `unit-renderer.ts`
11. `FALLBACK_ICONS` in `unit-visual-resolver.ts` — exhaustive/TS-enforced
12. `UNIT_MOTION_STYLES` + `UNIT_SPRITE_CATALOG` in `sprite-catalog.ts` — both exhaustive/TS-enforced
13. **Correction (found while writing the implementation plan):** items 13-15 as originally
    written here were wrong. `getUnitSpriteV2` (`v2/index.ts`) has a tested, permanent
    live-DOM-overlay fallback for any unit type with no hand-authored pre-serialized
    `UNIT_SPRITES` entry (`.claude/rules/sprites.md`, "DOM-Overlay Live Fallback For Uncovered
    Unit Sprites" — added after issue #755 specifically so a missing v2 entry never silently
    fails to render). A `sprite-catalog.ts` JSX component + `UNIT_SPRITE_CATALOG` registration
    is sufficient for correct rendering; hand-authored `.svg.ts` files, `v2/index.ts`
    registration, and `tests/renderer/sprites/sprite-v2.test.ts`'s `UNIT_IDS` list are a
    pre-serialization *performance* optimization, not a correctness requirement, and are
    deferred to a `generate-sprite-prompt` skill follow-up rather than blocking this MR.

**SFX**
16. `UNIT_SFX` death entries in `sfx-catalog.ts` — reuse an existing spy death sound as a
    temporary fallback (established pattern in that file, e.g. `// Temporary mounted fallback
    for #672`) with a follow-up-issue comment rather than blocking on new audio synthesis
17. Locomotion tag (`'humanoid'`) in `sfx-catalog.ts`'s own locomotion map
18. `SPY_TYPES` array in `tests/audio/sfx-catalog.test.ts`

**Turn/lifecycle/AI** (automatic once the allowlists above are correct — verify with tests, no direct edits expected)
19. `turn-manager.ts` spy record creation on production completion
20. `economy-system.ts` rush-buy spy record creation
21. `main.ts` death cleanup
22. `processCity` tech-gated dequeue via `getTrainableUnitsForCiv`
23. `ai-production.ts` / `ai-unit-roles.ts` catalog-driven candidate generation

**Content honesty**
24. No `Tech.unlocks` prose change needed (see Tech gating section)

**Test-file spy-roster lists**
25. `tests/systems/espionage-system.test.ts` `SPY_TYPES` const
26. `tests/ui/selected-unit-info.test.ts` spy-type union (lower priority — test-helper type, not
    a completeness enumeration)

**New regression tests**
27. Chain-integrity `describe` block (matching the existing "early-modern mounted upgrade
    chain" pattern) locking `spy_operative → spy_intelligence_officer → spy_station_chief → spy_hacker`
28. Paid-upgrade test via `unit-upgrade-system.ts` for both new legs
29. Minor-civ / barbarian exclusion assertions for both new units
30. Hot-seat parity: two-civ test confirming spy-record creation and detection both key off the
    acting civ, not a hardcoded player

**Verification gates** (pre-existing tests that must pass, not new code)
31. `unit-chain-integrity.test.ts` — era-ordering check
32. `pacing-audit.test.ts` — full-catalog cost-outlier scan now includes the new costs
    (140/185); adjust if flagged, per `.claude/rules/game-balance.md`
33. `tech-unlocks-consistency.test.ts`

## PR split

Two phase PRs, matching #442's own Phase 1/Phase 2 pattern and the user's established
preference for incremental delivery over large batched releases:

- **Phase 1**: `spy_intelligence_officer` (era 7, `covert-operations`) — full wiring checklist
  above, plus the `spy_operative` chain edit (obsoletedByTech/upgradesTo retarget).
- **Phase 2**: `spy_station_chief` (era 9, `counterintelligence`) — full wiring checklist,
  plus the `spy_intelligence_officer` chain edit (set terminal in Phase 1, given its real
  successor in Phase 2).

Both phases: `yarn test` and `yarn build` green before push, per repo policy.

## Deferred, not fixed here

`SPY_UNIT_TYPES` (`espionage-system.ts`), `UNIT_CLASS_BY_TYPE`'s `'spy'` tags
(`unit-modifier-definitions.ts`), and 4+ test-file hardcoded spy-roster lists are independent
sources of truth for "which unit types are spies." Real duplication, but unifying them (e.g.
deriving `isSpyUnitType` from `UNIT_CLASS_BY_TYPE`) is an unrelated refactor — flagged as a
follow-up, not bundled into this MR.
