# Bug Fixes Design — Issues #387, #385, #386, #374

Date: 2026-06-15

---

## Bug #387 — Barbarians Not Attacking Cities

### Root Cause

`processBarbarians` (in `src/systems/barbarian-system.ts`) receives only `playerUnits: Unit[]` as potential targets. It has no concept of cities. When barbarian units surround an empty city — a city with no player units on its tile — they have no valid target and stand idle indefinitely.

### Fix

**Add city targets to `processBarbarians`.**

Add a new optional param `playerCities?: Array<{ id: string; position: HexCoord; owner: string }>`. Barbarians **prefer player units** (current behaviour) and only fall back to targeting a city when no player unit is within `BARBARIAN_CHASE_RANGE`.

Add a new order type alongside the existing ones:

```ts
export interface BarbarianCityAttackOrder {
  attackerUnitId: string;
  cityId: string;
  damage: number;  // era-scaled, e.g. 10 base
}
```

Return `cityAttackOrders: BarbarianCityAttackOrder[]` in `BarbarianProcessResult`.

Movement logic: if the nearest city is not adjacent, move toward it (same step logic as unit targeting). If adjacent, issue a `BarbarianCityAttackOrder` instead of a move order.

In `turn-manager.ts`, after processing `barbResult.attackOrders`, process `barbResult.cityAttackOrders`:

```ts
for (const order of barbResult.cityAttackOrders) {
  const city = newState.cities[order.cityId];
  if (!city) continue;
  const newHp = Math.max(0, (city.hp ?? 100) - order.damage);
  newState.cities = {
    ...newState.cities,
    [order.cityId]: { ...city, hp: newHp },
  };
  bus.emit('barbarian:city-attacked', {
    cityId: order.cityId,
    attackerUnitId: order.attackerUnitId,
    hpLost: (city.hp ?? 100) - newHp,
  });
  if (newHp === 0) {
    // Destroy the city — follow the same cleanup path used by pirate city destruction
    // in threat-pressure-system.ts (search for 'threat:pirate-city-destroyed').
    // Remove city from state.cities, remove cityId from owning civ's cities array,
    // and emit 'barbarian:city-destroyed' for the UI to show a persistent danger notification.
  }
}
```

`city.hp` already exists in the `City` type (`hp?: number`; default 100) and the pirate siege system already uses the same pattern.

### UX

- `main.ts` listens on `'barbarian:city-attacked'`: appends to the owning civ's notification log: `"Barbarians attack [City Name]! (−X HP)"`.
- City panel: already renders HP via the threat-pressure HP bar (used by pirate siege); no new UI needed.
- If the city owner is human and the city is destroyed, fire a persistent notification with type `'danger'`.

### Data / Logic Constraints

- Barbarians only target cities owned by non-barbarian, non-beast, non-pirate civs (same filter as `playerUnits`).
- Barbarians must not target a city if a player unit is within `BARBARIAN_CHASE_RANGE` (unit takes priority).
- A barbarian unit can only issue one order per turn (move OR attack unit OR attack city).
- Damage is era-scaled: 10 HP per turn (consistent with pirate siege era-1 value). Can be tuned in a follow-up.

### Tests

- Barbarian unit adjacent to empty city issues a city attack order.
- Barbarian unit that has a player unit within range ignores the city and targets the unit.
- `applyBarbarianCityDamage` reduces `city.hp` correctly; HP cannot go below 0.
- Barbarian city attack at `hp === 0` triggers city destruction.
- `'barbarian:city-attacked'` event fires with correct `hpLost`.
- No city attack order is issued when the city already has a unit on it (unit attack takes priority).

---

## Bug #385 — Unit Stacking

### Root Cause

`validateUnitMove` (in `src/systems/unit-movement-system.ts`) blocks movement to **any** occupied hex:

```ts
const occupants = getUnitIdsAtCoord(occupancy, target).filter(id => id !== unitId);
if (occupants.length > 0) {
  return movementFailure(from, target, [from, target], 'occupied', 'Another unit is already there.');
}
```

Meanwhile `getMovementRange` already treats friendly tiles as valid destinations (falling through the occupancy check without a `continue`), so the hex is highlighted reachable but the move always fails.

### Fix

**Allow same-owner units to share any tile; block different-owner units.**

Single change in `validateUnitMove`:

```ts
// Before:
if (occupants.length > 0) {
  return movementFailure(..., 'occupied', 'Another unit is already there.');
}

// After:
const hasHostileOccupant = occupants.some(id => occupancy.ownersByUnitId[id] !== unit.owner);
if (hasHostileOccupant) {
  return movementFailure(..., 'occupied', 'An enemy unit is blocking the way.');
}
```

No changes needed to `getMovementRange` — it already allows movement through and onto friendly tiles.

### Data / Logic Constraints

- `occupancy.ownersByUnitId` is populated by `buildUnitOccupancy`; it already tracks per-unit owners.
- Barbarian AI movement goes through `moveUnit` directly (not `validateUnitMove`), so the barbarian collision-avoidance logic in `processBarbarians` is unaffected.
- Pirate and beast units are separate owners; a player unit moving to a pirate/beast tile is still blocked (different owner = hostile).
- The stack picker (`unit-stack-panel.ts`) already handles multi-unit stacks; no change needed there.
- The sprite overlay `buildUnitMapPresentations` already groups co-located same-owner units into a single stack presentation; no change needed there either.

### Tests

- Moving a unit to a hex occupied by a same-owner unit succeeds.
- Moving a unit to a hex occupied by a different-owner unit fails with `'occupied'`.
- Moving a unit to a hex occupied by a barbarian unit fails with `'occupied'`.
- Stack of 3 same-owner units on one hex renders correctly (stack count badge shows 3).
- `resolveSelectedUnitTapIntent` resolves `{kind: 'move'}` when tapping a friendly-occupied tile in range (existing pass-through is already correct; add regression to lock it).

---

## Bug #386 — Ships in Non-Coastal City

### Root Cause — Two Issues

**Issue 1 — `isCityCoastal` uses `ownedTiles`:**

```ts
// Current (wrong):
export function isCityCoastal(city: City, mapTiles: GameMap['tiles']): boolean {
  return (city.ownedTiles ?? []).some(coord => {
    const tile = mapTiles[hexKey(coord)];
    return tile?.terrain === 'ocean' || tile?.terrain === 'coast';
  });
}
```

As a city grows, it claims tiles beyond the original radius-1. A landlocked city that expanded its territory to include a distant coast tile incorrectly returns `true`, making ships available for production.

**Issue 2 — Stale coastal buildings/units from old saves:**

Ships and docks queued or built before `coastalRequired` was added to their definitions persist in `city.productionQueue` / `city.buildings[]`. The queue-drain in `processCity` only drops the **head** of the queue and misses buildings entirely in its full-queue filter (lines 694–714 only check resource requirements for buildings, not `coastalRequired`).

### Fix — Issue 1: Correct `isCityCoastal`

Change `isCityCoastal` to check the city center and its 6 immediate neighbors only:

```ts
// New signature — accepts full map for wrapping support:
export function isCityCoastal(city: City, map: GameMap): boolean {
  const coordsToCheck = [city.position, ...hexNeighbors(city.position)];
  return coordsToCheck.some(coord => {
    const wrapped = map.wrapsHorizontally
      ? wrapHexCoord(coord, map.width)
      : coord;
    const tile = map.tiles[hexKey(wrapped)];
    return tile?.terrain === 'ocean' || tile?.terrain === 'coast';
  });
}
```

Add `hexNeighbors` to the existing `hex-utils` import in `city-system.ts`.

**Update all callers** to pass `map` instead of `map.tiles`:

- `getAvailableBuildings(city, completedTechs, mapTiles, ...)` → `getAvailableBuildings(city, completedTechs, map, ...)` (signature change)
- `getTrainableUnitsForCiv` call site → pass `map`
- `processCity` → already receives `map: GameMap`; update internal call
- `basic-ai.ts` call to `getAvailableBuildings` → pass `state.map`

### Fix — Issue 2: Save Migration

Add `migrateLegacyCoastalData(state: GameState): GameState` to `src/storage/save-manager.ts`:

```ts
function migrateLegacyCoastalData(state: GameState): GameState {
  const cities = { ...state.cities };
  for (const [id, city] of Object.entries(cities)) {
    if (isCityCoastal(city, state.map)) continue;

    // Drop coastal-required items from the full queue (not just the head)
    const cleanQueue = city.productionQueue.filter(item => {
      const building = BUILDINGS[item];
      if (building?.coastalRequired) return false;
      const unit = TRAINABLE_UNITS.find(u => u.type === item);
      if (unit?.coastalRequired) return false;
      return true;
    });

    // Remove coastal-required buildings already built
    const cleanBuildings = city.buildings.filter(bId => !BUILDINGS[bId]?.coastalRequired);

    if (cleanQueue.length !== city.productionQueue.length || cleanBuildings.length !== city.buildings.length) {
      cities[id] = { ...city, productionQueue: cleanQueue, buildings: cleanBuildings };
    }
  }
  return { ...state, cities };
}
```

Add to the migration chain in `save-manager.ts` (line 257):

```ts
migrateLegacyCoastalData(
  normalizeThreatPressureDefaults(
    normalizeLandmassKeys(
      normalizeLegacyCitySimState(
        migrateLegacyPlanningState(
          migrateLegacyNamingState(
            ensureGameIdentity(state)
          )
        )
      )
    )
  )
)
```

### UX

No silent data loss: the city panel already refreshes on load and will show the cleaned queue/building list. No player notification needed for migration cleanup (old saves auto-heal silently, consistent with other migration behaviour).

### Tests

- `isCityCoastal` returns `true` for a city whose center tile is adjacent to a `'coast'` tile.
- `isCityCoastal` returns `false` for a landlocked city.
- **Regression**: `isCityCoastal` returns `false` for a city whose `ownedTiles` contains a distant coast tile but whose 6 immediate neighbors and own tile are all inland.
- `isCityCoastal` returns `true` for a city at q=0 on a wrapping map when the adjacent wrapped tile at q=width-1 is coast.
- `migrateLegacyCoastalData` removes coastal-required queue entries from a non-coastal city.
- `migrateLegacyCoastalData` removes a built dock from `city.buildings[]` in a non-coastal city.
- `migrateLegacyCoastalData` does not modify a coastal city.
- `migrateLegacyCoastalData` is idempotent (safe to run twice).

---

## Bug #374 — Unit Color Inconsistency (Color Changes When Moving)

### Root Cause

There are two separate rendering paths for units, and they use different color sources:

| Path | Trigger | Color source |
|------|---------|-------------|
| DOM sprite overlay | Idle, zoom ≥ `LOD_SPRITE_ZOOM_THRESHOLD` | Faction accent color baked into SVG fill attributes (e.g. Zulu → `'imperials'` → `#b53026`) |
| Canvas glyph / `spriteCache` | Idle low zoom OR moving | `colorLookup[unit.owner]` = game-assigned civ color (e.g. Zulu → green) |

When a unit starts moving, it transitions from DOM to canvas and the color changes. When it stops, it transitions back to DOM and changes again.

**Key finding**: the v2 SVG sprites are **pre-serialized TypeScript files with hardcoded fill hex values** (auto-generated by `scripts/serialize-sprites.mjs`). CSS custom properties cannot override baked `fill="..."` attributes on inline SVG. The approach must instead do a targeted **string replacement** of the faction accent color before mounting the SVG into the DOM.

### Fix

**Step 1 — Define faction accent colors**

Add a constant in `src/renderer/sprite-overlay.ts`:

```ts
// The per-faction "civ-identity" accent color baked into auto-generated SVG fills.
// Must match the palette.secondary value used in the source sprite TSX files.
const FACTION_SPRITE_ACCENT: Record<string, string> = {
  imperials: '#b53026',
  vikings:   '#1d4a8c',
  pharaohs:  '#d4a13c',
  hellenes:  '#2c8a5a',
  khanate:   '#7a3a14',
  shogunate: '#5b4a7a',
};
```

**Step 2 — Add `civId` and `colorLookup` to the sprite overlay contract**

In `SpriteEntity` (in `sprite-overlay.ts`):
```ts
/** Owner civ ID used to look up the game-assigned color for accent replacement. */
civId?: string;
```

Change `SpriteOverlay.sync()` signature:
```ts
sync(
  camera: Camera,
  entities: SpriteEntity[],
  map: { width: number; wrapsHorizontally: boolean },
  opts: { isPinching: boolean; reducedMotion: boolean },
  colorLookup: Record<string, string> = {},   // new param
): void
```

Add `civColor` to the `PoolEntry` type:
```ts
interface PoolEntry {
  // ...existing fields...
  civColor: string;   // color used at creation; triggers re-create if it changes
}
```

**Step 3 — Apply color at mount time (pool miss)**

In the pool-miss branch, after `const svgHtml = this.lookupSprite(entity)`:

```ts
const accentColor = FACTION_SPRITE_ACCENT[entity.faction];
const civColor = entity.civId ? (colorLookup[entity.civId] ?? '') : '';
const coloredSvgHtml =
  accentColor && civColor && civColor !== accentColor
    ? svgHtml.replaceAll(accentColor, civColor)
    : svgHtml;

// ... then use coloredSvgHtml instead of svgHtml for wrapper.innerHTML
```

Store `civColor` in the pool entry.

**Step 4 — Invalidate pool on color change (pool hit)**

In the pool-hit branch, add a check:

```ts
const newCivColor = entity.civId ? (colorLookup[entity.civId] ?? '') : '';
if (existing.faction !== entity.faction || existing.civColor !== newCivColor) {
  // Force re-create: remove from pool and DOM, fall through to miss path
  existing.el.remove();
  this.pool.delete(key);
  // ... re-create as pool miss (loop re-entry or refactor into shared helper)
}
```

In practice this only fires when a unit changes owner (city capture) — very rare — so the overhead is negligible.

**Step 5 — Populate `civId` in `buildUnitMapPresentations`**

In `src/renderer/unit-map-presentation.ts`, the returned entity already flows into `SpriteEntity`. Add:
```ts
civId: leadUnit.owner,
```
to the entity object built in `render-loop.ts` (lines 380–395).

**Step 6 — Pass `colorLookup` to `sync()` in `render-loop.ts`**

```ts
this.spriteOverlay?.sync(
  this.camera,
  unitEntities,
  { width: this.state.map.width, wrapsHorizontally: this.state.map.wrapsHorizontally },
  { isPinching: ..., reducedMotion: ... },
  colorLookup,   // new arg
);
```

### Color Coverage for All Unit Types

| Owner type | colorLookup source | Result |
|-----------|-------------------|--------|
| Player civ | `civ.color` (render-loop line 372–374) | game-assigned color |
| Barbarian | hardcoded `'#8b4513'` (render-loop line 371) | brown (no change — barbarians have no sprite overlay; `getUnitSpriteV2('warrior', 'barbarian')` returns `null`) |
| Minor civ | `MINOR_CIV_DEFINITIONS[...].color` (render-loop line 376–378) | definition color |
| Pirate | should be added to `colorLookup` using `PIRATE_FLEET_COLOR` or similar constant | pirate color |
| Beast | should be added to `colorLookup` with `'#7a1f2b'` (the beast fallback in `resolveUnitVisual`) | dark red |

**Verify in implementation**: pirate and beast units may not have a DOM sprite (their faction may return `null` from `getUnitSpriteV2`), in which case the canvas path handles them and no colorLookup entry is needed.

### Moving Units

Moving units are already rendered exclusively on canvas via `drawUnitMovementAnimations`, which uses `colorLookup[animation.unit.owner]`. No change needed. After this fix, idle DOM sprites use the same `colorLookup` color source → both paths consistent.

### Tests

- A unit entity with `civId = 'player-civ-1'`, `faction = 'imperials'`, and `colorLookup['player-civ-1'] = '#2d6a4f'` has `innerHTML` containing `#2d6a4f` and NOT `#b53026`.
- A unit entity with no `civId` or no matching `colorLookup` entry uses the faction accent color as-is (no replacement).
- A barbarian unit (`faction` lookup returns `null` from `getUnitSpriteV2`) still falls through to canvas — no DOM mount attempted.
- Pool invalidation: when `civColor` changes on a pool hit, the old element is removed and a new element with the updated color is created.
- `SpriteOverlay.sync()` called with empty `colorLookup` (default) does not crash.
