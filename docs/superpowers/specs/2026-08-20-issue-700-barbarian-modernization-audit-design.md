# #700 Barbarian Modernization Audit Design

## Goal

Verify and, where evidence requires it, correct the bounded barbarian-reinforcement system so its spawn composition, caps, difficulty behavior, and human/AI parity meet the #547 contract.

## Scope

This delivery audits the live path created by #696–#699:

- typed barbarian eligibility and era windows;
- deterministic camp-force composition and reinforcement selection;
- camp-local armor and air observations, including expiry;
- camp cooldown and strength growth;
- target-scoped difficulty profiles and non-omniscient planning;
- turn-manager creation, ownership mapping, occupancy, and visibility-scoped spawn notification.

It may make the smallest correction to shared data or canonical helpers revealed by the audit. It does not add units, change save shape, introduce UI, create crises, or start Wave 6 work.

## Design

### Audit harness

Add table-driven, deterministic fixtures at the public composer and live `processPurposefulBarbarians()` / `processTurn()` boundaries. Fixtures span the approved era windows, camp strength, existing force, and active/expired armor or air observations.

Each fixture asserts that a due spawn is legal for its era and observed pressure, deterministic for identical input, and compatible with all caps: role shares, mutual exclusions, per-camp limits, and pre-escalation limits. A camp with no legal bounded candidate deliberately underfills rather than bypassing a cap.

The audit also samples full cooldown cycles. It proves a camp produces at most one due-spawn proposal per tick, updates cooldown and strength deterministically, and never creates a unit on an occupied or impassable tile.

### Difficulty and information parity

Legality is invariant across Explorer, Standard, and Veteran. Only the existing target-scoped pressure profile may affect decision quality. A camp confronting an AI civilization must resolve to Standard; two human hot-seat civilizations use their own saved challenge independently.

The tests prove reinforcement selection consumes only era, assigned unit types, strength/escalation, deterministic seed, and camp-local active pressure. A distant armored unit, unrelated research/resource state, current viewer, or hidden rival asset cannot alter the selected legal catalog.

### Live integration and presentation contract

The live-turn fixtures verify that a selected reinforcement is created as `barbarian`, receives the camp-home association, has valid existing renderer/audio catalog fallback, and uses only the existing visibility-scoped spawn-notification route. The audit adds no player action or panel, so no new interactive UI contract is introduced.

### Remediation rule

When an audit fixture exposes a violation, correct the narrowest canonical source: eligibility metadata for roster/tuning data, the composer for cap enforcement, camp processing for lifecycle/order, or challenge resolution for target parity. Add the failing regression before production code and keep the corrected behavior fully deterministic.

## Error handling and boundaries

Malformed or missing camp pressure remains ignored by the existing normalizer. Missing/expired pressure grants no specialist access. Missing camps, no candidate, no passable unoccupied spawn tile, or no current target produce no unsafe spawn or order. Existing units continue to count toward caps even if their own era window has elapsed.

## Testing and verification

The implementation will add focused Vitest coverage in the mirrored barbarian-system, force-composer, pressure, and turn-manager tests. It will run source-rule checks for every changed `src/` file, targeted tests first, and then `git diff --check`, build, and durable full-suite verification before publication.

## Scope check

This is one delivery: a regression-backed audit of the already-landed barbarian modernization system. Any finding that requires a new player-facing crisis, save model, or a broad redesign is out of scope and will be recorded as follow-up work instead of folded into #700.
