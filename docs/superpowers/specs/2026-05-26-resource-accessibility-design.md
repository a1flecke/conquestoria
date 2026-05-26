# Resource Accessibility Design

**Date:** 2026-05-26
**Problem:** Kids (ages 7, 10, 12) — and occasionally adults — find special resources too hard to reach and don't understand how to go get them. Three distinct pain points: mechanics opacity (don't know the path), hope drain (journey takes too long), motivation gap (reward feels too decoupled from effort).
**Goal:** Multi-faceted solution that preserves the specialness and strategic weight of resources while making them legible, reachable, and exciting for the full family age range. Do not overcorrect into triviality.

---

## Relationship to the Marketplace Trade Roadmap

The marketplace trade roadmap (`docs/superpowers/specs/2026-05-20-marketplace-trade-roadmap.md`) is the authoritative spec for the S1–S12 trade slice sequence. This spec does NOT replace or reorder that work. Instead:

| This spec's pillar | Trade roadmap relationship |
|---|---|
| Pillar 1 — Map gen + settler cost | Independent. No overlap. Can ship before S5. |
| Pillar 2 — Expedition + Outpost | Independent. New unit type, distinct from the Caravan (S5). Can ship alongside S5. |
| Pillar 3 — Diplomatic Marketplace | Depends on S5 (trade routes established) and **accelerates S9** (buy resource for gold). The "Available from Known Civs" section IS the S9 discovery UI, and the emergency import IS S9's transaction. This pillar should be designed as the S9 implementation rather than as a new parallel system. |
| Pillar 4 — Guidance | Partially independent. The "Show me" waypoint and advisor tips can ship any time. The locked-item tooltip improvements depend on S4b (already approved, awaiting implementation). See S4b override note below. |

---

## The Four Pillars

### Pillar 1 — Foundation Fixes: "Closer and Cheaper"

Root-cause changes to map generation and settler cost. All other pillars assume these are in place. These are **early-game** fixes — they help the 7-year-old who hasn't yet met another civ or researched the trade-routes tech.

#### Map generation

**Change 1 — Higher base probability:**
- Raise `DEFAULT_RESOURCE_PROBABILITY` in `src/systems/map-generator.ts` from `0.15` → `0.20`.

**Change 2 — Start-area resource guarantee:**
- Add a new exported function `guaranteeStartResources(map: GameMap, startPositions: HexCoord[], rng: () => number): void` in `src/systems/map-generator.ts`.
- For each starting position, scan tiles within hex distance 5.
- If no luxury resource exists in that radius, force-place one on the nearest eligible terrain tile (closest by hex distance; ties broken by `rng()` draw; never overwriting an existing resource).
- Repeat for strategic resources.
- Tiles at radius 0–1 count toward the guarantee — no wasted placement if the civ already has one close.
- **Caller:** `src/core/game-state.ts`, called AFTER `findStartPositions()` returns and BEFORE civs are placed, using a seeded RNG derived from `gameSeed + '-resource-guarantee'`. `generateMap()` itself is not changed — it does not have access to civ positions.

#### Settler cost

Current `SETTLER_COST_BY_ERA` in `src/systems/city-system.ts`:

| Era | Current | New |
|-----|---------|-----|
| 1   | 24      | 16  |
| 2   | 32      | 24  |
| 3   | 40      | 40  |
| 4   | 48      | 48  |
| 5   | 56      | 56  |

Eras 1–2 reduced by one-third. Era 3+ unchanged — by mid-game momentum carries players past the cost barrier.

---

### Pillar 2 — Expedition + Resource Outpost: "Plant Your Flag"

A new unit and structure providing the adventurous middle path. Solves hope drain for mountain/hill resources. **Early-game** feature — accessible from the foraging era.

> **Not to be confused with the Caravan unit (S5).** The Caravan establishes gold-income trade routes between cities. The Expedition claims individual resource tiles by building a physical outpost. Completely separate units, separate mechanics.

#### Expedition unit

All 6 mandatory end-to-end wirings per `.claude/rules/end-to-end-wiring.md` are required.

| Property | Value |
|----------|-------|
| Type ID | `'expedition'` |
| Icon / PRODUCTION_ICONS | 🧭 |
| Production cost | 18 |
| Movement | 3 |
| Terrain penalty | None — moves through hills and mountains at full speed |
| Combat strength | 0 — destroyed by any enemy unit that moves onto its tile |
| Tech required | `'foraging'` |
| Domain | `'land'` |

The Expedition's identity is speed and reach, not fighting. It goes where settlers can't easily go.

#### "Establish Outpost" action

- Available when: Expedition stands on a tile that has a `resource` AND the civ has researched the tech that reveals that resource (per `RESOURCE_DEFINITIONS[resource].tech`).
- Takes 2 turns (progress shown via `improvementTurnsLeft`, identical pattern to worker improvement construction).
- The Expedition unit is consumed and replaced by the Resource Outpost structure on completion.
- Implemented as a special worker-like action, NOT as the improvement system's worker action — the Expedition consumes itself rather than surviving.

#### Resource Outpost — data model

An outpost is stored as a tile improvement. When established:
- `tile.improvement = 'resource_outpost'`
- `tile.improvementTurnsLeft = 2` (counts down like any improvement)
- `tile.owner = civId`

This requires adding `'resource_outpost'` to the `ImprovementType` union in `src/core/types.ts`.

> **Name collision note:** `CityMaturity` already uses the string value `'outpost'` for immature cities. The improvement is named `'resource_outpost'` (with underscore prefix) to avoid any collision. These are entirely unrelated concepts.

`getCivAvailableResources` in `src/systems/resource-acquisition-system.ts` must be extended with a second pass: after scanning city-owned tiles (current logic), scan ALL map tiles for entries where `tile.improvement === 'resource_outpost' && tile.owner === civId && tile.improvementTurnsLeft === 0`, apply the same tech check, and add matching resources to the result set. This is the only change needed — all downstream consumers (`getCivResourceYieldBonus`, `getCivHappinessFromResources`, S4b's `getTrainableUnitsForCiv` resource gating) automatically benefit.

#### Resource Outpost — runtime behaviour

| Property | Value |
|----------|-------|
| Effect | Full resource effect once `improvementTurnsLeft === 0` — via the extended `getCivAvailableResources` above |
| Upkeep | 2 gold/turn. Deducted in the turn manager's per-civ gold processing pass by scanning map tiles for `tile.improvement === 'resource_outpost' && tile.owner === civId`. No new GameState field needed. |
| Pillage | Any enemy unit moving onto the tile removes the improvement (`tile.improvement = 'none'`, `tile.owner = null`) using the existing improvement-pillage path. |
| Visibility | Outpost improvement renders like any other improvement — already visible to all players via the map renderer. |
| Conversion | If the owning civ founds a city whose starting tile IS the outpost tile, or if city territory later expands to include the outpost tile, the outpost tile's `tile.owner` is already set correctly and `getCivAvailableResources` city-territory pass will pick it up. At that point the tile is also within city territory so the resource is owned via both paths — de-duplication is handled naturally by the `Set<ResourceType>` return type. |
| Tech loss | If the enabling tech is somehow lost (not currently possible but future-proof), `getCivAvailableResources`'s tech check on the outpost pass suppresses the resource automatically. |

**Strategic texture:** Adults face a real choice — pay 2 gold/turn indefinitely vs. spend turns to settle. For a resource 8 hexes away through mountains, the outpost wins. For a resource 3 hexes into friendly flatlands, settling wins. The outpost being pillage-able naturally nudges players toward "maybe I should settle there eventually."

**Age 7 experience:** "Send my fast explorer, wait 2 turns, get iron, now I can build swordsmen." Concrete, exciting, short.

---

### Pillar 3 — Diplomatic Marketplace: "Make Friends, Get Stuff"

**This is a mid-game feature.** Trade routes require the `trade-routes` tech (era 4, per S5). Players who haven't reached era 4 should rely on Pillars 1 and 2. This pillar is for 10–12-year-olds and adults who are into the mid-game.

**Implementation note:** This pillar accelerates and implements **S9 from the trade roadmap** ("Buy a resource for gold"). It does NOT add resource-sharing as a side effect of trade routes — trade routes remain purely gold-income mechanisms (per S5/S6). The diplomatic path is: discover a civ that has a resource → buy access to it for gold → its effect applies. The marketplace panel is the discovery and transaction surface.

#### "Available from Known Civs" section in Marketplace panel

New section added to `src/ui/marketplace-panel.ts`:

- Lists resources available from civs in `state.knownCivilizations` (the `string[]` at `GameState` top level) that the current player is not currently at war with.
- Each entry shows: resource icon + name, which civ has it (using `getCivAvailableResources` on each known civ), current diplomatic relationship, and a "Buy Access" button if the player lacks the resource and is not at war.
- If at war with the only civ that has a resource: `"⚔️ Unavailable — at war with [Civ]"` — a visible reminder of the diplomatic cost.
- If no known civs have been met yet: section is hidden (not shown as empty).
- Section only appears once the player has the `trade-routes` tech (same gate as Caravans) — no point surfacing it before it's actionable.

#### Emergency import (S9 transaction)

This IS S9. It is scoped here as a self-contained purchase without a Caravan, using a civ-to-civ relationship gate instead of requiring an active trade route.

- **Available when:** The civ appears in `state.knownCivilizations` AND `isAtWar` is false AND the civ possesses the resource (verified via `getCivAvailableResources`).
- **Cost:** 3× `basePrice` from `RESOURCE_DEFINITIONS` (e.g. iron at basePrice 8 → 24 gold).
- **Duration:** 10 turns, stored as `purchasedResources: Array<{ resource: ResourceType; expiresOnTurn: number }>` added to `MarketplaceState`. The turn manager cleans up entries where `expiresOnTurn <= state.turn` at the start of each turn.
- **Effect:** The purchased resource is included in `getCivAvailableResources` — add a third pass that checks `state.marketplace.purchasedResources` for non-expired entries. All downstream consumers benefit automatically.
- **Renewal:** Same price — no loyalty discount. This nudges players toward Pillar 2 (outpost) or the full settle path for anything they need long-term.
- **Relationship required:** Contact only (not at war). Does NOT require an active Caravan trade route. The trade route system (S5/S6) provides the gold-income benefit; this is a separate diplomatic transaction.
- **Save compatibility:** `purchasedResources` is optional on `MarketplaceState` — old saves default to `[]` at load.

---

### Pillar 4 — Guidance: "Teach As You Play"

Sits on top of all three paths. Makes the mechanics legible without a manual. Every advisor tip uses **session-scoped suppression**: a module-level `const SESSION_SHOWN_TIPS = new Set<string>()` in `src/ui/advisor-system.ts`, populated with tip IDs as they fire. The Set is cleared on page load (module re-init). Kids who play weekly forget between sessions; the advisor resets on each load so they get the reminder every time, while adults see it once per session and move on.

> **S4b override:** S4b (`docs/superpowers/specs/2026-05-24-marketplace-s4b-strategic-prerequisites-design.md`) specifies "No click action on locked items — Locked items are non-interactive." This spec supersedes that rule for one targeted affordance: a section-level 📍 button is added to the locked-section header (not to individual item rows). Individual locked item rows remain non-interactive per S4b. The button is a section-level control, not per-item.

#### Advisor tip — resources exist (turn 3)

Fires at the start of turn 3 if `SESSION_SHOWN_TIPS` does not contain `'resources-intro'` and the player has not yet acquired any resource:

> "Special resources are scattered across the world — Iron, Silk, Ivory, and more. Each unlocks powerful units and buildings. Explore to find them!"

Adds `'resources-intro'` to `SESSION_SHOWN_TIPS` after firing.

#### Advisor tip — resource discovered

Fires when fog lifts and reveals a tile where `tile.resource !== null`. The tip ID is `'resource-discovered-' + tile.resource` (one per resource type per session).

- **Tech already researched for this resource:** Explorer advisor: *"We've spotted [icon] [Resource] to the [direction]! Build a [requiredImprovement name] there to claim it — or send an Expedition to plant a flag!"*
- **Tech not yet researched:** *"Scouts report an unknown deposit nearby. Our scholars say we'd need [Tech Name] to make use of it."*

**Direction calculation:** compute `dq = tile.q - playerStartPos.q`, `dr = tile.r - playerStartPos.r` and map to the nearest of 8 compass directions (N/NE/E/SE/S/SW/W/NW) using standard axial-to-compass conversion. Use the capital city position as the reference point.

Tiles with `VisibilityState` of `'unexplored'` do not trigger this tip — only tiles transitioning to `'visible'` or `'fog'` from `'unexplored'`.

#### Advisor tip — locked item frustration

If a player opens the city panel, the locked section is visible (tech met + resource missing), and the panel remains open for 5+ seconds without the player tapping any build item (wall-clock timer via `setTimeout`, not game turns), the Builder advisor fires once per session per resource type:

> "To unlock [Unit/Building], we need [Resource]. Tap 📍 to find the nearest deposit."

Tip ID: `'locked-frustration-' + resourceId`. Adds to `SESSION_SHOWN_TIPS` after firing.

#### "Show me" waypoint — locked section button

A `📍 Find missing resources` button is added to the **locked section header** in the city panel build list (not per-row — per S4b override note above). Constructed via `createGameButton('📍 Find missing resources', 'ghost')`.

When tapped:
1. Closes the city panel.
2. For each missing resource type in the locked section, finds the nearest tile in `state.map.tiles` where `tile.resource === resourceId` AND the tile's `VisibilityState` is `'visible'` or `'fog'` (not `'unexplored'`) for the current player.
3. Drops a visible waypoint marker on the map for each such tile (if multiple resources are missing, shows all of them).
4. Opens a small persistent tooltip: *"[Resource] is here. To claim it: expand your city + build a [Improvement], OR send an Expedition, OR buy access from a known civ."*

If no tile for a resource has ever been seen: *"No [Resource] spotted yet — keep exploring!"*

#### Improved locked-item reason text

The existing terse hint (e.g. *"Iron (Mine on an Iron tile)"*) is replaced with three lines using `textContent` (XSS-safe):

```
To get Iron:
  • Expand your city to an Iron tile and build a Mine
  • Send an Expedition to plant an Outpost on a distant Iron tile
  • Buy access from a known civilization (mid-game)
```

The third bullet only appears if the player has the `trade-routes` tech — otherwise it's omitted to avoid confusing early-game players with a mechanic they can't use yet.

#### Turn 3 advisor — resources exist

Already covered above. Session-scoped.

---

## What This Preserves

- Resources remain special — every path requires real investment (turns, gold, expedition risk, or diplomatic relationship).
- Adults still optimize toward the permanent settle path for efficiency.
- The 12-year-old has three interesting strategic choices per resource.
- The 10-year-old has an exciting expedition quest.
- The 7-year-old has a short visible path to the unit they want (outpost + earlier settlers + closer resources).
- War has a real cost: purchased resource access is blocked at war; outposts can be pillaged.
- Map seeds remain reproducible (guarantee pass uses seeded RNG).
- The S5–S12 trade roadmap is unaffected — trade routes remain gold-income mechanisms.

## Sequencing

These pillars can be shipped independently:

1. **Pillar 1** (map gen + settler cost) — no dependencies; ship first.
2. **Pillar 2** (expedition + outpost) — no dependencies; can ship alongside Pillar 1.
3. **Pillar 4 partial** (advisor tips, turn-3 tip, resource-discovered tips) — no dependencies; can ship with Pillars 1–2.
4. **Pillar 4 full** (locked-section button + tooltip text) — depends on S4b being implemented.
5. **Pillar 3** (diplomatic marketplace) — depends on S5 (trade routes established) and S9 (buy resource for gold) being implemented.

## Out of Scope

- Outpost garrisoning or defense upgrades (possible future).
- Selling surplus resources (S8 in the trade roadmap).
- Barter resource-for-resource (S10 in the trade roadmap).
- Tech that removes the improvement requirement (deferred — the outpost path already provides an alternative acquisition route).
- Naval expeditions (an expedition unit with `domain: 'naval'` — deferred until S7 naval trader work creates the pattern).
