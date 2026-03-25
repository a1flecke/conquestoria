# Milestone 3b "Exploration Rewards" Design Spec

**Goal:** Add natural wonders, tribal villages, and Treasurer/Scholar advisors to make exploration rewarding and every map unique.

**Prerequisites:** M3a complete (228 tests, 25 test files, 12 civs, hot seat, map sizes).

---

## 1. Natural Wonders

### 1.1 Data Model

Each wonder is defined in a static `WONDER_DEFINITIONS` array (like `CIV_DEFINITIONS`):

```typescript
type WonderEffect =
  | { type: 'adjacent_yield_bonus'; yields: Partial<ResourceYield> }
  | { type: 'healing'; hpPerTurn: number }
  | { type: 'eruption'; chance: number }
  | { type: 'vision'; bonus: number }
  | { type: 'combat_bonus'; defenseBonus: number }
  | { type: 'none' }

interface WonderDefinition {
  id: string;
  name: string;
  description: string;
  yields: ResourceYield;
  discoveryBonus: { type: 'gold' | 'science' | 'production'; amount: number };
  effect: WonderEffect;
  validTerrain: TerrainType[];
}
```

`HexTile` gains a `wonder: string | null` field (wonder definition ID). Wonders replace any existing resource on the tile.

### 1.2 Placement

During map generation, after terrain and resources, place wonders on valid terrain tiles.

- **Count by map size:** 5 (small), 8 (medium), 15 (large)
- **Minimum 8-hex distance** between wonders
- **Minimum 6-hex distance** from start positions
- Wonders replace the tile's resource (if any)
- Selection: shuffle `WONDER_DEFINITIONS`, filter by valid terrain availability, place until count reached or no valid tiles remain (graceful degradation — fewer wonders is fine)

### 1.3 The 15 Wonders

| Wonder | Terrain | Yields (F/P/G/S) | Discovery Bonus | Effect |
|--------|---------|-------------------|-----------------|--------|
| Great Volcano | volcanic | 0/3/0/1 | +30 science | eruption (5% chance) |
| Sacred Mountain | mountain | 0/0/2/2 | +25 science | adjacent_yield_bonus (+1 science) |
| Crystal Caverns | hills | 0/1/3/0 | +50 gold | none |
| Ancient Forest | forest | 2/1/0/0 | +20 production | healing (10 HP/turn) |
| Coral Reef | coast | 2/0/1/0 | +30 gold | adjacent_yield_bonus (+1 food) |
| Grand Canyon | desert | 0/0/2/1 | +25 gold | combat_bonus (+30% defense) |
| Aurora Fields | tundra | 1/0/0/3 | +40 science | none |
| Frozen Falls | snow | 0/2/1/1 | +20 production | vision (+2) |
| Dragon Bones | plains | 0/2/0/2 | +35 science | combat_bonus (+20% defense) |
| Singing Sands | desert | 1/0/2/0 | +30 gold | none |
| Sunken Ruins | coast | 0/0/2/2 | +40 science | none |
| Floating Islands | hills | 1/1/1/1 | +25 production | vision (+1) |
| Bioluminescent Bay | coast | 1/0/2/1 | +35 gold | adjacent_yield_bonus (+1 gold) |
| Bottomless Lake | swamp | 0/1/1/2 | +30 science | healing (5 HP/turn) |
| Eternal Storm | ocean | 0/0/0/3 | +50 science | vision (+3) |

### 1.4 Discovery

Wonder discovery is checked in `main.ts` after `updateVisibility` calls (where `currentPlayer` is known), not via the `fog:revealed` event (which lacks `civId`). After visibility updates, scan newly revealed tiles for wonders and call `processWonderDiscovery(state, civId, wonderId)`.

- Track first discoverer in `GameState.discoveredWonders: Record<string, string>` (wonderId -> civId)
- Track all discoverers in `GameState.wonderDiscoverers: Record<string, string[]>` (wonderId -> civId[]) for advisor triggers
- First discoverer gets the discovery bonus (gold/science/production added directly)
- Emit `'wonder:discovered'` event with `{ civId, wonderId, position, isFirstDiscoverer }`
- All discoverers get a notification

### 1.5 Unique Effects

Wonder base yields **add to** terrain base yields (they do not replace them). `calculateCityYields` imports `getWonderDefinition` from `wonder-definitions.ts` and checks each owned tile's `wonder` field.

Effects are processed by a `processWonderEffects(state)` function called in `processTurn` **after** city processing (so eruption damage affects next turn's yields, not the current turn):

- **adjacent_yield_bonus:** Calculated in `calculateCityYields` — if a city's owned tile is adjacent to a wonder with this effect, add the bonus yields. `calculateCityYields` gains a third parameter `map: GameMap` (already has it) and checks adjacent tiles for wonders.
- **healing:** During unit reset phase in `processTurn`, units on a wonder tile with healing gain extra HP (capped at 100).
- **eruption:** Roll chance per turn. On eruption, destroy improvements (set to `'none'`, `improvementTurnsLeft: 0`) on adjacent tiles. Emit `'wonder:eruption'` event with `{ wonderId, position, tilesAffected }`.
- **vision:** Checked when calculating unit vision range — units on this tile get bonus vision.
- **combat_bonus:** Checked during combat resolution — defender on this tile gets bonus defense. `defenseBonus` is stored as a decimal (0.30 means +30%), matching the existing `getTerrainDefenseBonus` pattern.

---

## 2. Tribal Villages

### 2.1 Data Model

```typescript
interface TribalVillage {
  id: string;
  position: HexCoord;
}
```

Stored in `GameState.tribalVillages: Record<string, TribalVillage>`.

### 2.2 Placement

During map generation, after wonders:

- **Count by map size:** 8 (small), 12 (medium), 20 (large)
- Passable land tiles only (not ocean, coast, mountain)
- **Minimum 4-hex distance** from start positions
- **Minimum 3-hex distance** from each other
- Not on wonder tiles

### 2.3 Visit Mechanics

When any unit (not barbarian) moves onto a tile containing a village:

1. Remove the village from `tribalVillages`
2. Roll a random outcome using seeded RNG (turn-based)
3. Apply the outcome
4. Emit `'village:visited'` event with outcome details
5. Show notification

### 2.4 Outcome Table

| Outcome | Weight | Effect | Fallback |
|---------|--------|--------|----------|
| Gold | 25% | +25-50 gold to visiting civ | — |
| Food | 20% | +15-30 food to nearest city | If no city: +25-50 gold instead |
| Science | 15% | +10-25 research progress toward current tech | If no research active: +25 gold instead |
| Free unit | 15% | Spawn scout or warrior at village position, owned by visiting civ | — |
| Free tech | 10% | Complete a random tech with status `'available'` | If no available techs: +50 gold instead |
| Ambush | 10% | Spawn 1-2 barbarian warriors on adjacent passable tiles | If no passable adjacent tiles: spawn 0 (ambush fizzles, still show warning message) |
| Illness | 5% | Visiting unit loses 20-40 HP (minimum 1 HP — cannot kill) | — |

### 2.5 Hot Seat

Village visits happen immediately on the active player's turn. Once visited, the village is removed for all players. No per-player tracking needed.

---

## 3. Treasurer and Scholar Advisors

### 3.1 Type Changes

Expand `AdvisorType` to: `'builder' | 'explorer' | 'chancellor' | 'warchief' | 'treasurer' | 'scholar'`

Update `GameSettings.advisorsEnabled` default to include both new types as `true`.

**Test fixture impact:** All existing test files that construct `advisorsEnabled` with only 4 keys must be updated to include `treasurer: true, scholar: true`. Update these fixtures as the first step of the advisor task to avoid type errors blocking other work.

### 3.2 Unlock Triggers

- **Scholar:** Unlocks when first tech research completes (check `techState.completed.length > 0`)
- **Treasurer:** Unlocks when player gold >= 50 or has any trade route

(For M3b, "unlock" means the advisor's messages start triggering. The advisor system already supports per-advisor enable/disable.)

### 3.3 Scholar Messages

| ID | Trigger | Message |
|----|---------|---------|
| scholar_wonder | Wonder discovered by current player | "Fascinating! [Wonder] could advance our knowledge. Settle nearby to benefit." |
| scholar_no_research | No current research, turn >= 2, has completed a tech | "Our scholars are idle! Choose a tech to research." |
| scholar_tech_complete | Tech just completed | "Excellent progress! Our understanding deepens." |
| scholar_village_science | Village visit gave science bonus | "The villagers shared ancient knowledge with us!" |
| scholar_village_tech | Village visit gave free tech | "Remarkable — the villagers taught us something entirely new!" |
| scholar_era | Turn is multiple of 20 and era could advance | "We're making strides. Continue researching to reach a new era." |

### 3.4 Treasurer Messages

| ID | Trigger | Message |
|----|---------|---------|
| treasurer_rich_idle | Gold > 100, no production queued in any of current player's cities | "We're sitting on a fortune! Invest in buildings or units." |
| treasurer_village_gold | Village visit gave gold | "A generous village! Our coffers grow." |
| treasurer_trade_route | Trade route count increased | "Trade is flowing. Each route strengthens our economy." |
| treasurer_wonder_yields | City works a wonder tile | "Our city near [wonder] is thriving from its bounty." |
| treasurer_broke | Gold < 10 | "Our coffers are nearly empty. We need gold-producing tiles or trade." |
| treasurer_camp_reward | Barbarian camp destroyed | "The spoils of victory bolster our treasury." |

### 3.5 No Advisor Dynamics

Advisor disagreements are deferred to a later milestone. Each advisor fires independently.

---

## 4. File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/systems/wonder-definitions.ts` | 15 `WonderDefinition` entries, `getWonderDefinition(id)` |
| `src/systems/wonder-system.ts` | `placeWonders`, `processWonderDiscovery`, `processWonderEffects`, `getWonderYieldBonus` |
| `src/systems/village-system.ts` | `placeVillages`, `visitVillage`, `rollVillageOutcome` |
| `tests/systems/wonder-system.test.ts` | Wonder placement, discovery, effects |
| `tests/systems/village-system.test.ts` | Village placement, visit, outcomes |
| `tests/systems/wonder-definitions.test.ts` | Definition validation (unique IDs, valid terrain) |

### Modified Files

| File | Changes |
|------|---------|
| `src/core/types.ts` | Add `WonderEffect`, `WonderDefinition`, `TribalVillage`, `VillageOutcomeType`; expand `AdvisorType`; add `wonder` to `HexTile`; add `tribalVillages`, `discoveredWonders`, `wonderDiscoverers` to `GameState`; add new `GameEvents` entries: `'wonder:discovered': { civId: string; wonderId: string; position: HexCoord; isFirstDiscoverer: boolean }`, `'wonder:eruption': { wonderId: string; position: HexCoord; tilesAffected: HexCoord[] }`, `'village:visited': { civId: string; position: HexCoord; outcome: VillageOutcomeType; message: string }` |
| `src/systems/map-generator.ts` | Call `placeWonders` and `placeVillages` after terrain generation |
| `src/core/game-state.ts` | Initialize `tribalVillages`, `discoveredWonders` in `createNewGame` and `createHotSeatGame` |
| `src/core/turn-manager.ts` | Call `processWonderEffects` during turn processing |
| `src/systems/resource-system.ts` | Add wonder yields and adjacent wonder bonuses in `calculateCityYields` |
| `src/systems/combat-system.ts` | Check wonder combat_bonus in `resolveCombat` |
| `src/ui/advisor-system.ts` | Add Treasurer and Scholar message triggers; update advisor type handling |
| `src/main.ts` | Handle village visit on unit move; wonder discovery on fog reveal; migrate legacy saves |
| `src/renderer/hex-renderer.ts` | Render wonder icons and village icons on map tiles |

---

## 5. Testing Strategy

### Wonder System Tests (~15)

- `WONDER_DEFINITIONS` has exactly 15 entries with unique IDs
- Each wonder has valid terrain types and non-zero yields or discovery bonus
- `placeWonders` respects count limits per map size (5/8/15)
- `placeWonders` enforces 8-hex minimum distance between wonders
- `placeWonders` enforces 6-hex buffer from start positions
- Wonder replaces tile resource when placed
- `processWonderDiscovery` grants discovery bonus to first discoverer only
- `processWonderDiscovery` records discoverer in `discoveredWonders`
- Second discoverer does not get discovery bonus
- `calculateCityYields` includes wonder yields for owned wonder tiles
- Adjacent yield bonus applies to neighboring tiles
- Healing effect adds HP to units on tile (capped at 100)
- Eruption effect can destroy adjacent improvements
- Vision bonus increases unit vision on wonder tile
- Combat bonus increases defense for defender on wonder tile

### Village System Tests (~10)

- `placeVillages` respects count per map size (8/12/20)
- `placeVillages` enforces distance constraints (4 from starts, 3 from each other)
- Villages don't spawn on wonder tiles or impassable tiles
- `visitVillage` removes village from state
- Gold outcome adds gold to civ
- Food outcome adds food to nearest city
- Science outcome adds research progress
- Free unit outcome spawns unit at village position
- Ambush outcome spawns barbarian warriors on adjacent tiles
- Illness outcome reduces visiting unit HP (minimum 1)

### Advisor Tests (~6)

- `AdvisorType` includes 'treasurer' and 'scholar'
- Scholar triggers on no-research-active condition
- Treasurer triggers on high gold with no production
- Treasurer triggers on low gold
- `advisorsEnabled` defaults include treasurer and scholar
- Legacy save migration adds new advisor defaults

---

## 6. Implementation Notes

- Wonder and village placement use the same seeded RNG as the map generator for reproducibility.
- Village visit RNG should use `turn * unitId hash` to be deterministic but varied.
- The `wonder` field on `HexTile` is nullable (`string | null`), same pattern as `resource`.
- Wonder effects that modify other systems (combat, vision, healing) should be checked at the call site, not pushed from the wonder system — keeps coupling low.
- Eruption is the only wonder effect that mutates state during `processTurn`. All others are read-only bonuses.
- The `'scholar_no_research'` message replaces the existing Explorer `research_tech` message (advisor-system.ts). Remove the Explorer version and add the Scholar version. Update the corresponding test in `tests/ui/advisor-system.test.ts`.
- Legacy save migration: add `tribalVillages: {}`, `discoveredWonders: {}`, `wonderDiscoverers: {}` if missing; add `treasurer: true, scholar: true` to `advisorsEnabled`. Add `wonder: null` to any `HexTile` missing it.
- Village placement also degrades gracefully — place as many as possible, stop if no valid tiles remain.
- Wonder `combat_bonus.defenseBonus` uses decimal format (0.30 = +30%) matching the existing `getTerrainDefenseBonus` convention.
