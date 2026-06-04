# Naval Transport Progression — Design Spec

**Date:** 2026-06-04
**Issue:** #312
**Status:** Approved

## Context

The Transport MVP (issues #284–#308) ships a capacity-1 civilian vessel so land units can cross oceans. This slice extends the transport system with: a realistic five-tier era progression, cargo-size weights that reflect unit bulk, and a per-unit unload UX that scales to multi-unit ships.

AI island logistics (routing transports to reach enemy islands) is explicitly out of scope and remains as a separate follow-up track.

## Unit Definitions

### Five transport classes — one per era, built from scratch

| UnitType | Era | Cargo capacity | Production cost | `techRequired` | `obsoletedByTech` |
|---|---|---|---|---|---|
| `transport` (existing) | 1 | 2 (was 1) | 45 | — | navigation tech (era 2) |
| `carrack` | 2 | 3 | 65 | navigation (era 2) | cartography tech (era 3) |
| `galleon` | 3 | 4 | 90 | cartography (era 3) | steam_power tech (era 4) |
| `steamship` | 4 | 5 | 120 | steam_power (era 4) | industrialization tech (era 5) |
| `troop_transport` | 5 | 6 | 160 | industrialization (era 5) | — |

Exact `techRequired`/`obsoletedByTech` values will be read from `tech-definitions.ts` during implementation and matched to canonical tech IDs at those eras.

All five types share the same domain (`naval`), movement (3), vision (2), strength (0), `canFoundCity: false`, `canBuildImprovements: false`, and coastal-city build requirement.

### Upgrade path

The existing `unit-upgrade-system.ts` handles paid in-city upgrades via `obsoletedByTech` chains. Each transport class is obsoleted by the tech that unlocks the next tier; when a civ has researched that tech and a transport is in a friendly city, the player can pay 50% of the next tier's production cost to upgrade it. No automatic upgrades.

### Cargo sizes

Added to `UNIT_DEFINITIONS` via a new `cargoSize` field. Default remains 1 when absent.

**1 slot** — infantry, support, and specialist units:
warrior, axeman, spearman, swordsman, pikeman, musketeer, archer, crossbowman, shadow_warden, settler, worker, caravan, scout, expedition, scout_hound, war_hound, all spy types

**2 slots** — mounted units (human + horse):
horseman, cavalry, knight

**3 slots** — siege engines (large, heavy, multi-crew):
catapult, ballista

Naval units cannot be loaded onto transports (domain check — no change).

### Slot budget examples

| Transport | Cap | What fits |
|---|---|---|
| transport (era 1) | 2 | 2 infantry; 1 mounted; — |
| carrack (era 2) | 3 | 3 infantry; 1 mounted + 1 infantry; 1 siege |
| galleon (era 3) | 4 | 4 infantry; 2 mounted; 1 siege + 1 infantry |
| steamship (era 4) | 5 | 5 infantry; 2 mounted + 1 infantry; 1 siege + 2 infantry |
| troop_transport (era 5) | 6 | 6 infantry; 3 mounted; 2 siege; 1 siege + 3 infantry |

## System Changes

### `transport-system.ts`

`getUnloadDestinations(state, transportId)` currently hardcodes `cargo[0]` and can only compute destinations for one unit. Change signature to:

```ts
getUnloadDestinations(state: GameState, transportId: string, cargoUnitId: string): HexCoord[]
```

Each cargo unit has independent terrain costs; computing destinations per-unit is correct and necessary. `canUnloadUnitFromTransport` already accepts `cargoUnitId` — no change needed there.

All callers of `getUnloadDestinations` (currently `main.ts` and any UI panel code) must be updated to pass the selected `cargoUnitId`. The UI must select which cargo unit the player is unloading before calling this function.

`canLoadUnitOntoTransport` already sums `getTransportCargoUsed()` against `getTransportCapacity()`. The slot budget naturally gates heavy units: a 3-slot catapult cannot load onto a capacity-2 transport.

### `unit-system.ts` / `city-system.ts`

Add four new `UNIT_DEFINITIONS` entries (carrack, galleon, steamship, troop_transport) and four new `TRAINABLE_UNITS` entries with correct tech gates. Add `cargoSize` to mounted and siege entries. Update `transport.cargoCapacity` from 1 → 2.

Add `PRODUCTION_ICONS` entries for all four new types.

Add descriptions to `UNIT_DESCRIPTIONS` for all four new types.

## UX: Multi-Unit Unload

When a transport with multiple cargo units is selected:

1. The unit panel shows each loaded unit as a tappable row with name and slot cost badge (e.g. "Horseman · 2 slots").
2. Units with no movement remaining are shown greyed-out and cannot be unloaded this turn.
3. Tapping a cargo row enters **unload mode** for that specific unit — adjacent valid land hexes are highlighted.
4. Tapping a highlighted destination hex calls `unloadUnitFromTransport(state, transportId, cargoUnitId, destination)` and exits unload mode.
5. Remaining cargo units stay aboard. Each can be independently unloaded in subsequent taps until the turn ends or the panel is dismissed.
6. No change to load flow.

## Save Compatibility

`cargoCapacity` and `cargoSize` already exist on the `UnitDefinition` shape. Existing saves with a capacity-1 `transport` remain valid; the new `cargoCapacity: 2` value applies only to newly trained units. No migration required.

## Testing

**`transport-system.test.ts`:**
- 2 infantry load onto capacity-2 transport ✓
- 1 mounted (2 slots) loads onto capacity-2 transport, second infantry rejected ✗
- catapult (3 slots) loads alone onto capacity-3 carrack ✓
- catapult + infantry (4 slots total) rejected from capacity-3 carrack ✗
- `getUnloadDestinations(state, transportId, cargoUnitId)` returns valid hexes for the specified unit only
- `getUnloadDestinations` for a cargo unit with no movement left returns `[]`

**`city-system.test.ts` / completeness:**
- All four new transport types have `PRODUCTION_ICONS` entries
- All four new transport types appear in `TRAINABLE_UNITS`
- Upgrade chain: transport obsoleted by navigation → carrack available in city

**`unit-upgrade-system.test.ts`:**
- `canUpgradeUnit` returns true for transport in friendly city after navigation researched
- `canUpgradeUnit` returns false when civ cannot afford the upgrade cost
- `applyUpgrade` converts transport → carrack with correct capacity

## Non-Goals

- No AI transport routing or island logistics (separate track)
- No transport combat strength or escort mechanics
- No cargo health-transfer on transport destruction (cargo is already destroyed with transport via `removeTransportAndCargo`)
- No multi-destination batch unload in one action
