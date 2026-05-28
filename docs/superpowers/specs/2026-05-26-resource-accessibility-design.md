# Resource Accessibility Design

**Date:** 2026-05-26
**Last revised:** 2026-05-27 (deep review pass — 17 issues corrected)
**Problem:** Kids (ages 7, 10, 12) — and occasionally adults — find special resources too hard to reach and don't understand how to go get them. Three distinct pain points: mechanics opacity (don't know the path), hope drain (journey takes too long), motivation gap (reward feels too decoupled from effort).
**Goal:** Multi-faceted solution that preserves the specialness and strategic weight of resources while making them legible, reachable, and exciting for the full family age range. Do not overcorrect into triviality.

---

## Relationship to the Marketplace Trade Roadmap

The marketplace trade roadmap (`docs/superpowers/specs/2026-05-20-marketplace-trade-roadmap.md`) is the authoritative spec for the S1–S12 trade slice sequence. This spec does NOT replace or reorder that work.

| This spec's pillar | Trade roadmap relationship |
|---|---|
| Pillar 1 — Map gen + settler cost | Independent. No overlap. Can ship before S5. |
| Pillar 2 — Expedition + Outpost | Independent. New unit type, distinct from the Caravan (S5). Can ship alongside S5. |
| Pillar 3 — Diplomatic Marketplace | Depends on S5 and **accelerates S9** (buy resource for gold). The "Available from Known Civs" section IS the S9 discovery UI; the emergency import IS S9's transaction. Design this as the S9 implementation, not a parallel system. |
| Pillar 4 — Guidance | Partially independent. Advisor tips can ship any time. Locked-section button depends on S4b being implemented. |

---

## The Four Pillars

### Pillar 1 — Foundation Fixes: "Closer and Cheaper"

Root-cause changes to map generation and settler cost. These are **early-game** fixes — they help the 7-year-old who hasn't yet met another civ or researched the trade-routes tech.

#### Map generation

**Change 1 — Higher base probability:**
Raise `DEFAULT_RESOURCE_PROBABILITY` in `src/systems/map-generator.ts` from `0.15` → `0.20`.

**Change 2 — Start-area resource guarantee:**
Add a new exported function `guaranteeStartResources(map: GameMap, startPositions: HexCoord[], rng: () => number): void` in `src/systems/map-generator.ts`.

Algorithm:
1. For each starting position, collect all tiles within hex distance 5.
2. If the radius contains at least one luxury resource (via `RESOURCE_DEFINITIONS`), the luxury guarantee is satisfied for this start. Otherwise: find the nearest eligible terrain tile (closest by hex distance; ties broken by `rng()` draw; never overwriting an existing resource). If an eligible tile is found, place a luxury matching that terrain. If **no eligible terrain tile exists within radius 5** (edge case: ocean start, tiny island), skip silently — do not expand the search radius, as doing so could place resources near other civs' starts.
3. Repeat step 2 for strategic resources independently.
4. Tiles at radius 0–1 count toward both guarantees — no wasted placement if the civ already has one close.

**Caller:** `src/core/game-state.ts`, called **after** `findStartPositions()` returns and **before** `placeWonders()` / civ unit placement, using a seeded RNG instance: `createRng(gameSeed + '-resource-guarantee')`. `generateMap()` itself is NOT changed — it does not have access to civ positions.

#### Settler cost

| Era | Current | New |
|-----|---------|-----|
| 1   | 24      | **16** |
| 2   | 32      | **24** |
| 3   | 40      | 40  |
| 4   | 48      | 48  |
| 5   | 56      | 56  |

**Regression note:** Any existing test asserting `getSettlerProductionCost(1) === 24` must be updated to `=== 16`.

---

### Pillar 2 — Expedition + Resource Outpost: "Plant Your Flag"

A new unit and structure providing the adventurous middle path. Solves hope drain for mountain/hill resources. **Early-game** feature — accessible from the foraging era.

> **Not to be confused with the Caravan unit (S5).** The Caravan establishes gold-income trade routes between cities. The Expedition claims individual resource tiles by building a physical outpost. Separate units, separate mechanics, separate purpose.

#### Expedition unit

All 6 mandatory end-to-end wirings per `.claude/rules/end-to-end-wiring.md` are required.

| Property | Value |
|----------|-------|
| Type ID | `'expedition'` |
| Icon / PRODUCTION_ICONS | `'🧭'` — compass; not used by any existing unit |
| Production cost | 18 |
| Movement | 3 |
| Terrain movement penalty | None — crosses hills and mountains at full speed |
| Combat strength | 0 — any enemy unit that moves onto its tile destroys it (existing zero-strength unit behaviour) |
| Tech required | `'foraging'` |
| Domain | `'land'` |
| Death cleanup | None needed — Expedition has no associated GameState record beyond the `Unit` itself. |

**AI parity (required by end-to-end wiring rules):** `basic-ai.ts` trains an Expedition when:
- The civ has `'foraging'` tech, AND
- There is a resource tile within 8 hexes (A\* distance) that is not in any civ's city territory, AND
- The civ does not already have an uncommitted Expedition unit.

The AI immediately uses `performEstablishOutpost` (the shared helper, see below) when the Expedition is adjacent to or on an eligible resource tile.

#### "Establish Outpost" action — mechanics

**The Expedition unit is consumed immediately when the action is taken.** The improvement then counts down on the tile over 2 turns via the normal improvement tick in `main.ts:processImprovements()`. No unit remains on the tile during construction.

Step-by-step:
1. Player selects an Expedition unit.
2. Action "Establish Outpost" appears in the selected-unit-info panel when:
   - The Expedition stands on a tile where `tile.resource !== null`, AND
   - The civ has researched the tech in `RESOURCE_DEFINITIONS` for that resource, AND
   - `tile.improvement === 'none'` (tile is not already improved), AND
   - `tile.owner !== civId || !city.ownedTiles.includes(hexKey(tile))` — **the tile must NOT already be in the civ's city territory** (if it's already in territory, the normal worker improvement path applies; no outpost needed).
3. On confirm: call `performEstablishOutpost(state, unitId)` — a shared helper in `src/systems/resource-acquisition-system.ts` so both human and AI paths use the same logic (actor-complete).
4. The helper:
   - Sets `tile.improvement = 'resource_outpost'`
   - Sets `tile.improvementTurnsLeft = 2`
   - Sets `tile.improvementOwner = civId` (existing field — tracks who started the build; cleared automatically by `processImprovements` on completion at line ~2496 of `main.ts`)
   - Sets `tile.owner = civId` (marks territorial claim for the renderer and the outpost acquisition pass)
   - Removes the Expedition unit from `state.units` (unit consumed)
   - Returns new `GameState` (immutable spread-copy)
5. After 2 turns `processImprovements()` sets `improvementTurnsLeft = 0` and emits `improvement:completed`. The outpost is now active.

#### Resource Outpost — data model

`'resource_outpost'` is added to the `ImprovementType` union in `src/core/types.ts`. It is explicitly excluded from `BuildableImprovementType` (workers cannot build it; only Expeditions can establish it). Update the type definitions:

```typescript
export type ImprovementType = 'farm' | 'mine' | 'lumber_camp' | 'watermill'
  | 'plantation' | 'pasture' | 'camp' | 'quarry' | 'resource_outpost' | 'none';
export type BuildableImprovementType = Exclude<ImprovementType, 'none' | 'resource_outpost'>;
```

> **Name collision note:** `CityMaturity` already uses the string `'outpost'`. The improvement type is named `'resource_outpost'` (underscore-prefixed) to avoid any collision. These are entirely unrelated concepts.

`getCivAvailableResources` in `src/systems/resource-acquisition-system.ts` is extended with a **second pass** (after the existing city-territory pass): scan all map tiles for `tile.improvement === 'resource_outpost' && tile.owner === civId && tile.improvementTurnsLeft === 0`. Apply the same `def.tech` check. Add matching resources to the result set. The linear scan over all tiles is acceptable for the expected map sizes (60×40 = 2,400 tiles).

#### Resource Outpost — runtime behaviour

| Property | Detail |
|----------|--------|
| Effect | Full resource effect once `improvementTurnsLeft === 0`, via the extended `getCivAvailableResources` pass above. All downstream consumers (yield bonuses, happiness, S4b unit/building gates) benefit automatically. |
| Upkeep | 2 gold/turn. The turn-manager's per-civ gold processing pass scans map tiles for `tile.improvement === 'resource_outpost' && tile.owner === civId && tile.improvementTurnsLeft === 0` and deducts 2 gold per match from that civ's treasury. **Upkeep failure:** if the civ cannot afford upkeep, the existing gold deficit / treasury-strain mechanics apply (the outpost is NOT auto-destroyed on deficit — it follows the same behaviour as building maintenance). |
| Pillage | Any enemy unit moving onto the tile triggers the existing improvement-pillage path. Pillage sets `tile.improvement = 'none'` and `tile.improvementTurnsLeft = 0`. **Owner field on pillage:** if the tile is NOT in any city's `ownedTiles`, also set `tile.owner = null`. If the tile IS in a city's `ownedTiles` (edge case: territory expanded onto an outpost tile), leave `tile.owner` unchanged — the city still controls the tile. |
| Visibility | Renders as 🚩 via `IMPROVEMENT_ICONS['resource_outpost']` using the existing improvement-icon draw path in `hex-renderer.ts`. Visible to all players per existing improvement rendering rules. |
| In-progress rendering | While `improvementTurnsLeft > 0`, the existing improvement-under-construction renderer shows the turn countdown. The 🚩 icon is NOT drawn until complete (same as all other improvements). |
| City founding on outpost tile | When a settler founds a city on a tile that has an outpost, the normal city-founding code clears `tile.improvement` to `'none'`. From that point the city-center exception in `getCivAvailableResources` (tech-only, no improvement needed) covers the resource. No special outpost handling needed. |
| Conversion via territory expansion | If city territory later expands to include an outpost tile, the city-territory pass in `getCivAvailableResources` picks up the resource (improvement + tech check). The outpost improvement itself can be left in place — the system naturally de-duplicates via the `Set<ResourceType>` return type. The upkeep scan will continue to charge 2 gold/turn until the worker upgrades the tile to a proper improvement (at which point `tile.improvement` changes and the outpost upkeep scan no longer matches). The implementer may optionally auto-convert the outpost to the correct improvement when territory expansion occurs, but this is not required. |

---

### Pillar 3 — Diplomatic Marketplace: "Make Friends, Get Stuff"

**This is a mid-game feature.** The `trade-routes` tech is era 4. Players who haven't reached era 4 should rely on Pillars 1 and 2 for resource access. This pillar is for 10–12-year-olds and adults who are into the mid-game.

**Implementation note:** This pillar accelerates and implements **S9 from the trade roadmap** ("Buy a resource for gold"). Trade routes remain purely gold-income mechanisms (per S5/S6 design). The diplomatic path is: discover a civ that has a resource → buy access for gold → its effect applies for 10 turns.

#### "Available from Known Civs" section in Marketplace panel

New section added to `src/ui/marketplace-panel.ts`. All UI must use `state.currentPlayer` — never hardcoded.

**Visibility gate:** Only rendered when `state.civilizations[state.currentPlayer].techState.completed` includes `'trade-routes'`. Before that tech: section is hidden entirely (not shown as empty). This keeps the panel clean for early-game players.

**"Has met" check:** Use `state.civilizations[state.currentPlayer].diplomacy.relationships` — if a civ ID appears as a key in the relationships map, the current player has met that civ. Do NOT use the top-level `state.knownCivilizations` field, which may be global rather than per-civ.

**Information scope:** Only show resources for civs the current player has met. Use `getCivAvailableResources(state, knownCivId)` to determine what each met civ has. Note: calling `getCivAvailableResources` on AI civs reveals their full resource inventory to the human player. This is an **intentional design choice** for accessibility — the marketplace functions as a trade broker that knows what's available. In a future iteration this could be gated behind espionage or diplomatic relations depth, but for now full visibility on met civs is acceptable.

Layout per row:
- Resource icon + name
- Which civ has it (civ name, civ colour chip)
- Current diplomatic relationship (score band: Friendly / Neutral / Hostile)
- "Buy Access (N gold / 10 turns)" button — enabled when not at war, score ≥ 0 (matching S5's foreign route threshold), and the player does not already own the resource
- If at war: `"⚔️ Unavailable — at war with [Civ]"`
- If already owned: `"✓ Already have this"`

All buttons via `createGameButton()`. All text via `textContent` / `createTextNode()`. Min-height 44px per button.

#### Emergency import (S9 transaction)

**Available when:** The selling civ is in the current civ's `diplomacy.relationships` map AND `isAtWar` is false AND relationship score ≥ 0 AND `getCivAvailableResources` confirms the civ has the resource AND the current player does not already own it.

**Cost:** 3× `basePrice` from `RESOURCE_DEFINITIONS` (e.g. iron at basePrice 8 → 24 gold), deducted immediately.

**Duration and storage:** 10 turns. Stored in `MarketplaceState`:

```typescript
// Add to MarketplaceState in src/core/types.ts
purchasedResources?: Array<{
  civId: string;          // ← REQUIRED for hot-seat: which civ made the purchase
  resource: ResourceType;
  expiresOnTurn: number;  // = state.turn + 10 at time of purchase
}>;
```

`MarketplaceState.purchasedResources` defaults to `[]` for old saves (optional field).

**Expiry cleanup:** At the START of each civ's turn in the turn-manager, filter out entries where `entry.expiresOnTurn <= state.turn`. Immutable spread-copy.

**Effect integration:** `getCivAvailableResources(state, civId)` gains a **third pass**: check `(state.marketplace?.purchasedResources ?? [])` for entries where `entry.civId === civId && entry.expiresOnTurn > state.turn`. Add matching resources. This ensures purchased resources flow through all downstream consumers (yield bonuses, happiness, S4b unit/building gates).

**Renewal:** Same price — no loyalty discount. Nudges players toward Pillar 2 (outpost) or the settle path for long-term needs.

---

### Pillar 4 — Guidance: "Teach As You Play"

All UI must use `state.currentPlayer` — never hardcoded. All text rendered via `textContent`/`createTextNode()`.

**Session-scoped suppression:** `const SESSION_SHOWN_TIPS = new Set<string>()` declared at module level in `src/ui/advisor-system.ts`. Populated with tip IDs as they fire. Cleared on page load (module re-init). **Hot-seat behaviour:** `SESSION_SHOWN_TIPS` is shared across all players in the same session. If Player 1 sees the "Iron discovered" tip, Player 2 will not see it in the same session even if they discover Iron independently. This is intentional — the tips are tutorial reminders, not per-player notifications. Players who need per-turn per-player information use the notification log, not advisor tips.

> **S4b override:** S4b (`docs/superpowers/specs/2026-05-24-marketplace-s4b-strategic-prerequisites-design.md`) specifies "No click action on locked items — Locked items are non-interactive." This spec supersedes that rule for one targeted affordance: a 📍 button is added to the **locked-section header** (not individual item rows). Individual locked item rows remain non-interactive per S4b.

#### Advisor tip — resources exist (turn 3)

Fires at the start of turn 3 if `SESSION_SHOWN_TIPS` does not contain `'resources-intro'` and the player has not yet acquired any resource.

> "Special resources are scattered across the world — Iron, Silk, Ivory, and more. Each unlocks powerful units and buildings. Explore to find them!"

Adds `'resources-intro'` to `SESSION_SHOWN_TIPS`.

#### Advisor tip — resource discovered

Fires when fog lifts (`'unexplored'` → `'visible'`/`'fog'`) and reveals a tile where `tile.resource !== null`. Tip ID: `'resource-discovered-' + tile.resource`. Does not fire for tiles that transition from `'fog'` to `'visible'` (already seen).

- **Tech already researched:** Explorer advisor: *"We've spotted [icon] [Resource] to the [direction]! Build a [improvement name] there to claim it — or send an Expedition to plant a flag!"*
- **Tech not yet researched:** *"Scouts report an unknown deposit nearby. Our scholars say we'd need [Tech Name] to make use of it."*

**Direction calculation:** compute `dq = tile.q - capital.q`, `dr = tile.r - capital.r` using the first city in `civ.cities` as the reference point. Map to one of 8 compass directions using standard axial-to-compass conversion (prefer the dominant axis; diagonal when |dq| ≈ |dr|). **Edge case:** if `civ.cities` is empty (all cities lost), omit the direction clause entirely — emit *"We've spotted [icon] [Resource]!"*

#### Advisor tip — locked item frustration

Fires when the city panel has been open for 5+ seconds (wall-clock `setTimeout`, not game turns) with a locked section visible and no build item tapped. Tip ID: `'locked-frustration-' + resourceId` (fires once per resource per session).

> "To unlock [Unit/Building], we need [Resource]. Tap 📍 to find the nearest deposit."

**Critical:** the `setTimeout` handle must be stored and cancelled (`clearTimeout`) in the city panel's close handler. If the panel closes before 5 seconds, the timeout must not fire.

#### "Show me" hex highlight — locked section button

A `📍 Find missing resources` button added to the **locked-section header** (not per-row). Constructed via `createGameButton('📍 Find missing resources', 'ghost')`. Uses `state.currentPlayer`.

When tapped:
1. Close the city panel.
2. For each missing resource type in the locked section, find the nearest tile in `state.map.tiles` where `tile.resource === resourceId` AND the tile's `VisibilityState` for `state.currentPlayer` is `'visible'` or `'fog'` (not `'unexplored'`).
3. **Implementation of the highlight:** call `renderLoop.setHighlights([...])` with the found tile coordinates using `'reachable'` (or a new `'waypoint'` highlight style if one is added). This reuses the existing hex highlight system (`buildSelectedUnitHighlights` → `renderLoop.setHighlights`). Do NOT invent a new overlay mechanism — use what exists. If multiple resources are missing, add all their nearest tiles to the highlight array.
4. Show a small DOM toast notification (via the existing notification system, not a new DOM element): *"[Resource] is at [direction]. To claim it: expand your city + build a [Improvement], OR send an Expedition, OR buy access from a known civ (mid-game)."*

If no tile for a resource has ever been seen: notification says *"No [Resource] spotted yet — keep exploring!"*

#### Improved locked-item reason text

Replace the existing terse hint per locked item (e.g. *"Iron (Mine on an Iron tile)"*) with dynamic text generated at panel-render time (not hardcoded HTML):

```
To get Iron:
  • Expand your city to an Iron tile and build a Mine
  • Send an Expedition to plant an Outpost on a distant Iron tile
  [• Buy access from a known civilization (requires Trade Routes tech)]
```

The third bullet is only appended when `civ.techState.completed.includes('trade-routes')` — checked at panel-render time, not hardcoded. All lines rendered via `textContent`/`createTextNode()`.

---

## Sprites and Animations

Two new visual elements require sprite work: the **Expedition unit** and the **Resource Outpost** improvement. Both follow a two-phase approach: ship with emoji fallbacks immediately (non-blocking), then replace with proper SVG sprites designed in Claude Design as the final implementation step.

### Expedition unit — emoji fallback (Phase 1)

The sprite catalog test (`tests/renderer/sprites/sprite-catalog.test.ts`) enforces that every `UnitType` has an entry in both `UNIT_SPRITE_CATALOG` and `UNIT_MOTION_STYLES`. These are TypeScript exhaustive records — failing to add them is a compile error AND a test failure. Both entries must ship in the same PR that adds `'expedition'` to the `UnitType` union.

| Artifact | Value |
|----------|-------|
| `PRODUCTION_ICONS['expedition']` | `'🧭'` — compass; confirmed not used by any existing unit or building |
| `UNIT_MOTION_STYLES['expedition']` | `'humanoid'` |
| `UNIT_SPRITE_CATALOG['expedition']` | `withMotion('expedition', ScoutSprite)` — explorer civilian fallback; comment: `// uses explorer fallback; dedicated sprite TBD via Claude Design` |

### Resource Outpost improvement — emoji fallback (Phase 1)

Improvements render via `IMPROVEMENT_ICONS` in `src/renderer/hex-renderer.ts`. The existing `drawHex` improvement path uses `IMPROVEMENT_ICONS[tile.improvement] ?? '◆'`.

| Artifact | Value |
|----------|-------|
| `IMPROVEMENT_ICONS['resource_outpost']` | `'🚩'` — flag/banner; confirmed not used by any existing improvement |

In-progress outpost (while `improvementTurnsLeft > 0`): existing under-construction renderer shows the countdown. No emoji drawn until `improvementTurnsLeft === 0`.

### Expedition unit — full SVG sprite (Phase 2, Claude Design)

**Implement last, after all Expedition wiring is complete and tested.**

1. Use Claude Design to produce an SVG JSX component.
2. Add to `src/renderer/sprites/units.tsx`.
3. Replace `ScoutSprite` fallback in `UNIT_SPRITE_CATALOG` with `withMotion('expedition', ExpeditionSprite)`.
4. `UNIT_MOTION_STYLES` entry (`'humanoid'`) stays unchanged.

**Visual direction:**
- Rugged wilderness explorer — heavy pack on back, rolled map or compass in hand, wide-brimmed hat or hood.
- Lighter build and less armour than a Warrior or Scout; built for distance travel, not combat. No weapons visible.
- Civ faction palette applied to clothing/cloak.
- Walking pose suggesting purposeful forward movement; leaning slightly into a step.
- Distinct from Scout (lighter recon unit) — more of a mountain-climber / surveyor archetype.

### Resource Outpost improvement — full SVG sprite (Phase 2, Claude Design)

**Implement last, after Expedition Phase 2 is complete.**

The improvement sprite system currently renders improvements as emoji only (`IMPROVEMENT_ICONS`). A dedicated SVG improvement render path in `hex-renderer.ts` may be needed (scope during implementation — follow the building sprite pattern if the improvement sprite system is generalised).

**Visual direction:**
- Short wooden post planted in the ground, topped with a small flag/banner in the civ's primary colour.
- The resource type's icon subtly incorporated — painted on the flag or as a tag hanging from the post.
- Rough and temporary-looking (an outpost, not a permanent structure). Small footprint — tile's resource icon and terrain should still read clearly.
- Should convey ownership (civ colour) and temporariness.

---

## Test Coverage

Tests must accompany each pillar in the implementing PR. The sprite catalog test already enforces icon/sprite coverage — no duplicate test needed for that.

| Test | File | Pillar |
|------|------|--------|
| `guaranteeStartResources`: luxury within radius 5 of each start (positive) | `tests/systems/map-generator.test.ts` | 1 |
| `guaranteeStartResources`: strategic within radius 5 of each start (positive) | `tests/systems/map-generator.test.ts` | 1 |
| `guaranteeStartResources`: no overwrite of existing resource | `tests/systems/map-generator.test.ts` | 1 |
| `guaranteeStartResources`: same seed → same result (determinism) | `tests/systems/map-generator.test.ts` | 1 |
| `guaranteeStartResources`: no eligible terrain within radius 5 → no crash, no infinite loop | `tests/systems/map-generator.test.ts` | 1 |
| `getSettlerProductionCost(1)` === 16 (regression update from 24) | `tests/systems/city-system.test.ts` | 1 |
| `getSettlerProductionCost(2)` === 24 (regression update from 32) | `tests/systems/city-system.test.ts` | 1 |
| `'expedition'` in `UnitType` union; `UNIT_DEFINITIONS` + `UNIT_DESCRIPTIONS` entries present | `tests/systems/unit-system.test.ts` | 2 |
| `PRODUCTION_ICONS['expedition']` present | `tests/systems/city-system.test.ts` | 2 |
| Expedition trainable with `foraging` tech; not trainable without | `tests/systems/city-system.test.ts` | 2 |
| `performEstablishOutpost`: sets `tile.improvement = 'resource_outpost'`, `tile.improvementTurnsLeft = 2`, `tile.owner = civId`; removes unit | `tests/systems/resource-acquisition-system.test.ts` | 2 |
| `performEstablishOutpost`: action unavailable when tile already in civ's city territory | `tests/systems/resource-acquisition-system.test.ts` | 2 |
| `performEstablishOutpost`: action unavailable when tile has no resource | `tests/systems/resource-acquisition-system.test.ts` | 2 |
| `performEstablishOutpost`: action unavailable when civ lacks the enabling tech | `tests/systems/resource-acquisition-system.test.ts` | 2 |
| `getCivAvailableResources`: outpost in-progress (`improvementTurnsLeft > 0`) → resource NOT granted | `tests/systems/resource-acquisition-system.test.ts` | 2 |
| `getCivAvailableResources`: outpost complete → resource granted (outside city territory) | `tests/systems/resource-acquisition-system.test.ts` | 2 |
| `getCivAvailableResources`: outpost pillaged (`tile.improvement = 'none'`) → resource revoked | `tests/systems/resource-acquisition-system.test.ts` | 2 |
| `getCivAvailableResources`: outpost owned by different civ → NOT granted to querying civ | `tests/systems/resource-acquisition-system.test.ts` | 2 |
| Outpost upkeep deducted from owning civ's gold each turn | `tests/core/turn-manager.test.ts` | 2 |
| AI trains Expedition when conditions met; actor-complete | `tests/ai/basic-ai.test.ts` | 2 |
| `purchasedResources` with matching `civId` → resource granted to that civ | `tests/systems/resource-acquisition-system.test.ts` | 3 |
| `purchasedResources` with different `civId` → NOT granted to querying civ (hot-seat isolation) | `tests/systems/resource-acquisition-system.test.ts` | 3 |
| `purchasedResources` expired (`expiresOnTurn <= state.turn`) → resource NOT granted | `tests/systems/resource-acquisition-system.test.ts` | 3 |
| Emergency import deducts gold immediately; `expiresOnTurn = state.turn + 10` | `tests/systems/trade-system.test.ts` | 3 |
| Emergency import blocked when at war | `tests/systems/trade-system.test.ts` | 3 |
| Emergency import blocked when civ not in `diplomacy.relationships` | `tests/systems/trade-system.test.ts` | 3 |
| Old save with no `purchasedResources` field loads without error; defaults to `[]` | `tests/storage/save-migration.test.ts` | 3 |
| `SESSION_SHOWN_TIPS` prevents duplicate tip fire in same module lifecycle | `tests/ui/advisor-system.test.ts` | 4 |

---

## What This Preserves

- Resources remain special — every path requires real investment (turns, gold, expedition risk, or diplomatic relationship).
- Adults still optimize toward the permanent settle path for efficiency.
- The 12-year-old has three interesting strategic choices per resource.
- The 10-year-old has an exciting expedition quest.
- The 7-year-old has a short visible path to the unit they want (outpost + cheaper settlers + closer resources).
- War has a real cost: purchased resource access is blocked at war; outposts can be pillaged.
- Map seeds remain reproducible (guarantee pass uses seeded RNG).
- The S5–S12 trade roadmap is unaffected — trade routes remain gold-income mechanisms.
- All turn-manager additions follow the immutable spread-copy rule.

## Sequencing

1. **Pillar 1** (map gen + settler cost) — no dependencies; ship first.
2. **Pillar 2** (expedition + outpost, emoji sprites) — no dependencies; can ship alongside Pillar 1.
3. **Pillar 4 partial** (advisor tips) — no dependencies; can ship with Pillars 1–2.
4. **Pillar 4 full** (locked-section button + tooltip) — depends on S4b being implemented.
5. **Pillar 3** (diplomatic marketplace) — depends on S5 (trade routes established) and S9 being implemented.
6. **Expedition SVG sprite** (Phase 2) — depends on Pillar 2 fully implemented and tested. Replace `ScoutSprite` fallback with `ExpeditionSprite` via Claude Design session.
7. **Resource Outpost SVG sprite** (Phase 2) — depends on step 6. Replace 🚩 emoji via Claude Design session.

## Out of Scope

- Outpost garrisoning or defense upgrades (possible future).
- Selling surplus resources (S8 in the trade roadmap).
- Barter resource-for-resource (S10 in the trade roadmap).
- Tech that removes the improvement requirement (deferred — the outpost path already provides an alternative acquisition route).
- Naval expeditions (an expedition unit with `domain: 'naval'` — deferred until S7 naval trader work creates the pattern).
- Outpost auto-demolish on sustained gold deficit (deferred — follows existing treasury-strain mechanics for now).
