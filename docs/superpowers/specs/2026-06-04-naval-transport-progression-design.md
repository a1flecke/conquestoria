# Naval Transport Progression — Design Spec

**Date:** 2026-06-04
**Issue:** #312
**Status:** Approved (v3)

## Context

The Transport MVP ships a capacity-1 civilian vessel so land units can cross oceans. This slice extends the transport system with: a realistic five-tier era progression, cargo-size weights that reflect unit bulk, a two-stage map-interaction unload UX that scales to multi-unit ships, real SFX (load/unload + per-class death sounds) replacing oscillator-tone and silence placeholders, boarding/disembark animations, and sprites for all four new unit types.

AI island logistics (routing transports to reach enemy islands) is explicitly out of scope and remains as a separate follow-up track.

---

## 1. New Tech: `amphibious-warfare` (era 5)

Add one new tech to `tech-definitions.ts` in the maritime track:

```ts
{ id: 'amphibious-warfare', name: 'Amphibious Warfare', track: 'maritime',
  cost: 175, prerequisites: ['caravels', 'naval-warfare'],
  unlocks: ['Troop Transport'], era: 5 }
```

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

`cargoSize` field added to `UNIT_DEFINITIONS` entries. `getUnitCargoSize` already defaults to 1 when absent — no type changes needed.

**1 slot:** warrior, axeman, spearman, swordsman, pikeman, musketeer, archer, crossbowman, shadow_warden, settler, worker, caravan, scout, expedition, scout_hound, war_hound, all spy types

**2 slots:** horseman, cavalry, knight

**3 slots:** catapult, ballista

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

### LOCOMOTION_CLASS (in `sfx-catalog.ts`)

All four new types → `'naval'`. **Note:** `LOCOMOTION_CLASS` is a `Record<UnitType, LocomotionClass>` in `sfx-catalog.ts`, not `unit-system.ts`. TypeScript enforces exhaustiveness — adding new `UnitType` values without updating this record fails the build.

### UNIT_DESCRIPTIONS

```ts
carrack:         'Era 2 transport. Carries up to 3 land units across coasts and oceans.',
galleon:         'Era 3 transport. Carries up to 4 land units. Stronger hull, wider range.',
steamship:       'Era 4 transport. Steam-powered. Carries up to 5 land units reliably.',
troop_transport: 'Era 5 transport. Military-grade vessel. Carries up to 6 land units.',
```

---

## 3. Sprites

Four new SVG sprites, one per unit type, following the existing pattern in `src/renderer/sprites/v2/`. Use the project-level `generate-sprite-prompt` skill to create Claude Design prompts for each.

Visual direction — an evolutionary series, silhouette complexity and hull size increase with each era:
- **carrack**: small wooden sailing ship, single mast, high fore and aft castles
- **galleon**: larger multi-masted wooden ship, broad hull, visible cannon ports
- **steamship**: iron hull, single funnel amidships, paddlewheel or screw propeller visible at stern
- **troop_transport**: modern military transport, flat open deck, drab paint, visible cargo crane

All four sprites registered in the unit renderer using the same mechanism as spy unit sprites.

---

## 4. System Changes

### `transport-system.ts` — `getUnloadDestinations` signature

Change signature from `(state, transportId)` to:

```ts
getUnloadDestinations(state: GameState, transportId: string, cargoUnitId: string): HexCoord[]
```

Remove the `[0]` hardcode; use the provided `cargoUnitId` instead. Each cargo unit has independent terrain costs; computing destinations per-unit is correct and necessary.

`canLoadUnitOntoTransport` already validates the slot budget — no change.

### `unit-system.ts` / `city-system.ts`

- Update `transport.cargoCapacity` from 1 → 2
- Add four new `UNIT_DEFINITIONS` entries (carrack, galleon, steamship, troop_transport) with `cargoCapacity`, `domain: 'naval'`, `coastalRequired: true`
- Add `cargoSize: 2` to horseman, cavalry, knight
- Add `cargoSize: 3` to catapult, ballista
- Add four new `TRAINABLE_UNITS` entries with correct tech gates and `coastalRequired: true`
- Add `PRODUCTION_ICONS` entries for all four
- Add `UNIT_DESCRIPTIONS` entries for all four

### `sfx-catalog.ts`

- Add `LOCOMOTION_CLASS` entries for all four new types (→ `'naval'`)
- Add UNIT_SFX death entries for all four new types with **unique IDs and unique OGG files** (see §6 SFX)
- Add `TRANSPORT_SFX` export for load/unload events (see §6 SFX)
- Update `allSfxEntries()` to include `...Object.values(TRANSPORT_SFX)` in its return value

### `tech-definitions.ts`

Add `amphibious-warfare` as described in §1.

### `main.ts`

- Add module-level state: `let unloadRange: HexCoord[] = [];` and `let pendingUnload: { transportId: string; cargoUnitId: string } | null = null;`
- Clear both in every location where `movementRange` and `attackRange` are cleared (currently 4+ sites)
- Replace `getUnloadOptions` callback with `getCargoBoardInfo` that returns the cargo unit list
- Add `onSelectCargoToUnload(transportId, cargoUnitId)` callback that sets pendingUnload + computes unloadRange
- Update `onLoadTransport` label construction (see §5)
- Update `onUnloadTransport` notification (see §5)
- Update hex-tap priority handling (see §7)
- Update `getUnloadOptions` → `getUnloadDestinations(gameState, transportId, cargoUnit.id)` for the specific unit

---

## 5. UX: Load Panel — Remaining Capacity

When a land unit is selected and a friendly transport is nearby, show:
- If slots remain: **"Load onto Galleon — 2 of 4 slots free"**
- If loading would fill it: **"Load onto Galleon — last slot"**
- If the unit's `cargoSize` exceeds remaining capacity: show option **greyed-out** with reason: **"Needs 3 slots — 1 remaining"** (do not hide it silently)

Label construction in `getTransportOptions` callback:

```ts
const used   = getTransportCargoUsed(gameState, candidate.id);
const cap    = getTransportCapacity(candidate);
const free   = cap - used;
const needs  = getUnitCargoSize(gameState.units[uid]);
const fits   = needs <= free;
const suffix = !fits
  ? ` — needs ${needs} slots, ${free} remaining`
  : free - needs === 0
    ? ' — last slot'
    : ` — ${free} of ${cap} slots free`;
label: `Load onto ${UNIT_DEFINITIONS[candidate.type].name}${suffix}`,
disabled: !fits,
```

The panel must render disabled options greyed-out, not hidden.

---

## 6. SFX

### Load / Unload — replace oscillator tones with OGG files

`SFX.transportLoad()` and `SFX.transportUnload()` in `sfx.ts` are currently oscillator beeps. Replace their bodies with direct mixer calls using loaded OGG buffers — same pattern as `SfxDirector.playFile()`:

```ts
// sfx.ts — after mixer/loader are initialised
let _mixer: AudioMixer | null = null;
let _loader: AudioLoader | null = null;
export function routeSfxComponents(mixer: AudioMixer, loader: AudioLoader): void {
  _mixer = mixer; _loader = loader;
}

transportLoad: () => {
  if (_loader && _mixer)
    void _loader.get(TRANSPORT_SFX.load.file)
      .then(buf => _mixer!.playOneShot('sfx', buf));
  else playTone(330, 0.08, 0.12, 'triangle'); // fallback when audio not yet init
},
transportUnload: () => {
  if (_loader && _mixer)
    void _loader.get(TRANSPORT_SFX.unload.file)
      .then(buf => _mixer!.playOneShot('sfx', buf));
  else playTone(440, 0.08, 0.12, 'triangle');
},
```

Source two short CC0 clips (Kenney or freesound.org):

| File | Mood | Duration target |
|---|---|---|
| `audio/sfx/transport-load.ogg` | Rope/chain ratcheting, cargo thud against wooden deck | 0.4–0.8 s |
| `audio/sfx/transport-unload.ogg` | Gangplank landing, boots on wood planks | 0.4–0.8 s |

Encode: `ffmpeg -i input -af loudnorm=I=-14:TP=-1 -vn -c:a libvorbis -q:a 2 output.ogg`

Add to `sfx-catalog.ts` as a new export:

```ts
export const TRANSPORT_SFX = {
  load:   real('sfx-transport-load',   'audio/sfx/transport-load.ogg',   0.600, 'movement'),
  unload: real('sfx-transport-unload', 'audio/sfx/transport-unload.ogg', 0.600, 'movement'),
};
```

Add `...Object.values(TRANSPORT_SFX)` to `allSfxEntries()` return value so the on-disk integrity test covers them.

### Per-class ship death SFX

Players expect audible feedback when ships are destroyed. Each transport class gets its own death sound with a **unique ID and unique OGG file**:

| UnitType | SFX ID | File | Mood |
|---|---|---|---|
| transport | `sfx-transport-death` | `audio/sfx/transport-death.ogg` | already exists |
| carrack | `sfx-carrack-death` | `audio/sfx/carrack-death.ogg` | wood cracking, splash |
| galleon | `sfx-galleon-death` | `audio/sfx/galleon-death.ogg` | large wood explosion, mast fall |
| steamship | `sfx-steamship-death` | `audio/sfx/steamship-death.ogg` | metal groan, hiss of escaping steam |
| troop_transport | `sfx-troop_transport-death` | `audio/sfx/troop_transport-death.ogg` | modern ship explosion/sinking |

Source all four from CC0 audio (freesound.org `ship wreck`, `ship sinking`, `steam vessel`; or Kenney impact packs as a starting point). Unique files are required because the `"no two entries share the same file path"` test in `sfx-catalog.test.ts` enforces this.

Add to `UNIT_SFX` in `sfx-catalog.ts`:
```ts
carrack:         { death: real('sfx-carrack-death',         'audio/sfx/carrack-death.ogg',         0.800, 'death') },
galleon:         { death: real('sfx-galleon-death',         'audio/sfx/galleon-death.ogg',         0.900, 'death') },
steamship:       { death: real('sfx-steamship-death',       'audio/sfx/steamship-death.ogg',       0.750, 'death') },
troop_transport: { death: real('sfx-troop_transport-death', 'audio/sfx/troop_transport-death.ogg', 0.800, 'death') },
```

The `"allSfxEntries returns exactly 70 entries"` test must be updated to the new count after all additions.

---

## 7. UX: Two-Stage Map-Interaction Unload

### Stage 1 — Transport selected

Unit panel shows a **Cargo** section: each loaded unit as a row with name + slot cost badge (e.g., "Horseman · 2 slots"). Units with `movementPointsLeft === 0` are greyed-out with "used this turn". Each active cargo unit row has an **Unload** button.

### Stage 2 — Cargo unit selected for unload

Tapping **Unload** for a specific cargo unit:
1. Calls `getUnloadDestinations(state, transportId, cargoUnitId)` → `unloadRange`
2. Passes `unloadRange` to renderer (same highlight layer as `movementRange`)
3. Sets `pendingUnload = { transportId, cargoUnitId }`
4. Panel updates to show: **"Select a tile to unload [Unit Name]"** + a **Cancel** button

### Completing the unload

Tapping a **highlighted hex**:
- Calls `onUnloadTransport(transportId, cargoUnitId, destination)`
- Clears `pendingUnload` and `unloadRange`
- Plays `SFX.transportUnload()`
- Shows: *"[Unit name] unloaded from [Transport name]."*
- Triggers disembark animation (see §8)
- Transport stays selected, panel refreshes with remaining cargo

### Blocking accidental cancellation

When `pendingUnload` is active, **any tap on a non-highlighted hex is blocked** and consumed:
- Plays `SFX.error()`
- Shows notification: *"Tap a highlighted tile — or use Cancel in the panel."*
- `pendingUnload` and `unloadRange` remain set; the highlighted tiles stay visible

This prevents accidental cancellation from a mis-tap. The **only** exit paths are:
- Tap a valid destination hex (completes the unload)
- Tap the explicit **Cancel** button in the panel (clears pendingUnload + unloadRange, returns to Stage 1)

### Clearing `pendingUnload` on structural events

Clear `pendingUnload` (and `unloadRange`) wherever `movementRange` and `attackRange` are currently cleared. This includes: unit deselection, End Turn, hot-seat handoff, panel close, and any other context that wipes selection state.

---

## 8. Animations

### Boarding animation
When `loadUnitOntoTransport` succeeds, animate the cargo unit sliding toward the transport hex (0.25 s ease-in) before its sprite disappears into the transport. Use the existing unit movement animation infrastructure.

### Disembark animation
When `unloadUnitFromTransport` succeeds, animate the unit appearing at the destination hex with a brief fade-in (0.2 s) from the transport's tile direction. The unit appears before any subsequent input is accepted.

Both animations are cosmetic and non-blocking — game state is mutated immediately; animation plays concurrently.

---

## 9. Notification String Fix

Replace hardcoded "Transport" with the actual unit name:

```ts
// onLoadTransport
const tName = UNIT_DEFINITIONS[gameState.units[transportId]?.type]?.name ?? 'Transport';
showNotification(`Unit loaded onto ${tName}.`, 'info');

// onUnloadTransport
const tName  = UNIT_DEFINITIONS[gameState.units[transportId]?.type]?.name ?? 'Transport';
const cName  = UNIT_DEFINITIONS[gameState.units[cargoUnitId]?.type]?.name ?? 'Unit';
showNotification(`${cName} unloaded from ${tName}.`, 'info');
```

---

## 10. Save Compatibility

`cargoCapacity` and `cargoSize` already exist on `UnitDefinition`. Existing saves with a capacity-1 transport remain valid — `cargoCapacity: 2` applies only to newly trained units. No migration required.

---

## 11. Testing

### `transport-system.test.ts`
- 2 infantry load onto capacity-2 transport ✓
- 1 mounted (2 slots) + 1 infantry loads onto capacity-2 transport, fills it exactly ✓
- 3rd infantry rejected when transport has 1 mounted + 1 infantry aboard ✗; error reason `'no-capacity'`
- Catapult (3 slots) loads alone onto capacity-3 carrack ✓
- Catapult + infantry (4 slots total) rejected from capacity-3 carrack ✗
- `getUnloadDestinations(state, transportId, cargoUnitId)` returns valid hexes for specified unit only
- `getUnloadDestinations` for a cargo unit with `movementPointsLeft === 0` returns `[]`
- Different cargo unit types on the same transport each get their own destination set

### `city-system.test.ts` / completeness
- All four new types appear in `TRAINABLE_UNITS` with `coastalRequired: true`
- All four new types have `PRODUCTION_ICONS` entries
- Inland city cannot queue carrack/galleon/steamship/troop_transport

### `unit-upgrade-system.test.ts`
- Transport in friendly coastal city with `navigation` researched → `canUpgradeUnit` returns `{ canUpgrade: true, targetType: 'carrack', cost: 33 }` (⌈65 × 0.5⌉)
- Transport with insufficient gold → `canUpgrade: false`
- `applyUpgrade(transport, 'carrack')` → type changes, `cargoUnitIds` preserved, health reset to 100

### `tech-definitions.test.ts`
- `amphibious-warfare` has prerequisites `['caravels', 'naval-warfare']` and era 5

### `sfx-catalog.test.ts`
- `TRANSPORT_SFX.load` and `.unload` appear in `allSfxEntries()`
- All four new transport death SFX appear in `allSfxEntries()`
- Update `"allSfxEntries returns exactly N entries"` to the new count
- `carrack-death.ogg`, `galleon-death.ogg`, `steamship-death.ogg`, `troop_transport-death.ogg` exist on disk with OGG magic bytes

### Regression — `pendingUnload` always cleared on handoff

Add a test to `main.ts`-level integration tests (or a new `transport-ui-state.test.ts`) verifying that after End Turn or `currentPlayer` change, neither `pendingUnload` nor `unloadRange` retain values from the previous player's turn. This prevents the hot-seat ghost-highlight bug.

---

## 12. Non-Goals

- No AI transport routing or island logistics (separate track)
- No transport combat strength or escort mechanics
- No cargo health-transfer on transport destruction (handled by existing `removeTransportAndCargo`)
- No multi-destination batch unload in one action
