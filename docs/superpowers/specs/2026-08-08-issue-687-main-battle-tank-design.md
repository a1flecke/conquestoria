# Issue 687 Main Battle Tank Design

## Goal

Add the Era 11 Main Battle Tank (MBT) as Tank's explicit successor and make one
adjacent friendly line-infantry unit grant its owner a visible, non-stacking +10%
combat-strength bonus. The same rule must drive human combat, AI combat, previews,
and saves without revealing fog-of-war-protected information.

## Roster contract

- Add `main_battle_tank` at Armored Tactics plus Precision Engineering: cost 270,
  strength 72, movement 4, vision 2, range-1 land attack.
- `Tank` becomes obsolete at Precision Engineering and explicitly upgrades to MBT.
- MBT is trainable only after both required technologies and is listed in the
  Precision Engineering unlock catalogue. It receives normal production, icon,
  description, sprite, and audio catalogue coverage.
- MBT remains a heavy-breakthrough choice, not an unconditional answer: the existing
  Anti-Tank Gun and Attack Helicopter counters remain effective.

## Typed combined-arms rule

Unit definitions gain small typed formation metadata rather than combat branches keyed
to unit IDs. MBT requests `adjacent-line-infantry` support; Mechanized Infantry and
Exosuit Infantry provide it. A single canonical, map-aware helper finds the eligible
friendly adjacent provider using wrapped hex distance when the map wraps.

The helper supplies one `1.10` multiplier for either MBT attack or MBT defense. It
does not persist any derived state, does not affect non-MBT units, excludes cargo and
hostile units, and returns at most one deterministic provider even when several are
eligible. Consequently, two or more infantry never stack the bonus.

`buildCombatContextForDefender` owns the integration so the human attack flow, AI
attack flow, and combat preview receive identical attack and defense inputs. It returns
an applied combat fact alongside the multiplier. The fact is `owner`-visible and names
the known provider class, for example `Combined arms +10% — adjacent Mechanized
Infantry`; it is never emitted for a viewer who cannot legitimately know the provider.

## UI, UX, and privacy

The combat preview lists the active combined-arms fact even when another applied
modifier exists; it must not silently retain only the first fact. It uses a short,
plain-language explanation appropriate for a new player while retaining the exact
provider class for tactical players. Existing combat-result and notification fact
redaction continues to filter owner-only facts before a different hot-seat player or
rival can see them. No player action, modal, or persistent new UI state is required.

An MBT gets the standard armored visual and sound fallback already used by its family
until a later art/audio asset issue supplies bespoke material. The unit remains
recognizable in the production and selected-unit surfaces; the bonus is communicated by
combat preview rather than an always-on noisy marker.

## AI and difficulty

AI production remains catalogue-driven through the new unit's strategic roles. AI
combat evaluation receives the same canonical context and therefore values an active
formation bonus correctly. Formation positioning uses the shared provider predicate,
not `mechanized_infantry` or `exosuit_infantry` ID checks. Difficulty changes AI
personality and pressure, not this rule's 10% value, eligibility, or visibility; all
levels play by the same understandable combined-arms rule.

## Data and saves

The formation result is derived only from serializable unit definitions and current
plain-object game state. No migration or schema version is needed: legacy saves simply
gain the new static catalogue entry, while existing Tanks remain valid units and can
upgrade when their owner meets the new gate. Save export/import stays unchanged.

## Inline review resolution

| Dimension | Review outcome and acceptance criterion |
| --- | --- |
| Balance and fun | 72 strength / 270 cost makes MBT a late payoff that rewards one sensible escort, not a stack; preserve Anti-Tank Gun and Attack Helicopter counter tests. |
| Ages 7–43 and play styles | The rule is one sentence in player-facing text, rewards simple adjacency for casual players, and offers meaningful positioning for tactical players without mandatory micro-heavy formations. |
| Difficulty and computer players | AI uses the shared predicate and combat context at every difficulty; no difficulty-only stats or AI cheating. |
| UI/UX | Preview says why the bonus applies and names the provider class to its owner; it renders all active relevant facts and immediately reflects movement/selection changes. |
| Privacy and hot seat | Owner-only facts are redacted for unauthorized viewers. Hot-seat tests switch `currentPlayer` and prove neither identity nor bonus disclosure leaks. |
| Architecture and extensibility | Typed requester/provider metadata plus one canonical helper avoids ID branches and admits future formations without changing combat math. |
| Data and saved games | The result is derived, deterministic, and non-persistent; old saves need no migration and new saves round-trip without cached formation state. |
| SFX and visuals | Catalogue-complete armored fallbacks prevent silent/missing feedback while dedicated art/audio remains outside this issue. |
| Testing and regressions | Add deterministic unit, combat-context, AI, preview, catalog/chain, save, solo, and hot-seat tests. Include positive Mechanized/Exosuit cases; negative hostile, cargo, nonqualifying, out-of-range, hidden-viewer, and multiple-provider cases; attack and defense; wrapped-map adjacency; counter behavior; and immediate UI recomputation. |
| Implementation completeness | Follow state → canonical computation → combat/AI/UI rendering, with no UI-only mutation and no new persisted or random state. |

## Verification

Run the changed-source rule check, the mirrored focused Vitest suites, production build,
durable full test suite and status check. Review both `origin/main...HEAD` and the
uncommitted delta before opening the pull request.
