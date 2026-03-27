# Milestone 3c: Expanded Tech Tree & Minor Civilizations

## Goal

Expand the tech tree from 5 tracks (40 techs) to 15 tracks (120 techs) with cross-track prerequisites, and introduce minor civilizations as independent city-states with diplomacy, quests, and dynamic behavior including barbarian camp evolution.

## Scope

**In scope:**
- 10 new tech tracks (8 techs each, eras 1-4) with cross-track dependencies
- 12 named minor city-states (historical + fantasy) with 3 archetypes
- Minor civ placement at map generation + barbarian camp evolution
- Full DiplomacyState reuse for minor civ relationships
- Quest system (4 types) with extensible foundation for future chains
- Minor civ turn phase: movement, combat, guerrilla behavior, era upgrades
- Minor civ scuffles and diplomatic agency
- Conquest penalty (decaying diplomatic event to all other minor civs)
- Renderer updates: city-state icons, territory, diplomacy panel tab
- Advisor messages for chancellor, warchief, treasurer re: minor civs

**Out of scope (deferred):**
- Pirates and ocean threats (M4+)
- Quest chains (M4+ — `chainNext` field present but unused)
- Minor civ alliances against hostile major civs (M4+ — recorded in project memory)
- Tech eras 5-12 (M5)
- Breakaway factions, guerrillas, revolutionary movements (M4+ — need happiness system)

---

## Part 0: New Unit Types for Era Progression

### Expanded UnitType

The current `UnitType` is `'settler' | 'worker' | 'scout' | 'warrior'`. Minor civ era upgrades and militaristic ally bonuses require additional military unit types.

Add to `types.ts`:

```typescript
type UnitType = 'settler' | 'worker' | 'scout' | 'warrior' | 'swordsman' | 'pikeman' | 'musketeer';
```

Add to `UNIT_DEFINITIONS` in `unit-system.ts`:

| Unit | Strength | Movement | Vision | Cost | Era |
|---|---|---|---|---|---|
| swordsman | 25 | 2 | 2 | 50 | 2 |
| pikeman | 35 | 2 | 2 | 70 | 3 |
| musketeer | 50 | 2 | 2 | 90 | 4 |

These units are available to minor civs via era upgrades and to major civs when the appropriate tech is researched (Bronze Working → swordsman, Fortification → pikeman, Tactics → musketeer).

### Minor Civ Unit Ownership Convention

Minor civ units use `unit.owner = 'mc-{definitionId}'` (e.g., `'mc-sparta'`, `'mc-carthage'`). This prefix convention distinguishes them from major civs and barbarians.

**Filter updates required:**
- `turn-manager.ts`: barbarian processing filter must exclude `mc-*` owners (use `u.owner !== 'barbarian' && !u.owner.startsWith('mc-')` for "player/AI units")
- `basic-ai.ts`: AI combat targeting treats `mc-*` units based on relationship (hostile = enemy, else ignore)
- `fog-of-war.ts`: no change needed — visibility is per-civ, minor civ units are only revealed via other civs' vision
- City ownership: minor civ cities have `city.owner = 'mc-{definitionId}'`

---

## Part 1: Expanded Tech Tree

### Type Changes

Expand `TechTrack` in `types.ts`:

```typescript
type TechTrack =
  | 'military' | 'economy' | 'science' | 'civics' | 'exploration'
  | 'agriculture' | 'medicine' | 'philosophy' | 'arts' | 'maritime'
  | 'metallurgy' | 'construction' | 'communication' | 'espionage' | 'spirituality';
```

Expand `TechState.trackPriorities` default to include all 15 tracks at `'medium'`.

### New File: `src/systems/tech-definitions.ts`

Contains all 120 tech definitions as a flat array. Replaces the `TECH_TREE` constant currently in `tech-system.ts`. The `tech-system.ts` functions remain unchanged — they operate on the `Tech` interface generically.

### 10 New Tracks

Each track has 8 techs spanning eras 1-4 (2 per era). Cross-track prerequisites create a web rather than 15 parallel lines.

| Track | Era 1 | Era 2 | Era 3 | Era 4 | Key Cross-Track Prereqs |
|---|---|---|---|---|---|
| Agriculture | Gathering, Domestication | Crop Rotation, Granary Design | Fertilization, Livestock Breeding | Selective Breeding, Agricultural Science | Irrigation (economy) → Crop Rotation |
| Medicine | Herbalism, Bone Setting | Sanitation, Midwifery | Surgery, Quarantine | Apothecary, Anatomy | Philosophy (philosophy) → Surgery |
| Philosophy | Oral Tradition, Mythology | Ethics, Rhetoric | Logic, Metaphysics | Humanism, Natural Philosophy | Writing (science) → Ethics |
| Arts | Cave Painting, Storytelling | Pottery Arts, Music | Sculpture, Drama | Theater, Architecture Arts | Pottery (economy) → Pottery Arts |
| Maritime | Rafts, Fishing | Galleys, Navigation | Triremes, Harbor Building | Caravels, Naval Warfare | Sailing (exploration) → Galleys |
| Metallurgy | Copper Working, Smelting | Bronze Casting, Tool Making | Iron Smelting, Alloys | Steel Forging, Armor Craft | Bronze Working (military) → Bronze Casting |
| Construction | Mud Brick, Thatching | Masonry, Foundations | Aqueducts, Arches | Fortresses, City Planning | Engineering (science) → Aqueducts |
| Communication | Drums, Smoke Signals | Pictographs, Messengers | Courier Networks, Ciphers | Printing, Diplomats | Writing (science) → Pictographs |
| Espionage | Scouts Tech, Lookouts | Informants, Disguise | Spy Networks, Sabotage | Cryptography, Counter-Intelligence | Code of Laws (civics) → Informants |
| Spirituality | Animism, Burial Rites | Shamanism, Sacred Sites | Temples, Priesthood | Pilgrimages, Theology | Tribal Council (civics) → Shamanism |

### No System Changes Required

The existing `tech-system.ts` functions (`getAvailableTechs`, `startResearch`, `processResearch`, `isTechCompleted`) all operate on the `Tech` interface and iterate `TECH_TREE`. They work unchanged with 120 techs.

### AI Impact

`trackPriorities` in `TechState` gains 10 new keys defaulted to `'medium'`. The `chooseTech` function in `ai-strategy.ts` already weights by track priority and works without changes.

---

## Part 2: Minor Civilization Definitions

### New File: `src/systems/minor-civ-definitions.ts`

12 named minor city-states with 3 archetypes:

| Name | Archetype | Description |
|---|---|---|
| Sparta | Militaristic | Warrior city-state, respects strength |
| Valyria | Militaristic | Dragonforged warriors of legend |
| Numantia | Militaristic | Unconquerable hill fortress |
| Gondolin | Militaristic | Hidden elven stronghold |
| Carthage | Mercantile | Trading hub of the ancient world |
| Zanzibar | Mercantile | Island spice trading post |
| Samarkand | Mercantile | Jewel of the Silk Road |
| Petra | Mercantile | Rose-red city of caravans |
| Alexandria | Cultural | Center of knowledge and learning | Ally: +3 science/turn |
| Delphi | Cultural | Oracle's seat, font of wisdom | Ally: +2 science/turn |
| Timbuktu | Cultural | Great library of the sands | Ally: +2 production/turn |
| Avalon | Cultural | Mystical isle of ancient knowledge | Ally: +3 production/turn |

### Definition Structure

```typescript
type MinorCivArchetype = 'militaristic' | 'mercantile' | 'cultural';

interface MinorCivDefinition {
  id: string;
  name: string;
  archetype: MinorCivArchetype;
  description: string;
  allyBonus: AllyBonus;
  color: string;
}

type AllyBonus =
  | { type: 'free_unit'; unitType: string; everyNTurns: number }
  | { type: 'gold_per_turn'; amount: number }
  | { type: 'science_per_turn'; amount: number }
  | { type: 'production_per_turn'; amount: number };
```

### Archetype Behaviors

- **Militaristic:** Ally bonus = free military unit every N turns. Relationship boost from defeating nearby enemies. Respects strength — attacking them has less diplomatic fallout with other militaristic minor civs. May initiate scuffles with neighboring minor civs.
- **Mercantile:** Ally bonus = +gold per turn. Relationship boost from trade routes and gold gifts. Prefers peaceful interaction.
- **Cultural:** Ally bonus = +science or +production per turn. Relationship boost from tech completion. Values knowledge and stability.

---

## Part 3: Minor Civ State & Diplomacy

### New Types in `types.ts`

```typescript
interface MinorCivState {
  id: string;
  definitionId: string;
  cityId: string;
  units: string[];
  diplomacy: DiplomacyState;
  activeQuests: Record<string, Quest>;  // keyed by major civ ID
  isDestroyed: boolean;
  garrisonCooldown: number;  // turns until garrison replacement
  lastEraUpgrade: number;    // last era that triggered an upgrade
}
```

### On GameState

```typescript
minorCivs: Record<string, MinorCivState>;
```

### Diplomacy Reuse

Minor civs get a full `DiplomacyState` with relationships toward **major civs only**. Call `createDiplomacyState(majorCivIds, minorCivOwnerId, 0)` — passing only major civ IDs, not other minor civ IDs. This avoids `processRelationshipDrift` trying to look up minor civ cities in `GameState.civilizations`.

Minor civ scuffles (Section 6) are resolved via combat, not the diplomacy system — scuffle eligibility is based on proximity and archetype, not relationship scores between minor civs.

Existing functions (`declareWar`, `makePeace`, `proposeTreaty`, `getRelationship`) work out of the box for major-civ-to-minor-civ interactions.

### Relationship Thresholds

| Score | Status | Effect |
|---|---|---|
| -60 or below | Hostile | Units attack on sight, guerrilla raids |
| -30 to +30 | Neutral | Passive, won't interact unless provoked |
| +30 to +60 | Friendly | Trade bonuses active, shared vision |
| +60 or above | Allied | Archetype ally bonus active, units assist in nearby combat |

### Conquest Mechanics

Capturing a minor civ's city (via normal combat/city capture):
- `isDestroyed = true`
- City transferred: set `city.owner` to conqueror's civ ID, push `cityId` into conqueror's `Civilization.cities[]`
- Remove city from `MinorCivState.cityId` (state is preserved for reference but inactive)
- Diplomatic event emitted to ALL other minor civs: `{ type: 'minor_civ_conquered', weight: -20 }`
- This decays naturally over ~20 turns via existing `processDiplomacy` event weight decay
- Militaristic minor civs apply a smaller penalty (-10) — they respect strength

### Minor Civ Cities

Use existing `City` interface. Starting state:
- 3 population
- 1 garrison warrior
- 1-2 buildings based on archetype:
  - Militaristic: barracks
  - Mercantile: market
  - Cultural: library
- Grow slowly (+1 pop per era) but don't expand territory or build production queues

**City processing isolation:** Minor civ cities exist in `GameState.cities` with `city.owner = 'mc-{id}'` but are NOT in any `Civilization.cities[]` array. The `processTurn` city loop iterates `civ.cities[]` per civilization, so minor civ cities are naturally excluded from major civ processing. Minor civ city growth is handled in the minor civ turn phase (Part 6), not via `processCity`.

---

## Part 4: Quest System

### New File: `src/systems/quest-system.ts`

### Quest Structure

```typescript
interface Quest {
  id: string;
  type: QuestType;
  description: string;
  target: QuestTarget;
  reward: QuestReward;
  progress: number;
  status: 'active' | 'completed' | 'expired';
  turnIssued: number;
  expiresOnTurn: number | null;
  chainNext?: string;  // future: next quest in chain (unused in M3c)
}

type QuestType = 'destroy_camp' | 'gift_gold' | 'defeat_units' | 'trade_route';

type QuestTarget =
  | { type: 'destroy_camp'; campId: string }
  | { type: 'gift_gold'; amount: number }
  | { type: 'defeat_units'; count: number; nearPosition: HexCoord; radius: number }
  | { type: 'trade_route'; minorCivId: string };

interface QuestReward {
  relationshipBonus: number;
  gold?: number;
  science?: number;
  freeUnit?: string;
}
```

### 4 Quest Types

| Type | Description | Weighted Toward | Reward |
|---|---|---|---|
| destroy_camp | Destroy a specific barbarian camp within 8 hexes | Militaristic (60%) | +25 relationship, +gold |
| gift_gold | Pay X gold (scaled by era: 25/50/75/100) | Mercantile (60%) | +20 relationship |
| defeat_units | Kill N enemy units within radius of minor civ | Militaristic (40%) | +30 relationship, free unit |
| trade_route | Establish trade route to minor civ's city (completion check: any `TradeRoute.toCityId === minorCivState.cityId`) | Mercantile/Cultural | +25 relationship, +science |

### Quest Lifecycle

1. Each minor civ offers one quest per major civ at a time
2. Quest assigned during `processTurn` when no active quest exists for that pair
3. Quest type weighted by archetype
4. Quest target validated against current game state (e.g., camp must exist)
5. Completion checked each turn against game events (camp destroyed, gold gifted, etc.)
6. Expired quests (20 turns) are removed, new quest issued next turn
7. Completed quests award rewards immediately, new quest issued after 3-turn cooldown

### Extensibility

The `chainNext` field enables future quest chains without structural changes. A chain definition module can map quest completions to follow-up quests with escalating rewards.

---

## Part 5: Barbarian Camp Evolution

### Modifications to `src/systems/barbarian-system.ts`

When a barbarian camp reaches **strength 8+** (~20 turns survived), it can evolve into a minor civ:

1. Camp removed from `gameState.barbarianCamps`
2. New `MinorCivState` created with a random unused `MinorCivDefinition`
3. City founded at camp position
4. Barbarian units within 3 hexes become minor civ garrison (owner transferred)
5. Event emitted: `'minor-civ:evolved'`

### Evolution Constraints

- Maximum one evolution per 10 turns
- Total minor civs on map capped at placement limits per map size
- Camp must not be within 6 hexes of any existing city (major or minor)
- Must have an unused MinorCivDefinition available

### Gameplay Impact

Ignoring barbarians has consequences — they become permanent NPC neighbors. Early aggression against camps prevents this; letting camps grow creates new diplomatic opportunities (or threats).

---

## Part 6: Minor Civ Turn Processing & Behavior

### Turn Phase

**Turn processing order in `processTurn`:**
1. Major civ turns (city yields, growth, production, research, gold, unit reset)
2. Diplomacy processing (relationship drift, treaty ticking, trade income)
3. Marketplace processing
4. Wonder effects (eruptions, healing)
5. **Minor civ turn phase** (new — see below)
6. Barbarian processing (cooldowns, spawning, **evolution check**)
7. **Era advancement check** (new — see below)
8. Advance turn counter

Minor civ turn phase steps:

1. **Movement & combat:** Move units, resolve attacks within patrol radius
2. **Quest evaluation:** Check completion/expiry, award rewards, issue new quests
3. **Ally bonuses:** Apply per-turn bonuses for allied major civs
4. **Garrison replacement:** Spawn replacement if garrison lost (3-turn cooldown)
5. **Guerrilla spawning:** If at war with a major civ, spawn guerrilla units (max 2)
6. **Scuffle resolution:** Militaristic minor civs may attack neighboring minor civs
7. **Diplomatic requests:** Surface requests to major civs as notifications

Note: Barbarian evolution happens inside `processBarbarians` (step 6), NOT in the minor civ phase. This ensures camp strength is updated before checking evolution eligibility.

### Era Advancement

`gameState.era` advances when any major civilization has completed 60% of techs in the next era. Check after barbarian processing:

```typescript
const nextEra = state.era + 1;
const nextEraTechs = TECH_TREE.filter(t => t.era === nextEra);
if (nextEraTechs.length > 0) {
  const anyAdvanced = Object.values(state.civilizations).some(civ => {
    const completed = nextEraTechs.filter(t => civ.techState.completed.includes(t.id));
    return completed.length >= nextEraTechs.length * 0.6;
  });
  if (anyAdvanced) state.era = nextEra;
}
```

This triggers minor civ era upgrades on the following turn.

### Movement & Combat

- Garrison patrols a 3-hex radius around city
- Against hostile major civs (< -60 relationship): guerrilla behavior — raid nearby tiles, pillage improvements, retreat to city
- Guerrilla units: max 2 at a time, spawned from city when at war
- Minor civ units use existing combat system (`resolveCombat`)

### Era Upgrades

When `gameState.era` advances beyond `lastEraUpgrade`:
- Garrison units upgrade: era 1 warrior → era 2 swordsman → era 3 pikeman → era 4 musketeer
- City gains +1 population
- City gains one building appropriate to archetype and era
- `lastEraUpgrade` updated

### Diplomatic Agency

- Minor civs send requests as event notifications: "We need help against [threat]," "Will you trade with us?"
- Minor civs refuse treaties with hostile major civs
- Relationship shifts based on observed behavior:
  - Attack a minor civ's neighbor: militaristic minor civs may respect strength (+5), cultural ones condemn it (-15)
  - Destroy a barbarian camp near a minor civ: relationship +10
  - Complete a quest: relationship bonus per quest reward

### Scuffles Between Minor Civs

- Militaristic minor civs may attack neighboring minor civs within 8 hexes (raised from 5 to account for 10-hex placement distance — scuffles primarily occur between evolved minor civs placed closer together, or after initial placement spacing narrows through map dynamics)
- Resolved with existing combat system
- Losing minor civ does NOT get destroyed by another minor civ — just loses units, relationship drops
- Scuffle chance: 10% per turn for militaristic minor civs with a neighbor within range

---

## Part 7: Placement

### New File: `src/systems/minor-civ-system.ts`

### Map Generation Placement

Called in `createNewGame` and `createHotSeatGame` after wonder/village placement:

| Map Size | Minor Civs Placed |
|---|---|
| Small | 2-4 |
| Medium | 4-6 |
| Large | 6-8 |

### Distance Constraints

- 8+ hexes from any start position
- 10+ hexes from each other
- Not on impassable terrain (ocean, coast, mountain)
- Not on wonder tiles

### Placement Process

1. Select N definitions randomly from the 12 available
2. Shuffle passable land tiles (seeded RNG)
3. Place minor civs respecting distance constraints
4. For each placed minor civ:
   - Create city at position (3 pop, archetype buildings)
   - Create garrison warrior unit
   - Initialize DiplomacyState with relationships toward all major civs (starting at 0)
   - Initialize empty quest slots

---

## Part 8: Renderer & UI

### Hex Map

- Minor civ cities: small shield icon in archetype color (crossed swords for militaristic, coin for mercantile, scroll for cultural)
- Minor civ territory: 2-hex radius shown with subtle border in their color
- Minor civ units: rendered like major civ units with smaller shield marker

### Diplomacy Panel

- New "City-States" tab alongside existing major civ diplomacy
- Each known minor civ shows: name, archetype icon, relationship bar, active quest
- Actions: Gift Gold, View Quest, Declare War / Make Peace
- Quest details: description, progress bar, reward preview

### Notifications

| Event | Message | Type |
|---|---|---|
| Quest issued | "[Name] asks: [quest description]" | info |
| Quest completed | "[Name] is grateful! [rewards]" | success |
| Quest expired | "Our request from [Name] has lapsed" | info |
| Minor civ evolved | "A barbarian tribe formed the city-state of [Name]!" | info |
| Minor civ request | "[Name] seeks [request]" | info |
| Minor civ allied | "[Name] pledges allegiance!" | success |
| Minor civ guerrilla | "[Name] raiders pillaged near [city]!" | warning |
| Minor civ conquered | "[Name] has fallen!" | warning |

### Advisor Messages

- Chancellor: "A nearby city-state could be a valuable ally. Consider their quest."
- Chancellor: "Our aggression against city-states is making others wary."
- Warchief: "An undefended city-state could be easy pickings..."
- Warchief: "[Name] guerrillas are harassing our borders!"
- Treasurer: "Our mercantile ally [Name] is boosting our income."
- Scholar: "Our cultural ally [Name] advances our knowledge."

---

## Part 9: Event Bus Additions

```typescript
'minor-civ:quest-issued': { minorCivId: string; majorCivId: string; quest: Quest }
'minor-civ:quest-completed': { minorCivId: string; majorCivId: string; quest: Quest; reward: QuestReward }
'minor-civ:evolved': { campId: string; minorCivId: string; position: HexCoord }
'minor-civ:destroyed': { minorCivId: string; conquerorId: string }
'minor-civ:allied': { minorCivId: string; majorCivId: string }
'minor-civ:scuffle': { attackerId: string; defenderId: string; position: HexCoord }
'minor-civ:guerrilla': { minorCivId: string; targetCivId: string; position: HexCoord }
'minor-civ:era-upgrade': { minorCivId: string; newEra: number }
'minor-civ:relationship-threshold': { minorCivId: string; majorCivId: string; newStatus: 'hostile' | 'neutral' | 'friendly' | 'allied' }
```

The `relationship-threshold` event fires when a relationship crosses -60, -30, +30, or +60 boundaries. This drives UI notifications and advisor messages.

---

## Part 10: Fog of War & Visibility

- Minor civ cities are **always visible** once any tile within 2 hexes has been explored (transitioned from `unexplored` to `fog` or `visible`). This is checked during `updateVisibility` — if a revealed tile is within 2 hexes of a minor civ city, the city tile is set to `visible`.
- Minor civ units are subject to normal fog of war — they appear/disappear based on each player's vision.
- **Shared vision** at Friendly threshold (+30): during `updateVisibility` for a major civ, also reveal tiles around the friendly minor civ's units and city (2-hex radius). Implementation: after revealing around the major civ's own units, loop through minor civs and add their unit/city positions to the reveal list if relationship >= 30.
- Minor civ units in fog-of-war tiles are rendered as "last known position" (same as enemy major civ units).

---

## Part 11: Hot Seat Integration

- Quest notifications are routed through `pendingEvents[civId]` in hot seat mode, consistent with existing event handling. Each player only sees quests issued to them.
- Minor civ relationship changes from Player A's actions are not revealed to Player B until Player B's turn (events queued per player).
- Minor civ diplomacy panel shows relationships for the **current player only** (same pattern as major civ diplomacy).
- Gift Gold action debits the current player's gold, not a shared pool.

---

## Part 12: Save/Load Migration

Add to `migrateLegacySave()` in `main.ts`:

```typescript
// M3c migration
if (!state.minorCivs) state.minorCivs = {};

// Backfill trackPriorities for expanded tech tracks
const allTracks = ['military','economy','science','civics','exploration',
  'agriculture','medicine','philosophy','arts','maritime',
  'metallurgy','construction','communication','espionage','spirituality'];
for (const civ of Object.values(state.civilizations)) {
  for (const track of allTracks) {
    if (!(track in civ.techState.trackPriorities)) {
      civ.techState.trackPriorities[track] = 'medium';
    }
  }
}
```

Old saves load with no minor civs (they won't spawn mid-game for existing saves) and all new tech tracks at `'medium'` priority.

---

## Part 13: Testing Strategy

### Tech Tree Tests (~15)
- All 120 techs have valid prerequisites (no circular deps, no missing refs)
- Each of 15 tracks has exactly 8 techs
- Era distribution correct (2 per era per track)
- Cross-track prerequisites reference existing techs
- `getAvailableTechs` works with expanded tree
- AI track priorities default correctly for 15 tracks

### Minor Civ Definition Tests (~8)
- All 12 definitions have valid archetype, color, bonus
- No duplicate IDs or names
- Each archetype has at least 3 representatives

### Minor Civ Placement Tests (~8)
- Correct count per map size
- Distance constraints from starts and between minor civs
- Each placed minor civ has a city and garrison
- Not placed on impassable/wonder tiles

### Quest System Tests (~12)
- Each quest type generates valid targets
- Quest completion awards correct rewards
- Quest expiry after 20 turns
- New quest issued after completion (with cooldown) or expiry
- Archetype weighting biases quest type selection
- `chainNext` field preserved but unused
- Invalid targets (e.g., destroyed camp) handled gracefully

### Barbarian Evolution Tests (~6)
- Camp at strength 8+ evolves
- Evolution respects max minor civ cap
- Evolution respects 6-hex city distance
- Only one evolution per 10 turns
- Nearby barbarian units transfer ownership
- No evolution if no unused definitions

### Minor Civ Behavior Tests (~10)
- Guerrilla units spawn when at war with major civ (max 2)
- Era upgrades improve garrison unit type
- Era upgrades add population and building
- Scuffles between militaristic minor civs
- Diplomatic event decay for conquest penalty
- Ally bonus applied correctly per archetype
- Garrison replacement after cooldown

### Integration Tests (~6)
- Minor civ diplomacy uses existing DiplomacyState functions
- Combat with minor civ units uses existing resolveCombat
- Conquering minor civ sets isDestroyed, transfers city
- Conquest penalty applied to all surviving minor civs
- AI interacts with minor civs based on personality

### Total: ~65 new tests (271 → ~336)

---

## File Summary

### New Files
- `src/systems/tech-definitions.ts` — 120 tech definitions (15 tracks × 8)
- `src/systems/minor-civ-definitions.ts` — 12 named minor city-state definitions
- `src/systems/minor-civ-system.ts` — placement, turn processing, evolution, guerrilla logic
- `src/systems/quest-system.ts` — quest generation, evaluation, rewards
- `tests/systems/tech-definitions.test.ts`
- `tests/systems/minor-civ-definitions.test.ts`
- `tests/systems/minor-civ-system.test.ts`
- `tests/systems/quest-system.test.ts`

### Modified Files
- `src/core/types.ts` — expanded TechTrack, UnitType, new MinorCivState/Quest types, new GameEvents
- `src/systems/tech-system.ts` — import TECH_TREE from tech-definitions.ts instead of inline
- `src/systems/unit-system.ts` — add swordsman, pikeman, musketeer to UNIT_DEFINITIONS
- `src/systems/barbarian-system.ts` — evolution check in processBarbarians
- `src/systems/fog-of-war.ts` — minor civ city auto-reveal, shared vision for friendly minor civs
- `src/core/turn-manager.ts` — minor civ turn phase, era advancement check
- `src/core/game-state.ts` — place minor civs in createNewGame/createHotSeatGame
- `src/main.ts` — minor civ interaction hooks, quest event handling, conquest penalty, save migration
- `src/ai/basic-ai.ts` — AI interaction with minor civs, filter mc- units from targeting
- `src/ai/ai-diplomacy.ts` — AI evaluation of minor civ relationships
- `src/ui/advisor-system.ts` — new advisor messages for minor civ events
- `src/renderer/hex-renderer.ts` — minor civ city/territory/unit rendering
- `src/renderer/render-loop.ts` — pass minor civ data to renderer
