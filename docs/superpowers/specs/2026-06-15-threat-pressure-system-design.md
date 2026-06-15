# Unified Threat Pressure System — Design Spec

**Issue:** [#378](https://github.com/a1flecke/conquestoria/issues/378)
**Crisis Events (deferred):** [#381](https://github.com/a1flecke/conquestoria/issues/381)
**Status:** Approved design
**Date:** 2026-06-15

---

## Problem

Once a player clears barbarian camps from their continent, no new land threats appear.
Opponents are often on a different continent. The mid-game becomes a lull — nothing to do,
nowhere to fight. This is especially acute for experienced players who expand quickly.

---

## Goals

- Add ongoing land pressure (barbarian resurgence) and sea pressure (pirate raiders) that
  scale naturally with how dominant the player has become on each landmass.
- Make every landmass the player has settled independently apply pressure — not just their
  home continent.
- Keep the game fun for kids: era-1 threats are low-stakes engagement; real consequences
  arrive only in era 2+.
- Support solo and hot-seat correctly — per-civ, per-landmass, per-human-player.
- Fix the throwaway `continentHexes` stat: bake landmass identity into `HexTile.regionKey`
  at generation time so it persists in saved state and is available at runtime.

---

## Non-Goals

- Crisis events (plague, famine, volcanic eruption, rebellious provinces) — tracked as [#381].
- New pirate base / tribute / elimination campaign — pirates are raiders, not a full faction.
- AI civ threat pressure — AI always has something to do; human boredom is the target problem.
- Difficulty modes — threat intensity is governed solely by era and landmass dominance.
- New unit types for pirates — pirates reuse existing naval sprites (`galley`, `carrack`, `trireme`)
  with a hostile faction palette, exactly as barbarian warriors reuse the warrior sprite.

---

## Core Invariants

1. Threat pressure is computed only for human-player civs. AI civs are never evaluated.
2. Every landmass where a human civ has ≥ 1 city is evaluated independently.
3. A landmass with 0 player cities produces no pressure — its game-start barbarians remain but do not escalate.
4. The threat score is a pure function of state — it has no side effects and is safe to call in tests.
5. Spawning (new camps, new fleets) is a per-civ operation that runs when that civ ends their turn.
6. Pirate fleet movement and attack is a world-phase operation that runs every `endTurn` call, alongside barbarians.
7. Pirate units use `PIRATE_OWNER = 'pirate'` as their owner string. Every filter that currently
   excludes `'barbarian'` and `BEAST_OWNER` from player-unit lists must also exclude `PIRATE_OWNER`.
8. All randomness uses seeded LCG — never `Math.random()`.
9. Combat on any tile (land or sea) updates the idle timer for the relevant landmass.
10. Events notify; state mutations happen before events are emitted.

---

## Architecture Overview

```
threat-pressure-system.ts
  ├── computeThreatScore(state, civId, landmassId): number   [pure]
  ├── empireShare(state, civId, landmassId): number          [pure]
  ├── nearestLandmassId(position, map): string | null        [pure]
  ├── processLandResurgence(state, civId, landmassId, bus)   [mutates, spawn phase]
  └── processPirateFleets(state, bus)                        [mutates, world phase]

turn-manager.ts (additions)
  ├── After barbarian phase: processThreatPressure(state, currentCivId, bus)
  │     iterates landmasses where currentCivId has cities, calls processLandResurgence per landmass
  └── After beast phase: processPirateFleets(state, bus)
        moves and attacks with all active pirate fleets (world phase, every endTurn)

save-manager.ts (addition)
  └── normalizeLandmassKeys(state): GameState
        flood-fills map if any tile is missing regionKey; appended to normalizeLoadedState pipeline

main.ts / migrateLegacySave (additions)
  └── Defaults for lastCombatTurnByLandmass, pirateFleets, pirateFleetCooldownByCivLandmass,
      resurgentCampCooldownByCivLandmass
```

---

## Section 1 — Landmass Tagging

Every land `HexTile` gets `regionKey` set at map generation time. Ocean tiles have no `regionKey`.

### ID Format

- Main landmasses (≥ 9 connected land tiles): `'continent-0'`, `'continent-1'`, ... (sorted largest first)
- Smaller components (< 9 tiles): `'island-0'`, `'island-1'`, ... (sorted largest first)
- 9-tile floor eliminates ocean-noise slivers from terrain generation; not a gameplay threshold.
- A player starting on a 12-tile island gets a legitimate continent-0 — any settled landmass is
  valid for threat pressure regardless of size.

### By Generator

**`continent-map-generator.ts`**
The function already returns `{ map, continentHexes }`. After generation, one pass sets:
- Tiles in `continentHexes` → `regionKey = 'continent-0'`
- Island cluster i → `regionKey = 'island-i'`
No new computation; just write the existing data to tiles.

**`balanced-map-generator.ts`** and **geo maps** (`geo-map-loader.ts`)
After map is built, flood-fill all land tiles into connected components. Sort by tile count
descending. Assign `continent-N` to components ≥ 9 tiles, `island-N` to smaller ones.
Set `tile.regionKey` for every tile in each component.

### Old Save Migration

In `normalizeLoadedState` (save-manager.ts), append `normalizeLandmassKeys(state)`:

```ts
function normalizeLandmassKeys(state: GameState): GameState {
  const needsTagging = Object.values(state.map.tiles).some(t => !t.regionKey && t.terrain !== 'ocean' && t.terrain !== 'coast');
  if (!needsTagging) return state;
  // flood-fill, assign regionKey on each tile
  return taggedState;
}
```

Runs once; result persists on next autosave. Idempotent.

---

## Section 2 — Threat Score

`computeThreatScore(state, civId, landmassId): number` — pure function, no side effects.

```
score = era × (1.0 + empireShare + idleFactor)
```

### `empireShare`

```
empireShare = (tiles on landmassId where territory[hexKey] === civId)
            ÷ (tiles on landmassId where terrain ∉ {ocean, coast, mountain, snow})
```

Clamped to [0, 1.0]. Uses `state.territory` (already computed each turn).
Does **not** use city count or a footprint constant — territory tiles directly represent control.

### `idleFactor`

```
idleTurns = state.turn − (civ.lastCombatTurnByLandmass[landmassId] ?? state.turn)
idleFactor = min(idleTurns / 10, 1.5)
```

Maximum reached at 15 idle turns; capped there.

**Hot-seat note:** `state.turn` increments once per End Turn button press (per player, not per round).
In a 3-player game, `idleFactor` reaches maximum after ~5 of a given player's own turns.
This is intentional — hot-seat games naturally have more inter-player dynamics, so faster
pressure escalation is appropriate. Document as a conscious design decision, not a bug.

### Score Examples

| Situation | Score |
|---|---|
| Era 1 · 1 city · fought 0 turns ago | 1 × (1 + ~0.05 + 0) ≈ **1.1** |
| Era 2 · growing · 5 idle turns | 2 × (1 + 0.4 + 0.5) = **3.8** |
| Era 2 · dominant · 10 idle turns | 2 × (1 + 0.85 + 1.0) = **5.7** |
| Era 3 · dominant · 15+ idle turns | 3 × (1 + 0.9 + 1.5) = **10.2** |

### Evaluation Scope

Only landmasses where `civId` has ≥ 1 city are evaluated.
Only called for human-player civs (check via `hotSeat.players` or solo detection).

---

## Section 3 — Combat Idle Tracking

`lastCombatTurnByLandmass: Record<string, number>` on `CivilizationState`.
Updated in `turn-manager.ts` after any combat involving the player's units.

### Landmass Lookup

**Land tile** (`terrain` ∉ `{ocean, coast}`): `regionKey` is the landmass ID directly.

**Ocean/coast tile**: call `nearestLandmassId(position, map)` — BFS outward from `position`
across all tiles until a tile with `regionKey` is found. Return its `regionKey`.
If no landmass found within 10 tiles, return `null` (no update — open-ocean edge case).

Update rule: `civ.lastCombatTurnByLandmass[landmassId] = state.turn` for any combat
where one side is owned by `civId`.

### Save Migration Default

Old saves have no `lastCombatTurnByLandmass`. In `migrateLegacySave()`:
```ts
if (!civ.lastCombatTurnByLandmass) {
  civ.lastCombatTurnByLandmass = {};
  // No explicit initialization per landmass — defaults to state.turn on first access
  // via the ?? state.turn in idleFactor formula. Safe: no threat burst on load.
}
```

---

## Section 4 — Land Resurgence

New barbarian camps grow in wilderness the player has cleared.

### Trigger

Score ≥ 2.5 on this (civ, landmass) pair.

### Spawn Rules

Reuse `spawnBarbarianCamp` with candidates filtered to tiles where `tile.regionKey === landmassId`.
All existing distance constraints apply (6 tiles from cities, 4 tiles from other camps, no ocean/mountain/snow).
If no valid tile exists → no spawn. System self-limits on densely settled landmasses.

### Spawn Cap & Cooldown

- Cap: max 2 active resurgent camps per (civ, landmassId). Counted via `BarbarianCamp.resurgent === true`.
- Cooldown: 8 turns between resurgent spawns per (civ, landmassId).
- Cooldown stored in `GameState.resurgentCampCooldownByCivLandmass: Record<string, number>`
  (key: `${civId}:${landmassId}`). Defaults to `{}` on old saves.

### Camp Strength by Era

| Era | Strength range | Stakes |
|---|---|---|
| 1 | 3–6 | Cannot capture cities — low-stakes engagement |
| 2 | 6–10 | Can damage border improvements — recoverable |
| 3+ | 10–16 | Can threaten weakly garrisoned cities — real stakes |

Strength formula: `baseLow + floor(rng() * (baseHigh - baseLow))` using seeded LCG.
Seed: `state.turn * 99991 + landmassId.charCodeAt(0) * 7 + civId.charCodeAt(0) * 3`.

### Bandit Lord Variant (Era 3+, score > 8)

25% chance (from seeded RNG) that a resurgent spawn is a "bandit lord":
- Named from the **current player's civ's bandit lord pool** (seeded RNG, no repeats until pool exhausted, then restart).
- Strength = era-max + 4.
- Grants 2× gold reward on destruction.
- Council notification uses distinct text (see §9).

### Bandit Lord Name Pool Requirement

Each civ must supply **4–7 names** drawn from that civ's history (real figures, canonical
fictional characters, or thematically consistent invented names for civs with thin source
material). Names should evoke warlords, rebel leaders, rivals, usurpers, or conquerors —
not peaceful rulers. The full pool is defined in `src/systems/threat-pressure-system.ts`
as a `Record<CivId, string[]>`.

**Historical civs — sources are rich; 5–7 names each are readily available:**

| Civ | Candidate figures |
|---|---|
| Egypt | Ramesses II, Thutmose III, Akhenaten, Seti I, Apep, Amenhotep IV |
| Rome | Sulla, Marius, Spartacus, Catiline, Brutus, Caesar, Pompey |
| Greece | Lysander, Alcibiades, Critias, Alexander, Pausanias, Themistocles |
| Mongolia | Genghis Khan, Batu Khan, Tamerlane, Ögedei, Berke Khan |
| Babylon | Nebuchadnezzar II, Nabopolassar, Sargon of Akkad, Naram-Sin, Hammurabi |
| Zulu | Shaka, Cetshwayo, Dingane, Mpande, Senzangakhona |
| China | Cao Cao, Huang Chao, Li Zicheng, Liu Bei, An Lushan, Wu Zetian |
| Persia | Cyrus, Darius, Xerxes, Artaxerxes, Cambyses, Shahpur II |
| England | William the Conqueror, Henry II, Richard III, Cromwell, Edward I, Robin Hood |
| Aztec | Montezuma II, Cuauhtémoc, Itzcoatl, Ahuitzotl, Tlacaelel |
| Japan | Nobunaga, Hideyoshi, Ieyasu, Takeda Shingen, Uesugi Kenshin, Miyamoto Musashi |
| India | Chandragupta, Ashoka, Prithviraj Chauhan, Shivaji, Tipu Sultan, Akbar |
| France | Charlemagne, Charles Martel, Robespierre, Du Guesclin, Napoleon, Attila (ravager of Gaul) |
| Germany | Arminius, Frederick Barbarossa, Otto the Great, Odoacer, Alaric |
| Russia | Ivan the Terrible, Peter the Great, Alexander Nevsky, Pugachev, Stenka Razin |
| Ottoman | Suleiman, Mehmed II, Selim I, Osman I, Murad I |
| Spain | El Cid, Cortés, Pizarro, Gonzalo de Córdoba, Ferdinand I |
| Viking | Ragnar Lothbrok, Eric Bloodaxe, Ivar the Boneless, Harald Hardrada, Björn Ironside, Leif Erikson |

**Fantasy civs — canonical figures exist; 5–7 names each:**

| Civ | Candidate figures | Source |
|---|---|---|
| Gondor | Aragorn, Boromir, Faramir, Denethor, Isildur, Anárion, Éarnur | LotR |
| Rohan | Théoden, Éomer, Helm Hammerhand, Erkenbrand, Grimbold, Déorhere, Folca | LotR |
| Isengard | Saruman, Grima Wormtongue, Uglúk, Grishnákh, Mauhúr, Lurtz | LotR |
| Prydain | The Horned King, Dorath, Ellidyr, Morda, Pryderi, Rhuddlum | Chronicles of Prydain |
| Wakanda | N'Jadaka (Killmonger), M'Baku, N'Jobu, Moses Magnum, Achebe, Erik Stevens | Marvel |
| Avalon | Mordred, Morgan le Fay, Morgause, Meleagant, King Lot, Accolon, Galehaut | Arthurian legend |
| Narnia | Jadis, Miraz, Rabadash, Rishda Tarkaan, Ginger, Shift | Chronicles of Narnia |

**Fantasy civs requiring plan-level resolution before finalizing names:**

| Civ | Issue | Recommended resolution |
|---|---|---|
| **The Shire** | Peaceful civ; canonical "bandit" figures are limited to 4 Scouring-era characters (Lotho, Sharkey's ruffians, Bill Ferny, Ted Sandyman). | Accept 4 canonical names OR supplement with 1–3 invented Hobbit-flavored names (e.g., "Bolger the Bitter"). Plan must decide. |
| **Annuvin** | Overlaps with Prydain — shares source material. Arawn and The Horned King appear naturally in both pools. | De-duplicate: Annuvin gets Arawn, Achren, and Annuvin-specific servants; Prydain gets The Horned King, Dorath, etc. Plan must split the pool explicitly. |
| **Lothlorien** | No canonical bandit lord figures exist within Lothlorien itself. The civ's history contains peaceful elven rulers, not warlords. | Use named historical enemies of Lothlorien (e.g., Sauron's Dol Guldur lieutenants: Khamûl the Easterling, the Necromancer's shadow) OR push back and use 4 Elvish-flavored invented names. Plan must decide. |
| **Atlantis** | Plato names 10 kings (Atlas, Gadeiros, Ampheres, etc.) but they have no warrior characterization. Source material too thin for 4–7 distinct warlord names. | Use Plato's king list (Atlas, Gadeiros, Mneseus, Evaemon) plus 2–3 game-invented Atlantean-flavored names consistent with the civ's existing worldbuilding. Plan must confirm. |

The implementation plan **must include a dedicated task** to finalize every civ's name pool,
resolve the four flagged cases above, and get sign-off before the pool is written to code.

### Event

```ts
'threat:barbarian-resurgence': {
  civId: string;
  landmassId: string;
  campId: string;
  position: HexCoord;
  isBanditLord: boolean;
}
```

---

## Section 5 — Sea Raiders (Pirates)

Pirate fleets spawn from ocean tiles adjacent to the player's coastline, target coastal cities,
and move toward them each world turn.

### Spawn Trigger

Score ≥ 4.0 AND the landmass has ≥ 1 coastal city owned by `civId`.

### Spawn Position

Ocean tile adjacent to the landmass coastline, ≥ 5 tiles from any player city.
If no valid ocean spawn tile exists (landlocked landmass, all ocean tiles too close) → no spawn.

### Fleet Unit Type by Era

| Era | Unit type |
|---|---|
| 1–2 | `galley` |
| 3 | `carrack` |
| 4+ | `trireme` |

Unit created with `owner = PIRATE_OWNER` (`'pirate'`).
Seed: `state.turn * 73937 + civId.charCodeAt(0) * 13 + landmassId.charCodeAt(0) * 5`.

### `PirateFleet` Type

```ts
interface PirateFleet {
  id: string;
  unitId: string;            // Unit in state.units, owner = 'pirate'
  targetCivId: string;       // Which player this fleet pressures
  targetCityId: string;      // Nearest coastal city at spawn time
  landmassId: string;        // Which landmass is being pressured
  era: number;               // Era at spawn time, governs stakes
  plunderCooldown: number;   // Turns remaining before next plunder attempt
}
```

Stored in `GameState.pirateFleets: Record<string, PirateFleet>`. Defaults to `{}` on old saves.

### Movement (World Phase)

Every `endTurn` call (regardless of which player ended their turn), each active fleet:
1. Moves one step along ocean/coast tiles toward `targetCityId` using shortest path.
2. If adjacent to target city's coast tile: attempt plunder or siege (see below).
3. If `targetCityId` is no longer valid (city captured/destroyed): retarget to nearest
   coastal city owned by `targetCivId`. If none exists, fleet is removed.

### Plunder & Siege by Era

| Era | On reaching city coast |
|---|---|
| 1 | Plunder only: steals `city.population × 5` gold from `targetCivId`. No HP damage. |
| 2 | Plunder + light siege: steals gold AND reduces city HP by 10. HP recovers normally. |
| 3+ | Plunder + hard siege: steals gold AND reduces city HP by 20. HP does **not** auto-recover while fleet is adjacent (must be destroyed or driven off). |

On arrival at the city's coast tile, `plunderCooldown` starts at 0 (can plunder immediately).
Plunder fires when `plunderCooldown === 0`, then sets `plunderCooldown = 3`.
Cooldown decrements by 1 each world turn.
Siege damage (era 2+) fires every world turn the fleet is adjacent to the city, independently
of the plunder cooldown — the fleet pillages gold on a cycle AND damages HP continuously.

### Hot-Seat Behavior

- Fleet's `targetCivId` targets one specific player's cities and ignores all others' cities.
- Any player's unit can attack and destroy a pirate fleet (intentional — cross-player cooperation).
  Pirate units must be valid attack targets for ALL human players, not just `targetCivId`.
  The `attack-targeting.ts` system must treat `PIRATE_OWNER` units as neutral hostiles attackable
  by any civ, the same way barbarian units are.
- Fleet only spawns during `targetCivId`'s End Turn evaluation.

### Destruction & Cooldown

When a pirate fleet's unit is killed in combat:
1. Remove `state.pirateFleets[fleetId]`.
2. Set `state.pirateFleetCooldownByCivLandmass['${civId}:${landmassId}'] = state.turn + 10`.

`pirateFleetCooldownByCivLandmass: Record<string, number>` on `GameState`. Defaults to `{}`.

### Spawn Cap

Max 2 pirate fleets targeting the same (civ, landmassId) simultaneously. Checked before spawning.

### Events

```ts
'threat:pirate-fleet-spawned': { fleetId: string; civId: string; landmassId: string; position: HexCoord }
'threat:pirate-plunder':       { fleetId: string; cityId: string; goldStolen: number }
'threat:pirate-siege':         { fleetId: string; cityId: string; hpLost: number }
'threat:pirate-fleet-destroyed': { fleetId: string; civId: string; landmassId: string }
```

---

## Section 6 — State Changes

### `CivilizationState` (additions)

```ts
lastCombatTurnByLandmass?: Record<string, number>;
```

### `BarbarianCamp` (addition)

```ts
resurgent?: boolean;  // true if spawned by threat-pressure-system, not game-start
```

### `GameState` (additions)

```ts
pirateFleets?: Record<string, PirateFleet>;
pirateFleetCooldownByCivLandmass?: Record<string, number>;   // key: '${civId}:${landmassId}'
resurgentCampCooldownByCivLandmass?: Record<string, number>; // key: '${civId}:${landmassId}'
```

### New Constant

```ts
// threat-pressure-system.ts
export const PIRATE_OWNER = 'pirate';
```

### `PIRATE_OWNER` Audit — All Sites to Update

Every filter that excludes non-player owners must add `PIRATE_OWNER`:

| File | Line | Current filter | Required addition |
|---|---|---|---|
| `turn-manager.ts` | ~503 | `!== 'barbarian' && !== BEAST_OWNER && !startsWith('mc-')` | `&& !== PIRATE_OWNER` |
| `turn-manager.ts` | ~612 | `!== BEAST_OWNER && !== 'barbarian'` | `&& !== PIRATE_OWNER` |
| `combat-reward-system.ts` | ~67 | `!== 'barbarian' && !== 'rebels' && !== 'beasts'` | `&& !== PIRATE_OWNER` |

The implementation plan must include an explicit audit step: `grep -rn "!== 'barbarian'\|startsWith('mc-')\|BEAST_OWNER"` to catch any additional sites before any pirate unit is created.

---

## Section 7 — Turn Manager Wiring

### Spawn Phase (per-civ, after barbarian resolution)

```
processThreatPressure(state, currentCivId, bus):
  if currentCivId is not a human player → return unchanged state
  for each landmassId where currentCivId has ≥ 1 city:
    score = computeThreatScore(state, currentCivId, landmassId)
    if score ≥ 2.5: processLandResurgence(state, currentCivId, landmassId, bus)
    if score ≥ 4.0: processPirateSpawn(state, currentCivId, landmassId, bus)
```

Inserted in `turn-manager.ts` after the barbarian resolution block (~line 570), before beast processing.

### World Phase (every endTurn call, after beast processing)

```
processPirateFleets(state, bus):
  for each fleet in state.pirateFleets:
    move fleet one step toward targetCityId
    if adjacent to city coast: applyPlunderOrSiege(fleet, state, bus)
    if fleet unit no longer in state.units: remove fleet + set cooldown
```

---

## Section 8 — Visual Treatment for Pirate Units

Pirates reuse existing naval unit sprites (`galley` → era 1–2, `carrack` → era 3, `trireme` → era 4).
No new sprite needed — the visual distinction comes from faction palette.

The renderer already assigns colors based on `unit.owner`. Pirate units (`owner === PIRATE_OWNER`)
receive the hostile-red palette currently used for barbarian units. A player's galley is blue/gold;
a pirate galley is red/dark. Visually unambiguous, zero new art required.

**Required renderer change:** In the unit color/palette lookup, add a case for `PIRATE_OWNER`
mapping to the existing barbarian hostile palette (same as `'barbarian'`).

---

## Section 9 — Notifications (UX Copy)

All notifications route through the existing council/advisor notification system.

| Event | Notification text |
|---|---|
| Barbarian resurgence (standard) | "Your long dominance has invited trouble — raiders have regrouped in the wilderness near [City Name]." |
| Bandit lord | "A notorious bandit lord has emerged near [City Name]. Defeat them for a substantial reward." |
| Pirate fleet spawned | "Pirates have been spotted off the coast near [City Name]. Your coastal cities are at risk." |
| Pirate plunder | "[City Name] was raided by pirates — [N] gold stolen." |
| Pirate siege | "Pirates are besieging [City Name]. Drive them off or your city will suffer." |
| Pirate fleet destroyed | "Your forces have destroyed the pirate fleet threatening [City Name]." |

---

## Section 10 — Sound Effects

All SFX follow the existing synthesized-audio pattern (Web Audio API, same approach as beast SFX).
No placeholder audio — all four SFX are fully specified below and required by MR end.

### `threat:barbarian-resurgence` — Resurgence Drum

A low, distant war-drum roll building to a single heavy strike.
- Waveform: two `triangle` oscillators at 80 Hz and 120 Hz, slightly detuned (+3 cents)
- Envelope: 0 → 0.6 gain over 0.3 s, hold 0.2 s, decay to 0 over 0.8 s
- A `BiquadFilterNode` (lowpass, cutoff 300 Hz) keeps it earth-toned and not jarring for kids
- Total duration: ~1.3 s

### `threat:pirate-fleet-spawned` — Sea Horn

A deep, foghorn-like bleat evoking something spotted on the horizon.
- Waveform: `sawtooth` oscillator at 55 Hz, pitched up by a perfect fifth (+7 semitones) over 0.4 s
- Envelope: 0 → 0.5 gain over 0.2 s, hold 0.5 s, decay to 0 over 0.6 s
- Light reverb via `ConvolverNode` (small impulse, wet mix 0.3)
- Total duration: ~1.3 s

### `threat:pirate-plunder` — Coin Theft Jingle (negative)

Descending three-note motif conveying loss — like coins spilling away.
- Three `sine` tones in sequence: E4 (330 Hz) → C4 (262 Hz) → A3 (220 Hz)
- Each note: 0.15 s duration, 10 ms crossfade, gain 0.4
- Light distortion (`WaveShaperNode`, soft clip) gives a slightly jangling, unsatisfying quality
- Total duration: ~0.5 s

### `threat:pirate-fleet-destroyed` — Victory Splash

Short triumphant crash + water-rush, rewarding the kill.
- White noise burst (0.08 s, gain 0.7) — the impact
- Followed by a rising `sine` sweep from 200 Hz → 800 Hz over 0.3 s (gain 0.3) — the rush
- Envelope: instant attack, decay to 0 over 0.4 s total
- Total duration: ~0.5 s

---

## Section 11 — Save Migration Summary

All migration runs in `migrateLegacySave()` in `main.ts` (for existing saves) and
`normalizeLoadedState()` for normalization:

| Field | Default on old save | Where set |
|---|---|---|
| `HexTile.regionKey` | Flood-fill computed | `normalizeLandmassKeys()` in save-manager |
| `civ.lastCombatTurnByLandmass` | `{}` (idle = 0 on first access) | `migrateLegacySave()` |
| `GameState.pirateFleets` | `{}` | `migrateLegacySave()` |
| `GameState.pirateFleetCooldownByCivLandmass` | `{}` | `migrateLegacySave()` |
| `GameState.resurgentCampCooldownByCivLandmass` | `{}` | `migrateLegacySave()` |
| `BarbarianCamp.resurgent` | `undefined` (treated as false) | No migration needed; existing camps are non-resurgent by default |

Solo saves and hot-seat saves go through the same migration path.

---

## Section 12 — Hot-Seat Summary

| Behavior | Rule |
|---|---|
| Who gets threat evaluation | Only human-player civs (checked via `hotSeat.players[].isHuman` or solo detection) |
| When spawn phase runs | When that civ ends their turn (`currentCivId === targetCivId`) |
| When pirate movement runs | Every `endTurn` call — world phase, not per-player |
| Whose cities pirates target | The `targetCivId` set at spawn time — only that player's cities |
| Who can fight pirates | Any player's units — cross-player cooperation is intentional |
| Idle timer in multi-player | `state.turn` advances per player press; faster idle buildup in hot-seat is intentional (more players = more shared world activity) |

---

## Section 13 — Testing

### Unit Tests (`tests/systems/threat-pressure-system.test.ts`)

- `computeThreatScore` returns correct value for known inputs across all era/share/idle combinations.
- `empireShare` returns 0 for no territory, ~1 for fully controlled landmass.
- `nearestLandmassId` finds correct landmass from ocean tile; returns null beyond 10 tiles.
- Score does not compute for AI civ (returns 0 or is never called).

### Integration Tests (`tests/core/threat-pressure-integration.test.ts`)

- **Land resurgence:** Create state with cleared continent, advance 15 turns, verify resurgent camp spawns.
- **Resurgence cap:** Advance further, verify max 2 resurgent camps, 3rd does not spawn.
- **Cooldown:** Destroy a camp, verify new spawn blocked for 8 turns.
- **Pirate spawn:** High score on coastal landmass → fleet appears in `pirateFleets`.
- **Pirate movement:** Fleet advances toward coastal city each turn.
- **Pirate plunder:** Fleet reaches city → gold deducted from civ.
- **Pirate destruction:** Killing fleet unit removes fleet + sets cooldown.
- **Hot-seat isolation:** Player A idle on landmass, Player B active → A gets threats, B does not.
- **Multi-landmass:** Player with cities on 2 landmasses → each evaluated independently.

### Save Migration Test (`tests/storage/save-migration.test.ts`)

- Load save fixture with no `regionKey` on tiles → all land tiles have `regionKey` after `normalizeLoadedState`.
- Load save with no `lastCombatTurnByLandmass` → field initialized to `{}`.
- Load save with no `pirateFleets` → field initialized to `{}`.

### Balance Test (`tests/systems/threat-pressure-balance.test.ts`)

Verifies score thresholds produce intended gameplay:
- Era 1 with 1 city and 0 idle turns: score < 2.5 (no spawns yet).
- Era 2 with ≥ 6 idle turns and >50% territory: score ≥ 2.5 (land resurgence eligible).
- Era 2 with ≥ 10 idle turns and >70% territory + coastal city: score ≥ 4.0 (pirate eligible).
- Era 3 dominant + 15 idle turns: score > 8 (bandit lord eligible).

---

## Implementation Sequence

This feature should be implemented incrementally:

**MR1 — Landmass Tagging**
Populate `HexTile.regionKey` in all three generators + save migration. No gameplay change.
Tests: flood-fill unit tests + save migration fixture.

**MR2 — Threat Score + Combat Tracking**
`computeThreatScore`, `empireShare`, `nearestLandmassId`, `lastCombatTurnByLandmass` tracking.
Pure functions, no spawning yet. Tests: all unit tests for score and tracking.

**MR3 — Land Resurgence**
`processLandResurgence` + `resurgent` flag on camps + cooldown state + turn-manager wiring.
`PIRATE_OWNER` audit happens here to future-proof even before pirates.
Tests: integration tests for resurgence cap, cooldown, era strength.

**MR4 — Sea Raiders**
`PirateFleet`, `processPirateSpawn`, `processPirateFleets`, plunder/siege logic, destruction + cooldown.
Renderer hostile-tint for `PIRATE_OWNER` (reuses barbarian palette — no new sprites).
All four SFX synthesized and wired to their events (§10).
Tests: all pirate integration tests.

By the end of MR4 there are no placeholder sprites, animations, text, SFX, UI, or UX elements —
every player-visible part of the system is production-ready.
