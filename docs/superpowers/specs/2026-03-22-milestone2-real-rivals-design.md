# Milestone 2: "Real Rivals" — Design Specification

**Goal:** Transform Conquestoria from a basic prototype into a deep civilization-building game with expanded tech, rich terrain, city management, rival civilizations with diplomacy, a dynamic economy, and polished audio/UX.

**Delivery:** Three sub-milestones, each deployable independently, delivering cohesive play experience upgrades.

**Priority order:** Tech tree → City interior → Terrain/rivers → Civilizations → Diplomacy → Trade → Music → Advisors → Multiple saves

---

## Sub-Milestone Overview

| Sub-milestone | Theme | Key Features |
|---|---|---|
| **M2a** | Deeper World | Expanded tech tree (5×8), new terrain + rivers, city interior grid |
| **M2b** | Real Rivals | 6 playable civs, full diplomacy, AI personality overhaul |
| **M2c** | Living Economy | Dynamic trade/marketplace, era music, advisors, multiple saves |

---

## M2a — "Deeper World"

### 1. Expanded Tech Tree

**Current state:** 3 tracks (military, economy, science) × 5 techs = 15 total.

**Target:** 5 tracks × ~8 techs = ~40 total, spanning eras 1-5 (Tribal → Classical).

**New tracks:**
- **Civics** — government, law, diplomacy. Unlocks: government types, diplomatic actions, happiness buildings. Prepares for M2b diplomacy.
- **Exploration** — movement, vision, cartography. Unlocks: movement bonuses, vision range, map reveals, naval units.

**Expanded existing tracks (5 → 8 techs each):**
- **Military** — add: Horseback Riding (mounted units), Siege Warfare (catapults), Steel Working, Tactics
- **Economy** — add: Irrigation (farm bonus), Trade Routes (prepares for M2c), Banking, Coinage
- **Science** — add: Astronomy, Medicine, Philosophy

**Era progression:** Each era unlocks ~2 techs per track. Cross-track prerequisites supported (e.g., "Iron Forging" requires "Advanced Mining" from economy track).

**Type changes:**
- `TechTrack` type expands: `'military' | 'economy' | 'science' | 'civics' | 'exploration'`
- `Tech` interface gains cross-track `prerequisites` support
- `TECH_TREE` array grows from 15 → ~40 entries

**Files affected:**
- Modify: `src/core/types.ts` — expand TechTrack type
- Modify: `src/systems/tech-system.ts` — expand TECH_TREE, update getAvailableTechs for cross-track prereqs
- Modify: `src/ui/tech-panel.ts` — render 5 columns instead of 3
- Update tests: `tests/systems/tech-system.test.ts`

### 2. New Terrain & Rivers

**New terrain types:**
- **Jungle** — high food (2F), low production. Generated in hot+wet zones (high temp + high moisture). Vision penalty: units see 1 fewer hex.
- **Swamp** — low yields (1F), high movement cost (2 MP). Generated in low-elevation wet areas near coasts. Drainable with tech unlock.
- **Volcanic** — no yields initially (0F 0P), very high production when mined (3P). Rare, spawns near mountain clusters.

**Rivers:**
- Rivers run along hex *edges*, not on tiles. A hex can have 0-3 river edges.
- Generated via water flow simulation: start at mountains/hills, flow downhill toward coast/ocean.
- **Effects:**
  - +1 gold to tiles with river edges
  - +1 food to farms on river tiles
  - Defense bonus when enemy attacks across a river
  - Fresh water enables certain buildings (e.g., Aqueduct)
- **Storage:** `GameMap.rivers: Array<{ from: HexCoord; to: HexCoord }>` — pairs of adjacent hexes sharing a river edge. `HexTile.hasRiver: boolean` for quick lookup.
- **Rendering:** Blue lines along hex edges in the renderer.

**Type changes:**
- `TerrainType` adds: `'jungle' | 'swamp' | 'volcanic'`
- `GameMap` adds: `rivers: Array<{ from: HexCoord; to: HexCoord }>`
- `HexTile` adds: `hasRiver: boolean`

**Yield additions in resource-system:**
- Jungle: 2F 0P 0G 0S
- Swamp: 1F 0P 0G 0S
- Volcanic: 0F 0P 0G 0S (3P when mined)
- River adjacency: +1G to tile, +1F to farms on river tiles

**Files affected:**
- Modify: `src/core/types.ts` — new terrain types, river fields
- Modify: `src/systems/map-generator.ts` — jungle/swamp/volcanic generation, river generation pass
- Create: `src/systems/river-system.ts` — river generation algorithm, river yield/combat modifiers
- Modify: `src/systems/resource-system.ts` — new terrain yields, river bonuses
- Modify: `src/systems/fog-of-war.ts` — jungle/forest vision penalty
- Modify: `src/systems/combat-system.ts` — river crossing attack penalty
- Modify: `src/systems/improvement-system.ts` — valid terrains for new types
- Modify: `src/renderer/hex-renderer.ts` — new terrain colors, river edge rendering
- Create tests: `tests/systems/river-system.test.ts`
- Update tests: map-generator, resource-system, combat-system

### 3. City Interior View

**Grid structure:**
- Each city has a 5×5 grid (25 slots). Starts with center 3×3 unlocked (9 slots). More unlock with population: pop 3 → 4×4 (16 slots), pop 6 → 5×5 (25 slots).
- **Early purchase:** Player can spend gold to unlock the next ring before hitting population threshold. Cost: 4×4 = 50 gold, 5×5 = 150 gold.
- Center slot is always City Center (auto-placed on founding).
- Edge slots show the terrain type and base yields of the corresponding owned hex tile, teaching the player about resource bonuses.
- Inner slots (not on edge) show "Urban" terrain with base +1P.

**Adjacency bonuses:**
- Buildings get yield bonuses when placed next to compatible buildings. Examples:
  - Library next to Temple → +2 science
  - Marketplace next to Workshop → +1 gold, +1 production
  - Granary next to farm-terrain edge slot → +1 food
  - Barracks next to Walls → +1 defense
- Bonuses are flat yield additions, calculated on placement or rearrangement.

**Auto-suggest placement:**
- When player selects a building to construct, the game highlights the optimal slot (maximizing adjacency bonuses) with a gold pulsing outline.
- Player can accept (one tap) or tap a different slot to override.
- AI always uses optimal placement.

**Expanded buildings (7 → ~20):**

Current 7 remain: Granary, Workshop, Library, Marketplace, Barracks, Temple, Herbalist.

New buildings (unlocked by techs):
- **Production:** Forge, Lumbermill, Quarry
- **Food:** Aqueduct (requires river)
- **Science:** Archive, Observatory
- **Economy:** Harbor (requires coast)
- **Military:** Walls, Stable
- **Culture:** Forum, Monument, Amphitheater, Shrine

**Building categories:**
- Production: Workshop, Forge, Lumbermill, Quarry
- Food: Granary, Aqueduct, Herbalist
- Science: Library, Archive, Observatory
- Economy: Marketplace, Harbor
- Military: Barracks, Stable, Walls
- Culture: Temple, Amphitheater, Monument, Shrine, Forum

**Type changes:**
- `City` adds: `grid: (string | null)[][]` (5×5), `gridSize: number` (3, 4, or 5)

**Files affected:**
- Modify: `src/core/types.ts` — city grid fields
- Create: `src/systems/adjacency-system.ts` — adjacency bonus definitions and calculation
- Create: `src/ui/city-grid.ts` — DOM-based grid view
- Modify: `src/systems/city-system.ts` — initialize grid on founding, expand BUILDINGS, grid slot unlocking/purchasing
- Modify: `src/systems/resource-system.ts` — include adjacency bonuses in yield calculation
- Modify: `src/ui/city-panel.ts` — add grid view tab
- Create tests: `tests/systems/adjacency-system.test.ts`
- Update tests: city-system, resource-system

---

## M2b — "Real Rivals"

### 4. Civilizations & Unique Bonuses

**6 playable civilizations:**

| Civ | Bonus Name | Effect |
|---|---|---|
| Egypt | Master Builders | Wonders (Monument, Amphitheater) build 30% faster |
| Rome | Roman Roads | Roads auto-built between cities (free movement bonus) |
| Greece | Diplomatic Influence | Relationship scores with AI start at +20 |
| Mongolia | Horse Lords | Mounted units get +1 movement point |
| Babylon | Cradle of Knowledge | Free tech when entering a new era |
| Zulu | Rapid Mobilization | Military units train 25% faster |

**Civ colors:** Egypt gold (#c4a94d), Rome red (#d94a4a), Greece blue (#4a90d9), Mongolia green (#4a9b4a), Babylon purple (#9b4ad9), Zulu orange (#d9944a).

**Implementation:**
- New `CivDefinition` type: `id`, `name`, `color`, `bonusName`, `bonusDescription`, `bonusEffect`, `personality`
- Bonus effects applied in existing systems via checks (e.g., `processCity` checks `faster_wonders`)
- `Civilization` type gains `civType: string` referencing the definition

**Files affected:**
- Create: `src/systems/civ-definitions.ts` — defines the 6 civs
- Modify: `src/core/types.ts` — add civType to Civilization, CivDefinition interface
- Modify: `src/systems/city-system.ts` — apply building speed bonuses
- Modify: `src/systems/unit-system.ts` — apply movement/training bonuses
- Modify: `src/core/game-state.ts` — accept civType parameter
- Create tests: `tests/systems/civ-definitions.test.ts`

### 5. Civ Selection Screen

- Full-screen panel shown on app start when no auto-save exists
- 6 civ cards in 2×3 grid (mobile) or 3×2 (desktop)
- Each card: civ color bar, name, bonus name, bonus description, personality tags
- Selected card gets gold border
- "Start Game" button (disabled until selection), optional "Random" button
- AI randomly picks from remaining 5 civs

**Files affected:**
- Create: `src/ui/civ-select.ts` — civ selection panel
- Modify: `src/main.ts` — show civ select on new game, pass civType to createNewGame

### 6. Diplomacy System

**Relationship model:**
- Asymmetric scores per civ pair, range -100 to +100
- Start at 0 (Greece starts at +20 with all civs)
- Score shifts:
  - Declare war: -50
  - Make peace: +10
  - Trade deal: +5 per deal
  - Break treaty: -30
  - Peaceful neighbors: +1/turn (cap +30)
  - Units near borders: -2/turn

**Diplomatic actions (unlocked by era/tech):**
- Always: Declare War, Request Peace
- Bronze Age or Civics tech: Non-Aggression Pact (10 turns, breaking = -40 with all civs)
- Iron Age or Trade Routes tech: Trade Agreement (+2 gold/turn each, requires relationship > 0)
- Classical or Alliance tech: Open Borders, Alliance (shared vision + defensive pact)

**AI memory:**
- `DiplomaticEvent` records: `{ type, turn, otherCiv, weight }`
- Events decay: lose weight after 20 turns, never fully forgotten
- AI references memory when evaluating proposals

**AI personalities (per civ):**
- Egypt: diplomatic, expansionist
- Rome: aggressive, expansionist
- Greece: diplomatic, trader
- Mongolia: aggressive
- Babylon: diplomatic
- Zulu: aggressive

Traits weight all diplomatic decisions.

**Diplomacy UI:**
- Panel opened from bottom bar
- Shows known civs with relationship bar (red→yellow→green)
- Tap civ → relationship history, available actions, active treaties
- AI proposals appear as notifications with Accept/Reject

**Files affected:**
- Create: `src/systems/diplomacy-system.ts` — relationships, actions, events, treaty management
- Create: `src/ui/diplomacy-panel.ts` — diplomatic interaction UI
- Modify: `src/core/types.ts` — add relationships, diplomaticEvents, treaties, personality to Civilization
- Modify: `src/main.ts` — add diplomacy button to bottom bar
- New events: `diplomacy:war-declared`, `diplomacy:peace-made`, `diplomacy:treaty-proposed`, `diplomacy:treaty-accepted`, `diplomacy:treaty-broken`
- Create tests: `tests/systems/diplomacy-system.test.ts`

### 7. AI Overhaul

Current AI is a single function with random decisions. M2b restructures into personality-driven modules.

**New AI architecture:**
- `src/ai/ai-personality.ts` — trait definitions, decision weighting
- `src/ai/ai-diplomacy.ts` — diplomatic decision-making
- `src/ai/ai-strategy.ts` — strategic planning (expansion targets, military priorities, tech selection)
- `src/ai/basic-ai.ts` — orchestrator calling the above per turn

**Behavior improvements:**
- Tech selection weighted by personality (aggressive → military, diplomatic → civics)
- City production based on needs (military when threatened, economy when safe)
- Settlers sent toward good locations rather than founding immediately
- Military units coordinate rather than wandering randomly

**Files affected:**
- Create: `src/ai/ai-personality.ts`
- Create: `src/ai/ai-diplomacy.ts`
- Create: `src/ai/ai-strategy.ts`
- Modify: `src/ai/basic-ai.ts` — refactor into orchestrator
- Update tests: `tests/ai/basic-ai.test.ts`

---

## M2c — "Living Economy"

### 8. Trade System & Dynamic Marketplace

**Resources on the map:**

Luxury resources (provide happiness when traded/owned):
- Silk (grassland), Wine (plains), Spices (jungle), Gems (hills), Ivory (forest), Incense (desert)

Strategic resources (required for units/buildings):
- Copper (hills — Bronze units), Iron (hills — Iron-era units), Horses (plains — mounted units), Stone (mountain-adjacent — wonders)

Resources revealed when relevant tech is researched.

**Dynamic marketplace:**
- Each resource has a base price fluctuating via `basePrice * (demand / supply)` with dampening
- 60%+ control of a resource → monopoly pricing (2× base)
- Price history tracked (last 20 turns) for sparkline graphs
- Fashion cycles: every 15-25 turns, random luxury gets 2× demand for 10 turns

**Trade routes:**
- Cities send caravans to other cities (own or foreign) for gold/turn
- Route value based on distance + resource diversity
- Requires "Trade Routes" tech
- Max 1 route per city, +1 per Marketplace building
- Foreign routes also generate +relationship with that civ

**Trade UI:**
- Marketplace panel from bottom bar
- Shows: resource inventory, prices with sparklines, active routes
- Trade proposals embedded in diplomacy panel

**Type changes:**
- `GameState` adds: `marketplace: { prices, history, fashionable, fashionTurnsLeft }`
- `HexTile.resource` field (exists but unused) gets populated

**Files affected:**
- Create: `src/systems/trade-system.ts` — pricing, routes, monopoly detection
- Create: `src/ui/marketplace-panel.ts` — resource prices, routes, sparklines
- Modify: `src/core/types.ts` — marketplace state, resource types
- Modify: `src/systems/map-generator.ts` — place resources on appropriate terrains
- Modify: `src/core/turn-manager.ts` — process trade income, price recalculation
- Modify: `src/ui/diplomacy-panel.ts` — trade proposals
- Create tests: `tests/systems/trade-system.test.ts`

### 9. Era Music (Procedural)

**Scope:** Eras 1-4 (Tribal, Stone, Bronze, Iron) get 2-3 ambient tracks each.

**Approach:** Procedurally generated using Web Audio API — no audio files needed, keeps app lightweight and offline-friendly.

**Era palettes:**
- Tribal: sparse percussion, low drones, pentatonic flute melodies
- Stone Age: simple rhythmic patterns, wood sounds, gentle strings
- Bronze Age: fuller orchestration, brass hints, steady drums
- Iron Age: marching rhythms, horn calls, layered melodies

Tracks are 2-3 minute loops that cross-fade on era transition. Later milestones add eras 5-12.

**Files affected:**
- Create: `src/audio/music-generator.ts` — procedural track generation
- Modify: `src/audio/audio-manager.ts` — era-based track rotation, cross-fade
- Modify: `src/main.ts` — trigger music on era change

### 10. Advisors (Chancellor & War Chief)

Two new advisors join the existing Builder and Explorer:

- **Chancellor** — diplomacy/civics. Triggers: hostile civ warnings, alliance opportunities, treaty-breaking reputation warnings
- **War Chief** — military/defense. Triggers: enemy units near borders, military advantage assessments, undefended city warnings

**Implementation:**
- Generalize tutorial system into full advisor framework
- Rename `src/ui/tutorial.ts` → `src/ui/advisor-system.ts`
- Tutorial becomes one "mode" of the advisor system
- Each advisor has condition→message rules checked each turn
- Advisor messages appear as notification slide-downs with advisor icon
- Per-advisor enable/disable in settings

**Files affected:**
- Rename/rewrite: `src/ui/tutorial.ts` → `src/ui/advisor-system.ts`
- Modify: `src/core/types.ts` — advisor settings
- Modify: `src/main.ts` — advisor check each turn
- New event: `advisor:message`

### 11. Multiple Save Slots

**Current state:** Single auto-save key in IndexedDB.

**Target:** Named save slots (max 10) with metadata.

**Save slot metadata:** `{ id, name, civType, turn, lastPlayed: Date }`

**API changes in save-manager.ts:**
- `listSaves()` → returns all slot metadata
- `saveGame(slotId, state)` → save to specific slot
- `loadGame(slotId)` → load from slot
- `deleteGame(slotId)` → delete slot
- `renameGame(slotId, name)` → rename
- Auto-save works per active slot: `autosave-{slotId}`

**Save/Load UI:**
- New panel shown on app start (replaces auto-load)
- Save slots as cards: game name, civ, turn number, last played date
- "New Game" → civ selection → fresh start
- "Continue" prominently shown for most recent save
- Swipe-to-delete or long-press delete on mobile

**Files affected:**
- Modify: `src/storage/save-manager.ts` — multi-slot API
- Modify: `src/storage/db.ts` — support listing keys by prefix
- Create: `src/ui/save-panel.ts` — save/load screen
- Modify: `src/main.ts` — show save panel on start, manage active slot
- Update tests: `tests/storage/save-manager.test.ts`

---

## Backward Compatibility

All new features extend existing interfaces. Old saves remain loadable — missing fields get sensible defaults:
- `city.grid` → null (no grid, legacy mode)
- `civilization.civType` → 'generic' (no bonus)
- `civilization.relationships` → empty record
- `marketplace` → null (no trade system)
- `tile.hasRiver` → false

Migration logic in `loadGame` detects old format and applies defaults.

---

## Testing Strategy

Each sub-milestone includes:
- Unit tests for all new systems (adjacency, rivers, diplomacy, trade, civ bonuses)
- Updated tests for modified systems (tech, map-generator, combat, resource, city)
- Integration test: full game loop with new features

No browser-dependent tests — all game logic is pure functions testable in Node/vitest.

---

## File Summary

**New files (M2a):**
- `src/systems/adjacency-system.ts`
- `src/systems/river-system.ts`
- `src/ui/city-grid.ts`
- `tests/systems/adjacency-system.test.ts`
- `tests/systems/river-system.test.ts`

**New files (M2b):**
- `src/systems/civ-definitions.ts`
- `src/systems/diplomacy-system.ts`
- `src/ui/civ-select.ts`
- `src/ui/diplomacy-panel.ts`
- `src/ai/ai-personality.ts`
- `src/ai/ai-diplomacy.ts`
- `src/ai/ai-strategy.ts`
- `tests/systems/civ-definitions.test.ts`
- `tests/systems/diplomacy-system.test.ts`

**New files (M2c):**
- `src/systems/trade-system.ts`
- `src/ui/marketplace-panel.ts`
- `src/ui/save-panel.ts`
- `src/ui/advisor-system.ts` (renamed from tutorial.ts)
- `src/audio/music-generator.ts`
- `tests/systems/trade-system.test.ts`

**Modified files (across all sub-milestones):**
- `src/core/types.ts`
- `src/core/game-state.ts`
- `src/core/turn-manager.ts`
- `src/systems/tech-system.ts`
- `src/systems/map-generator.ts`
- `src/systems/city-system.ts`
- `src/systems/resource-system.ts`
- `src/systems/combat-system.ts`
- `src/systems/fog-of-war.ts`
- `src/systems/improvement-system.ts`
- `src/ai/basic-ai.ts`
- `src/renderer/hex-renderer.ts`
- `src/ui/tech-panel.ts`
- `src/ui/city-panel.ts`
- `src/audio/audio-manager.ts`
- `src/storage/save-manager.ts`
- `src/storage/db.ts`
- `src/main.ts`
