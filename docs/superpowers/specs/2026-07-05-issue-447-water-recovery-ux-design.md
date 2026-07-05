# Issue #447 Water-Recovery UX — Design

## Context

Issue #447 shows a loaded hot-seat save with a Warrior standing on a coast tile. The
reported symptom says the unit cannot move, but current movement rules allow an
untransported land unit that starts on water to move back onto a legal land tile. The
generic warning, `Land units cannot cross water yet.`, appears when the player taps
another water tile and does not explain that recovery path.

The chosen approach treats this as a targeted UX-recovery problem. It preserves the save
exactly, exposes the legal route back to land, and does not broaden land-unit water
movement.

## Goals

- Explain why an untransported land unit is standing on water and how to recover it.
- Make legal non-combat land exits visually distinct from ordinary movement.
- Keep the unit selected and the recovery guidance visible after an invalid water tap.
- Represent the no-exit case honestly instead of pointing to nonexistent highlights.
- Preserve all existing movement, combat, cargo, save, and terrain rules.

## Non-goals

- Do not relocate units during save loading.
- Do not mutate or version the save format.
- Do not allow land units to enter coast or ocean tiles.
- Do not change transport load/unload behavior.
- Do not diagnose or repair the historical code path that originally produced the saved
  position; the available issue evidence does not identify that source.

## Shared recovery model

Add one pure shared helper in `src/systems/unit-water-recovery.ts`.

The helper receives the current `GameState`, a unit ID, and the already-computed
non-combat movement destinations. It returns a discriminated result:

```ts
type LandUnitWaterRecovery =
  | { kind: 'none'; destinations: [] }
  | { kind: 'recoverable'; destinations: HexCoord[] }
  | { kind: 'blocked'; destinations: [] };
```

Recovery is active only when all of these are true:

1. the unit exists;
2. its definition domain is `land`;
3. it is not cargo (`transportId` is absent); and
4. its current map tile is `coast` or `ocean`.

For an active recovery, destinations are the supplied legal non-combat movement
destinations whose map terrain is not `coast` or `ocean`. At least one destination yields
`recoverable`; none yields `blocked`.

The helper does not calculate movement, inspect UI state, or mutate the game. Movement
eligibility remains owned by the existing movement-range and validation systems.

## Selection and rendering flow

`buildSelectedUnitHighlights` continues to calculate movement and attack destinations
once. After excluding attack targets from ordinary move destinations, it derives the
water-recovery result through the shared helper and returns that result with the existing
selection presentation.

When recovery is `recoverable`:

- legal non-combat land exits use a new `water-recovery` highlight type;
- those exits remain in `movementRange`, so the existing tap-to-move path executes them;
- hostile land targets remain attack highlights and are not presented as guaranteed
  recovery exits.

The renderer gives `water-recovery` a distinct amber treatment. Ordinary move, attack,
and worker guidance colors remain unchanged.

`selectUnit` passes the derived recovery result to `renderSelectedUnitInfo`. The panel
renders an amber guidance line:

> This land unit is on water. Move to an amber land tile to return ashore.

For `blocked`, the panel instead renders:

> This land unit is stranded on water. No land escape is currently reachable this turn.

The guidance is derived presentation only. It disappears automatically when the unit
moves onto land and the selected-unit presentation rerenders.

## Invalid-tap feedback

The existing invalid-destination path continues to use
`getMovementBlockerReason`. When that reason is `impassable-water` and the selected unit
has an active water-recovery state, the live caller replaces the generic copy with
recovery-specific guidance:

- `recoverable`: `Move this land unit to an amber land tile to return ashore; it cannot move to another water tile.`
- `blocked`: `This land unit is stranded on water with no reachable land escape this turn.`

The tap does not mutate state, deselect the unit, or clear highlights. A normal land unit
standing on land continues to receive `Land units cannot cross water yet.`

## Player truth table

| Before | Player action | State change | Immediate visible result |
|---|---|---|---|
| Land unit stands on water with a legal non-combat land exit | Select unit | None | Panel shows recovery guidance; legal exits are amber |
| Recoverable unit is selected | Tap amber land exit | Existing movement mutation only | Unit moves ashore; recovery warning and amber recovery highlights disappear |
| Recoverable unit is selected | Tap another water tile | None | Contextual “return ashore” warning appears; selection and amber exits remain |
| Land unit stands on water with no legal non-combat land exit this turn | Select unit | None | Panel says no land escape is currently reachable; no amber exit is shown |
| Blocked recovery unit is selected | Tap water | None | Contextual blocked warning appears; unit remains selected |
| Ordinary land unit stands on land | Tap water | None | Existing generic water warning remains |
| Naval, air, or transported land unit is on water | Select or tap | Existing behavior only | No water-recovery guidance or amber recovery highlight appears |

## Misleading UI risks and boundaries

- A water tile is never labeled as a recovery destination.
- A hostile land target remains red/attack-oriented and is not described as a guaranteed
  movement exit.
- `transportId` cargo is never called stranded, even though its synchronized position can
  be water.
- Naval and air units never receive land-unit recovery guidance.
- A land unit already on land never receives recovery guidance.
- A land unit with zero legal non-combat land destinations receives `blocked`, not
  `recoverable`.
- Movement-range membership remains the source of truth. The UX must not independently
  claim that a tile is reachable.

## Interaction replay

Regression coverage will replay the live presentation sequence:

1. select a recoverable Warrior on water;
2. assert amber recovery exits and panel guidance;
3. tap an invalid water destination and assert contextual feedback while selection and
   recovery presentation remain;
4. execute the existing move to a legal land exit;
5. rerender selection and assert recovery guidance no longer appears.

The interaction can be split across focused tests only where the same production helpers
and live caller contract are exercised. A source-shape assertion alone is insufficient.

## Testing

Add the smallest regressions that prove the contract:

- shared helper:
  - recoverable land unit on water with a legal non-combat land destination;
  - blocked land unit on water;
  - negative cases for land-on-land, naval, air, and transported cargo;
- selected-unit highlights:
  - recovery land exits use `water-recovery`;
  - attack targets keep `attack`;
  - `movementRange` still contains the legal exit;
- selected-unit panel:
  - recoverable and blocked text render exactly;
  - guidance disappears for every negative semantic boundary;
- invalid-tap feedback:
  - recoverable and blocked copy are selected only for an active recovery;
  - ordinary land-on-land water taps keep the existing generic copy;
- live flow:
  - an invalid water tap preserves selection/highlights;
  - moving ashore removes the derived recovery presentation on rerender.

## Verification

For changed source files:

- run `scripts/check-src-rule-violations.sh` with every changed `src/` path;
- run all mirrored tests in one targeted Vitest command;
- run `bash scripts/run-with-mise.sh yarn build`;
- run `bash scripts/run-with-mise.sh yarn test`.

Before completion, inspect both `origin/main...HEAD` and the uncommitted worktree delta.
