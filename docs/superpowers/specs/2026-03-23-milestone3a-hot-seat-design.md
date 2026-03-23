# Milestone 3a "Hot Seat" — Design Specification

**Date:** 2026-03-23
**Status:** Approved
**Prerequisites:** M2c complete (209 tests, 23 test files)

---

## Goal

Add pass-the-device hot seat multiplayer for up to 8 human players, with map size selection (small/medium/large), 12 playable civilizations, and independent fog of war per player.

---

## 1. Map Size Selection

| Size | Dimensions | Max Players | Start Positions |
|---|---|---|---|
| Small | 30x30 | 3 | Spread evenly |
| Medium | 50x50 | 5 | Spread evenly |
| Large | 80x80 | 8 | Spread evenly |

Map generator already accepts width/height parameters. `findStartPositions` already uses a greedy max-distance algorithm and accepts a count parameter.

`GameSettings.mapSize` changes from `'small'` literal to `'small' | 'medium' | 'large'`.

---

## 2. Expanded Civilization Roster (12)

### Existing 6
| Civ | Bonus |
|---|---|
| Egypt | Faster wonder construction |
| Rome | Auto roads between cities |
| Greece | Diplomacy start bonus (+15) |
| Mongolia | Mounted movement bonus |
| Babylon | Free tech on era change |
| Zulu | Faster military training |

### New 6
| Civ | Theme | Bonus | Personality |
|---|---|---|---|
| China | Technology & walls | `extra_tech_speed` — +20% research speed | diplomatic, trader |
| Persia | Trade empire | `trade_route_bonus` — +3 gold per trade route | trader, expansionist |
| England | Naval dominance | `naval_bonus` — +1 vision for coastal cities, stronger naval units | expansionist, aggressive |
| Aztec | War & sacrifice | `combat_production` — combat victories yield +5 production in nearest city | aggressive |
| Japan | Bushido discipline | `bushido` — units fight at full strength when below 50% health | aggressive, diplomatic |
| India | Population & growth | `faster_growth` — cities need 15% less food to grow | diplomatic, trader |

Each bonus has a `CivBonusEffect` type variant. Bonuses that reference systems not yet built (naval units, auto roads) remain inert — they're defined but not applied until the relevant system exists.

---

## 3. Game Mode & Setup Flow

### Types

```typescript
type GameMode = 'solo' | 'hotseat';

interface HotSeatConfig {
  playerCount: number;           // 2-8
  mapSize: 'small' | 'medium' | 'large';
  players: HotSeatPlayer[];     // ordered, index 0 goes first
}

interface HotSeatPlayer {
  name: string;
  civId: string;
  isHuman: boolean;
}
```

`GameState` gains an optional `hotSeat?: HotSeatConfig` field. Presence indicates hot seat mode.

### Setup UI Flow

1. **Mode Selection** — "Solo" or "Hot Seat" buttons (replaces direct civ select for new games)
2. **Solo** — goes to existing civ select flow (unchanged)
3. **Hot Seat** →
   a. Pick map size (Small/Medium/Large) with max player count shown
   b. Pick player count (2 to max for chosen size)
   c. Sequential civ selection: handoff screen says "Player 1, pick your civilization", then they see the civ select panel with already-picked civs greyed out. After picking, handoff to Player 2, etc.
   d. Remaining civ slots filled by AI
4. Game starts with Player 1's turn

---

## Implementation Notes

- **`processTurn()` hardcodes `'player'`**: Turn manager references `civilizations.player` for trade route filtering. Must be refactored to iterate all civs generically.
- **Renderer hardcodes `civilizations.player` for visibility**: `render-loop.ts` reads player visibility directly. Must switch to `civilizations[currentPlayer].visibility`.
- **`createNewGame()` rework**: Currently hardcodes 2 civs (`'player'`, `'ai-1'`). Hot seat needs dynamic civ ID assignment (e.g., `'player-1'`, `'player-2'`, `'ai-1'`, etc.) with configurable count and map size.
- **Auto-save in hot seat**: Save after each player's turn (not once per round) for crash recovery. On reload, resume at the saved player's turn.
- **Greece bonus**: Existing code uses +20, not +15. Spec defers to code.
- **Epic map size (120x120)**: Deferred to a later milestone.
- **Player count exceeds original spec's "2-4"**: Deliberate expansion to support family of 5+ with room for friends.

---

## 4. Turn Cycling

### Current Behavior (Solo)
- Player takes turn → "End Turn" → AI processes → `processTurn()` runs → back to player

### Hot Seat Behavior
- Player N takes turn → "End Turn" → handoff screen for Player N+1
- After last human player ends turn → all AI civs process → `processTurn()` runs (end-of-round processing: cities, research, barbarians, trade, diplomacy drift)
- Handoff screen for Player 1 (new round)

### Turn Manager Changes
- `currentPlayer` cycles through `hotSeat.players` in order
- `processTurn()` is only called once per round (after all players and AI have gone), not once per player
- AI turns process in batch between last human turn and `processTurn()`

### Player Order
- Fixed order set during setup (Player 1 always goes first each round)
- `GameState.currentPlayer` tracks whose turn it is

---

## 5. Turn Handoff Screen

Full-screen DOM overlay between turns:

### Phase 1: "Pass the Device"
- Shows: "Pass to **[Player Name]**" with their civ icon/color
- Background: solid dark with civ color accent
- Single button: "I'm [Player Name]" to proceed

### Phase 2: Summary Card
- Shows after player confirms identity:
  - Turn number, era
  - Gold, science per turn
  - Number of cities, units
  - Active research + turns remaining
  - Diplomatic status (at war with X, allied with Y)
  - Events since last turn (city grew, tech completed, attacked by Z)
- Button: "Start Turn" to dismiss and show the map

### Event Collection
- Events between a player's turns are collected via the EventBus
- Stored as `pendingEvents: Record<string, GameEvent[]>` in game state (keyed by player civ ID)
- Cleared when that player sees their summary card

```typescript
interface GameEvent {
  type: string;
  message: string;
  turn: number;
}
```

---

## 6. Fog of War Per Player

Already implemented: each `Civilization` has its own `visibility: VisibilityMap`.

### Renderer Change
- `RenderLoop` currently renders all tiles. It needs to accept a `visibilityMap` parameter (or read it from `gameState.civilizations[currentPlayer].visibility`) to only show what the current player can see.
- On handoff, the renderer switches to the next player's visibility map.
- Tiles in 'unexplored' render as black, 'fog' as dimmed, 'visible' as full detail (already works this way).

### What's Hidden Between Players
- Other players' unit positions (unless visible)
- Other players' city internals
- Other players' research/gold/diplomacy details
- Only the active player's fog of war applies to the map

---

## 7. Save System for Hot Seat

### Save Metadata
Hot seat saves include:
```typescript
interface SaveSlotMeta {
  id: string;
  name: string;
  civType: string;          // first player's civ for solo, 'hotseat' for hot seat
  turn: number;
  lastPlayed: string;
  gameMode: GameMode;       // 'solo' | 'hotseat'
  playerCount?: number;     // only for hotseat
  playerNames?: string[];   // only for hotseat
}
```

### Save Panel Changes
- Two sections: "Solo Games" and "Hot Seat Games"
- Hot seat saves show player count and names
- Both types support save/load/delete

---

## 8. Civ Select Updates

### Sequential Picking (Hot Seat)
- Civ select panel gains a `disabledCivs: string[]` prop
- Already-picked civs are greyed out and unclickable
- Panel header shows "[Player Name], choose your civilization"
- "Random" button only picks from available civs

### Solo Mode
- Unchanged — full roster of 12 civs available

---

## 9. Main.ts Integration

### Game Mode Selection
- `init()` shows save panel → "New Game" → mode selection overlay
- Solo → existing civ select
- Hot Seat → setup wizard (map size → player count → sequential picks)

### Turn End Flow (Hot Seat)
```
Player taps "End Turn"
  → Collect events for this player
  → If more human players this round:
      → Show handoff screen for next human player
  → If last human player:
      → Process all AI turns
      → Run processTurn() (end-of-round)
      → Show handoff screen for Player 1 (new round)
```

### HUD Updates
- Show current player name in HUD: "[Player Name] · Turn 42 · Era 2"
- Use player's civ color as accent

---

## 10. Testing Strategy

- **Civ definitions**: Validate all 12 civs have required fields, unique IDs, valid bonuses
- **Turn cycling**: Unit test that currentPlayer advances correctly through players, AI processes at right time, processTurn fires once per round
- **Handoff summary**: Unit test that event collection and summary generation work correctly
- **Map sizes**: Verify medium/large maps generate correctly, start positions are valid
- **Save/load**: Hot seat saves round-trip correctly with all metadata
- **Fog of war**: Verify renderer uses correct player's visibility map
