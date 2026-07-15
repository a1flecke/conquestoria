# Zone of Control and Flanking/Support Design

**Issue:** #538 — `design(combat): zone of control + flanking/support bonuses`  
**Status:** Approved for planning  
**Date:** 2026-07-14

## Goal

Make battlefield positioning matter without obscuring why a move or combat result changed. Combat units can hold a line through zone of control (ZOC), while adjacent friendly combat positions provide visible flanking and support bonuses.

The player must see a ZOC-limited destination before moving and must receive a plain-language explanation after the unit stops. The same gameplay rules apply to the player, major AI, and hostile world actors.

## Scope and Rules

### Zone of control

A unit that enters a tile adjacent to a hostile qualifying combat unit may complete that move, but its remaining movement immediately becomes zero. ZOC never makes that destination illegal; it is a reachable terminal destination for the current turn.

ZOC is evaluated for the entered tile, after normal terrain, road, river, technology, occupancy, and hostile-city movement validation. A unit starting adjacent to an enemy is not trapped: it can move normally until it enters a qualifying hostile ZOC tile.

ZOC is domain-local:

- A land combat unit affects land combat units.
- A naval combat unit affects naval combat units.
- Air units neither exert nor receive ZOC. Their current movement model crosses terrain at a fixed cost and their interactions remain combat-at-range rather than map-tile pinning.
- A unit cannot affect another domain across a coastline.

A qualifying ZOC source is a hostile, non-air combat unit in the same domain. Recon and civilian/non-combat units neither exert nor receive ZOC. A stack exerts ZOC if it contains a qualifying combat unit; where a strength choice is needed, use its strongest qualifying combat unit rather than treating each stacked unit as another source.

Hostility must use the existing owner/diplomacy semantics. The rule applies symmetrically to major civilizations and the hostile world actors already represented by units: barbarians, beasts, pirates, and rebels. It does not vary by difficulty, player count, hot-seat mode, or save state.

Horizontal map wrapping must be honored when detecting adjacency.

### Movement presentation and feedback

Movement-range calculation must distinguish ordinary reachable tiles from ZOC-limited reachable tiles. The renderer presents the latter in **amber** with a warning treatment (icon or equivalent), while ordinary reachable tiles retain the existing movement presentation. Amber means: “Reachable, but movement ends here.” It must not look like an impassable or attack-only tile.

When a unit enters a ZOC-limited tile, the live player movement path uses `MovementBlockerReason`-style feedback with the new `zone-of-control` code and the text:

> Stopped — enemy nearby

The message is player-facing; non-player callers still receive the same canonical movement outcome without requiring UI notification logic.

### Flanking and support

Combat receives two independent +10% bonuses per eligible adjacent tile:

- **Flanking:** the attacker gains +10% for each adjacent tile to the defender containing a friendly combat unit other than the attacker’s own tile.
- **Support:** the defender gains +10% for each adjacent tile to the defender containing a friendly combat unit other than the defender’s own tile.

Each bonus counts **occupied adjacent tiles**, not units. A stack of two or more friendly combat units on one adjacent hex contributes only one +10% bonus. A tile qualifies only when it contains at least one friendly combat unit; tiles occupied only by recon or civilian units do not qualify. Air units do not participate in either adjacency bonus.

The canonical combat-strength calculation returns labeled modifier parts so the existing combat preview shows the exact result, for example `Flanked +20%` and `Supported +10%`. Combat resolution and every prediction path use those same values.

## Architecture

Introduce focused, stateless helper(s) in the unit/combat systems rather than duplicating caller-specific checks.

1. A ZOC helper determines whether a unit qualifies as a source/recipient and whether a destination is in a hostile same-domain ZOC, using map-aware neighbor traversal and the game’s existing owner hostility semantics.
2. The movement-range and path/step validation path exposes the terminal-ZOC outcome. `executeUnitMove` applies it by setting the moved unit’s remaining movement to zero. Player movement, AI movement, and world movement all route through canonical movement helpers.
3. The movement-rendering path receives the ZOC-limited subset of legal destinations and renders it amber. The existing player feedback path maps the result to `zone-of-control` and its message.
4. A combat-adjacency helper counts eligible friendly occupied neighboring tiles for attacker and defender. `calculateCombatStrengths` applies the percentages and exposes modifier parts. `formatCombatPreviewDetails` renders those parts without reimplementing the rule.
5. `ai-tactics.ts` continues to evaluate combat via the canonical combat context/strength preview, with tactical ranking explicitly favoring available flanks and avoiding choices that abandon beneficial adjacent support when relevant. World actor movement stays on the canonical ZOC-aware path.

The implementation must not add saved fields, turn-persistent control maps, schema migrations, or sound effects. A precomputed control map is intentionally out of scope: it creates invalidation work without a current consumer beyond ZOC.

## Code Areas to Verify During Planning

The plan must verify current signatures before editing. The audited starting points are:

- `src/systems/unit-system.ts`: `getMovementStepCost`, `getMovementRange`, `findPath`, and `MovementBlockerReason`.
- `src/systems/unit-movement-system.ts`: `executeUnitMove` and `validateUnitMove` as the live shared mutation path.
- `src/main.ts` and the renderer/highlight path: selected-unit movement range, amber ZOC subset, and user-visible notification wiring.
- `src/systems/combat-system.ts`, `src/systems/combat-context.ts`, and `src/ui/combat-preview.ts`: canonical strength computation, modifier parts, and preview text.
- `src/ai/ai-tactics.ts`, `src/systems/barbarian-system.ts`, `src/systems/pirate-system.ts`, and beast movement behavior: major-AI and world-actor parity.

## Error Handling and Edge Cases

- Preserve current passability, occupancy, and forced-march semantics. ZOC is a legal-move terminal effect, not a replacement for those rules.
- Do not count an enemy that is not hostile under existing diplomacy/owner rules.
- Do not count an air, recon, civilian, transported, or mismatched-domain unit as a ZOC source or adjacency-bonus contributor.
- Do not double-count a stack for ZOC sources or combat bonuses.
- Keep wrapped-neighbor behavior identical in movement, combat adjacency, and rendering so the map edge cannot disagree with resolution.
- Ensure the display only marks tiles that are truly reachable; a tile beyond normal movement range is never surfaced merely because it lies in ZOC.

## Verification Contract

Add focused regression coverage before production changes, including:

1. Land and naval ZOC both stop a same-domain combat mover after legal entry; cross-domain and air interactions do not.
2. Recon and civilian units do not exert or receive ZOC; a starting unit can leave ZOC normally.
3. Hostile barbarian, beast, pirate, and rebel movement both respects and exerts the same rule, with at least one non-player execution-path parity test.
4. Wrapped-map adjacency matches ordinary adjacency behavior.
5. The movement range exposes legal ZOC-limited tiles separately from ordinary reachable tiles; the live renderer uses amber for them and does not mark unreachable tiles.
6. The live player move consumes the remaining movement and visibly reports `Stopped — enemy nearby`.
7. Flanking and support apply one +10% increment per adjacent eligible friendly-occupied tile; the attacker/defender’s own tile, civilians, recon, air units, and additional units in a stack do not add an increment.
8. Combat preview labels show the calculated flanking and support bonuses, and combat resolution uses the same values.
9. AI tactical scoring recognizes a flanking improvement through the canonical strength preview rather than an independent combat formula.
10. Seeded early-era same-tier combat sampling remains within the existing two-to-four-exchange pacing target after the new bonuses are included.

Run the mirrored unit, movement, combat, AI tactics, and UI/renderer tests; the source-rule checker for changed `src/` files; and a TypeScript build. The implementation plan must enumerate exact test files after verifying current locations.

## Out of Scope

- New anti-air units, anti-air interception radius, or aircraft basing changes. Existing city anti-air remains a combat-defense modifier against air attackers.
- Any difficulty scaling, save migration, new audio, or changes to solo/hot-seat rules.
- Supply lines, territory-control systems, or persistent/precomputed ZOC state.
