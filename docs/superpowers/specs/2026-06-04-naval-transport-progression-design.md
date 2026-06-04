# Naval Transport Progression — Design Spec

**Date:** 2026-06-04
**Issue:** #312
**Status:** Approved (revised)

## Context

The Transport MVP ships a capacity-1 civilian vessel so land units can cross oceans. This slice extends the transport system with: a realistic five-tier era progression, cargo-size weights that reflect unit bulk, a two-stage map-interaction unload UX that scales to multi-unit ships, real SFX replacing oscillator-tone placeholders, and sprites for all four new unit types.

AI island logistics (routing transports to reach enemy islands) is explicitly out of scope and remains as a separate follow-up track.

---

## 1. New Tech: `amphibious-warfare` (era 5)

Add one new tech to `tech-definitions.ts` in the maritime track:

```ts
{ id: 'amphibious-warfare', name: 'Amphibious Warfare', track: 'maritime',
  cost: 175, prerequisites: ['caravels', 'naval-warfare'],
  unlocks: ['Troop Transport'], era: 5 }
```

This gates the troop_transport and obsoletes the steamship.

---

## 2. Unit Definitions

### Five transport classes — one per era, built from scratch

| UnitType | Cargo cap | Production | `techRequired` | `obsoletedByTech` |
|---|---|---|---|---|
| `transport` (existing) | 2 (was 1) | 45 | `'galleys'` (already) | `'navigation'` |
| `carrack` | 3 | 65 | `'navigation'` | `'triremes'` |
| `galleon` | 4 | 90 | `'triremes'` | `'caravels'` |
| `steamship` | 5 | 120 | `'caravels'` | `'amphibious-warfare'` |
| `troop_transport` | 6 | 160 | `'amphibious-warfare'` | — |

All five types share: domain `'naval'`, `movementPoints: 3`, `visionRange: 2`, `strength: 0`, `canFoundCity: false`, `canBuildImprovements: false`, `coastalRequired: true`.

### Upgrade path

The existing `unit-upgrade-system.ts` handles paid in-city upgrades via `obsoletedByTech` chains at 50% of the next tier's production cost. No automatic upgrades; player triggers in a friendly coastal city.

### Cargo sizes

`cargoSize` field added to `UNIT_DEFINITIONS` entries. `getUnitCargoSize` already defaults to 1 when the field is absent — no type changes needed.

**1 slot** — infantry, support, and specialist units:
warrior, axeman, spearman, swordsman, pikeman, musketeer, archer, crossbowman, shadow_warden, settler, worker, caravan, scout, expedition, scout_hound, war_hound, all spy types

**2 slots** — mounted (human + horse):
horseman, cavalry, knight

**3 slots** — siege engines:
catapult, ballista

Naval units remain un-loadable (domain check — no change).

### Slot budget examples

| Transport | Cap | Example loadouts |
|---|---|---|
| transport | 2 | 2 infantry · 1 mounted |
| carrack | 3 | 3 infantry · 1 mounted + 1 infantry · 1 siege |
| galleon | 4 | 4 infantry · 2 mounted · 1 siege + 1 infantry |
| steamship | 5 | 5 infantry · 2 mounted + 1 infantry · 1 siege + 2 infantry |
| troop_transport | 6 | 6 infantry · 3 mounted · 2 siege · 1 siege + 3 infantry |

### PRODUCTION_ICONS

```ts
carrack:         '🚢',
galleon:         '⛵',
steamship:       '🛳️',
troop_transport: '🛥️',
```

### LOCOMOTION_CLASS

All four new types → `'naval'`.

### Descriptions (`UNIT_DESCRIPTIONS`)

```ts
carrack:         'Era 2 transport. Carries up to 3 land units across coasts and oceans.',
galleon:         'Era 3 transport. Carries up to 4 land units. Stronger hull, wider range.',
steamship:       'Era 4 transport. Steam-powered. Carries up to 5 land units reliably.',
troop_transport: 'Era 5 transport. Military-grade vessel. Carries up to 6 land units.',
```

---

## 3. Sprites

Four new SVG sprites required, one per unit type. Follow the existing pattern in `src/renderer/sprites/v2/`. Use the `generate-sprite-prompt` skill to create Claude Design prompts for each. Visual language should feel like an evolutionary series: silhouette complexity and hull size increase with each era.

Suggested visual direction:
- `carrack`: small wooden sailing ship, single mast, high castle fore and aft
- `galleon`: larger multi-masted wooden warship, broad hull
- `steamship`: iron hull, single funnel, paddlewheel or propeller visible
- `troop_transport`: modern military transport ship, flat deck, drab paint

All four sprites must be registered in the unit renderer the same way spy unit sprites are.

---

## 4. System Changes

### `transport-system.ts` — `getUnloadDestinations` signature

Current signature: `getUnloadDestinations(state, transportId)` — hardcodes `cargo[0]`, broken for multi-unit ships.

New signature:
```ts
getUnloadDestinations(state: GameState, transportId: string, cargoUnitId: string): HexCoord[]
```

Update `main.ts` caller (currently `getUnloadOptions` at line ~1338) to pass `cargoUnit.id`.

`canLoadUnitOntoTransport` already validates slot budget against capacity — no change needed.

### `unit-system.ts` / `city-system.ts`

- Update `transport.cargoCapacity` from 1 → 2
- Add four new `UNIT_DEFINITIONS` entries (carrack, galleon, steamship, troop_transport)
- Add `cargoSize: 2` to horseman, cavalry, knight definitions
- Add `cargoSize: 3` to catapult, ballista definitions
- Add four new `TRAINABLE_UNITS` entries with correct tech gates and `coastalRequired: true`
- Add `PRODUCTION_ICONS` entries for all four
- Add `LOCOMOTION_CLASS` entries for all four (→ `'naval'`)
- Add `UNIT_DESCRIPTIONS` entries for all four

### `tech-definitions.ts`

Add `amphibious-warfare` as described in section 1.

---

## 5. UX: Load Panel — Remaining Capacity

When a land unit is selected and a friendly transport is nearby, the "Load onto Transport" option should show remaining capacity in the label:

```
Load onto Galleon  (2 of 4 slots free)
```

If the unit's `cargoSize` exceeds remaining capacity the option is hidden (already filtered by `canLoadUnitOntoTransport`). If it would leave zero slots free after loading, add a badge: `(last slot)`.

Label construction in `main.ts` `getTransportOptions` callback:
```ts
const used = getTransportCargoUsed(gameState, candidate.id);
const cap  = getTransportCapacity(candidate);
const free = cap - used;
const unitSlots = getUnitCargoSize(gameState.units[uid]);
const badge = free - unitSlots === 0 ? ' · last slot' : '';
label: `Load onto ${UNIT_DEFINITIONS[candidate.type].name}  (${free} of ${cap} slots free${badge})`
```

---

## 6. UX: Two-Stage Map-Interaction Unload

**Problem with the current flat-list approach:** `getUnloadOptions` generates all `(cargoUnit × destination)` pairs as buttons. A troop_transport with 6 infantry and 4 coastal hexes produces 24 buttons — unusable on mobile.

**Solution: Replace flat-list with two-stage map interaction**, following the same pattern as unit movement:

### Stage 1 — Transport selected

The unit panel shows a **Cargo section** listing each loaded unit by name + slot cost. Each row has an **Unload** button. Units whose `movementPointsLeft === 0` show as greyed-out with "used this turn".

### Stage 2 — Cargo unit selected for unload

Tapping **Unload** for a specific cargo unit:
1. Calls `getUnloadDestinations(state, transportId, cargoUnitId)` to get valid land hexes
2. Passes those hexes to the renderer as highlighted destinations (same visual as movement highlights)
3. Sets `pendingUnload: { transportId, cargoUnitId }` in UI state
4. The panel updates to show "Tap a highlighted tile to unload" + a **Cancel** button

Tapping a highlighted hex:
- Calls `onUnloadTransport(transportId, cargoUnitId, destination)`
- Clears `pendingUnload`
- Plays `SFX.transportUnload()`
- Shows `"[Unit name] unloaded from [Transport name]."`
- Transport stays selected, panel refreshes showing remaining cargo

Tapping **Cancel** or any non-highlighted hex:
- Clears `pendingUnload`
- Returns to Stage 1 (cargo list)

### Deprecate `getUnloadOptions`

`getUnloadOptions` in the main.ts callbacks is removed. The panel instead calls `getTransportCargo` to get the cargo list and `getUnloadDestinations` (with a specific cargoUnitId) when the player initiates unload for a unit.

---

## 7. SFX

### Current state
`SFX.transportLoad()` and `SFX.transportUnload()` are oscillator-tone synthesized beeps in `sfx.ts` — not OGG files and not in sfx-catalog. They must be replaced with real CC0 audio.

### Replacement
Source two short CC0 clips (Kenney or freesound.org):

| Event | Mood | Duration target |
|---|---|---|
| `transport-load` | Rope/chain ratcheting, cargo thud | 0.4–0.8 s |
| `transport-unload` | Gangplank landing, footsteps on wood | 0.4–0.8 s |

Encode with: `ffmpeg -i input -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 2 output.ogg`

Place at:
- `public/audio/sfx/transport-load.ogg`
- `public/audio/sfx/transport-unload.ogg`

Add `real()` entries to `sfx-catalog.ts` under a new `TRANSPORT_SFX` export (same pattern as `MOVEMENT_SFX`):
```ts
export const TRANSPORT_SFX = {
  load:   real('sfx-transport-load',   'audio/sfx/transport-load.ogg',   0.600, 'movement'),
  unload: real('sfx-transport-unload', 'audio/sfx/transport-unload.ogg', 0.600, 'movement'),
};
```

Update `sfx.ts` to replace the oscillator calls:
```ts
transportLoad:   () => sfxDirector.play(TRANSPORT_SFX.load),
transportUnload: () => sfxDirector.play(TRANSPORT_SFX.unload),
```

### New transport type death SFX
All four new types share `transport-death.ogg` — add entries in `UNIT_SFX` pointing to the same file (same sound, already curated).

---

## 8. Notification String Fix

Replace the hardcoded "Transport" string with the actual unit name:

```ts
// In onLoadTransport callback:
const transportName = UNIT_DEFINITIONS[gameState.units[transportId]?.type]?.name ?? 'Transport';
showNotification(`Unit loaded onto ${transportName}.`, 'info');

// In onUnloadTransport callback:
const transportName = UNIT_DEFINITIONS[gameState.units[transportId]?.type]?.name ?? 'Transport';
const cargoName = UNIT_DEFINITIONS[gameState.units[cargoUnitId]?.type]?.name ?? 'Unit';
showNotification(`${cargoName} unloaded from ${transportName}.`, 'info');
```

---

## 9. Save Compatibility

`cargoCapacity` and `cargoSize` already exist on `UnitDefinition`. Existing saves with a capacity-1 transport remain valid (the new `cargoCapacity: 2` applies to newly trained units only). No migration needed.

---

## 10. Testing

### `transport-system.test.ts`
- 2 infantry load onto capacity-2 transport ✓
- 1 mounted (2 slots) + 1 infantry loads onto capacity-2 transport, fills it exactly ✓
- 3rd infantry rejected when capacity-2 transport has 1 mounted + 1 infantry aboard ✗
- catapult (3 slots) loads alone onto capacity-3 carrack ✓
- catapult + infantry (4 slots total) rejected from capacity-3 carrack ✗
- `getUnloadDestinations(state, transportId, cargoUnitId)` returns valid hexes for the specified unit only
- `getUnloadDestinations` for a cargo unit with `movementPointsLeft === 0` returns `[]`
- `getUnloadDestinations` for infantry and mounted on same transport returns the same coastal hexes (terrain-cost equivalence for default land units)

### `city-system.test.ts` / completeness
- All four new types appear in `TRAINABLE_UNITS` with `coastalRequired: true`
- All four new types have `PRODUCTION_ICONS` entries
- Inland city cannot queue carrack or any transport type

### `unit-upgrade-system.test.ts`
- transport in friendly coastal city with `navigation` researched → `canUpgradeUnit` returns `{ canUpgrade: true, targetType: 'carrack', cost: 33 }` (50% of 65)
- transport with insufficient gold → `canUpgrade: false`
- `applyUpgrade(transport, 'carrack')` → type changes, `cargoUnitIds` preserved (existing cargo stays aboard), health reset to 100

### `tech-definitions.test.ts`
- `amphibious-warfare` has prerequisites `['caravels', 'naval-warfare']` and era 5

### `sfx-catalog.test.ts` / on-disk integrity
- `public/audio/sfx/transport-load.ogg` and `transport-unload.ogg` exist with OGG magic bytes

---

## 11. Non-Goals

- No AI transport routing or island logistics (separate track)
- No transport combat strength or escort mechanics
- No multi-destination batch unload in one action
- No cargo health-transfer on transport destruction (handled by existing `removeTransportAndCargo`)
