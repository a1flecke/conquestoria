# Tech Era Expansion — Eras 5–7 Design

**Date:** 2026-06-20
**Issue:** [#356](https://github.com/a1flecke/conquestoria/issues/356)
**Balance rules:** `.claude/rules/game-balance.md` (living policy, enforced by tests)

---

## Scope

Expand the tech tree from era 4 through era 7 across all 15 tracks, introducing three new historical eras, a new National Project building mechanic, era-appropriate wonders, and special conditional buildings. Delivered as three sequential PRs.

| Era | Name | Historical period |
|---|---|---|
| 5 | Renaissance | 1400–1600 |
| 6 | Gunpowder Age | 1600–1750 |
| 7 | Industrial Revolution | 1750–1850 |

---

## Stub Remediation

Six existing era 5 stubs are **relocated** — `era` field bumped, `prerequisites` set to `[]` (floating, unreachable until those eras get content):

| Tech ID | Old era | New era | Reason |
|---|---|---|---|
| `global-logistics` | 5 | 10 | Containerized logistics is 1956+ (McLean shipping container) |
| `nuclear-theory` | 5 | 11 | Atomic Age |
| `mass-media` | 5 | 9 | Broadcast media is 20th century |
| `digital-surveillance` | 5 | 11 | Cold War SIGINT |
| `cyber-warfare` | 5 | 12 | Information Age |
| `amphibious-warfare` | 5 | 9 | Coordinated beach landings are WWII doctrine |

Three existing era 5 wonders reference the relocated techs and move with them:

| Wonder | New era |
|---|---|
| `storm-signal-spire` | 9 |
| `manhattan-project` | 11 |
| `internet` | 12 |

**Test coverage:** `tests/systems/tech-unlocks-consistency.test.ts` will catch any `unlocksBuildings`/`unlocksUnits` dangling references. Add a new assertion to `wonder-definitions.test.ts` that none of the active (era ≤ 7) wonders reference relocated tech IDs.

---

## Era Label Fix

`src/ui/tech-panel.ts` `getEraLabel()` replaces the hardcoded era 5 check with a lookup table covering eras 1-12 so no future era requires another special case:

```ts
const ERA_NAMES: Record<number, string> = {
  1: 'Stone Age', 2: 'Bronze Age', 3: 'Iron Age', 4: 'Classical',
  5: 'Renaissance', 6: 'Gunpowder Age', 7: 'Industrial Revolution',
  8: 'Nationalist Era', 9: 'Modern', 10: 'Atomic Age',
  11: 'Cold War', 12: 'Information Age',
};
getEraLabel(era: number): string {
  return ERA_NAMES[era] ?? `Era ${era}`;
}
```

**Test:** assert `getEraLabel(5) === 'Renaissance'` and `getEraLabel(99) === 'Era 99'` (no hardcoded fallback gap).

---

## Cost Scaling

| Era | Base cost range |
|---|---|
| 5 | 140–165 |
| 6 | 215–240 |
| 7 | 320–340 |

Era advancement requires completing 60% of the era's `countsForEraAdvancement !== false` techs. At 2 techs per track × 15 tracks = 30 techs per era, players need to complete 18 to advance — roughly the depth of 9 fully explored tracks.

---

## File Structure — tech-definitions.ts Splitting

`tech-definitions.ts` currently has 184 lines. Adding 90 new techs brings it to ~500 lines. Split by era group at the PR 1 boundary:

- `src/systems/tech-definitions-eras1-4.ts` — existing content (moved)
- `src/systems/tech-definitions-eras5-7.ts` — new content (PR 1 creates this)
- `src/systems/tech-definitions.ts` — re-exports `TECH_TREE` as the concatenated union, keeping the public API unchanged

This keeps each file readable and sets a pattern for eras 8-12.

---

## New Entities

### New Unit Types (3)

Full wiring required for each: `UnitType` union, definition in `unit-system.ts`, icon in `PRODUCTION_ICONS`, AI training logic, death cleanup, tech-gated dequeue, unit-renderer icon.

| Unit | Type ID | Era | Unlocked by | Obsoletes | Domain |
|---|---|---|---|---|---|
| Cannon | `cannon` | 5 | `black-powder` | `catapult`, `ballista` | land, siege/bombard |
| Grenadier | `grenadier` | 6 | `line-infantry` | — | land, melee |
| Rifleman | `rifleman` | 7 | `rifle-tactics` | `musketeer`, `crossbowman` | land, ranged |

**Animations:** Each new unit needs at minimum idle, move, and attack animation states. Cannon fires with a recoil animation; rifleman uses a fire-and-reload cycle. These should follow the existing sprite animation class reference in `.claude/rules/sprites.md`.

**SFX:** Cannon → low boom on attack (distinct from catapult thud). Grenadier → short explosion burst. Rifleman → sharp crack. All three should have separate SFX IDs registered in the audio system so they don't share catapult/arrow sounds.

### New Regular Buildings (14)

Each requires: entry in `BUILDINGS`, icon in `PRODUCTION_ICONS`. `stock_exchange` is already wired — rewired from defunct stub to new era 6 `joint-stock-companies` tech.

| Building | ID | Era | Track | Yields |
|---|---|---|---|---|
| Guildhall | `guildhall` | 5 | economy | +2 production, +1 gold |
| University | `university` | 5 | science | +4 science |
| Art Gallery | `art_gallery` | 5 | arts | +2 gold, +1 science |
| Blast Furnace | `blast_furnace` | 5 | metallurgy | +3 production |
| Distillery | `distillery` | 5 | agriculture | +2 gold |
| Monastery | `monastery` | 5 | spirituality | +1 science, +1 gold |
| Courthouse | `courthouse` | 6 | civics | +1 gold |
| Philosophical Society | `philosophical_society` | 6 | philosophy | +2 science, +1 gold |
| Grand Cathedral | `grand_cathedral` | 6 | arts | +1 production, +2 science |
| Laboratory | `laboratory` | 6 | science | +3 science |
| Factory | `factory` | 7 | economy | +5 production |
| Hospital | `hospital` | 7 | medicine | +3 food |
| Railway Station | `railway_station` | 7 | exploration | +2 production |
| Conservatory | `conservatory` | 7 | arts | +3 science |

---

## Tech Definitions — All 15 Tracks, Eras 5–7

90 new tech definitions total (15 tracks × 2 techs × 3 eras). All live in `src/systems/tech-definitions-eras5-7.ts`.

### Military
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `black-powder` | 5 | 150 | siege-warfare, tactics | unlocksUnits: cannon; "Gunpowder replaces classical siege engines" |
| `professional-army` | 5 | 145 | tactics | "Defending units in cities +10% strength" |
| `line-infantry` | 6 | 225 | black-powder, professional-army | unlocksUnits: grenadier |
| `military-doctrine` | 6 | 220 | professional-army | "All units pay 20% less upkeep" |
| `rifle-tactics` | 7 | 330 | line-infantry | unlocksUnits: rifleman; obsoletes musketeer + crossbowman |
| `general-staff` | 7 | 325 | military-doctrine, line-infantry | "+10% combat strength all units empire-wide" |

### Economy
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `guilds` | 5 | 150 | banking, currency | unlocksBuildings: guildhall; "+1 gold per active trade route" |
| `colonial-trade` | 5 | 145 | trade-routes, banking | "Trade routes to foreign civs yield +2 gold" |
| `joint-stock-companies` | 6 | 225 | guilds, colonial-trade | unlocksBuildings: stock_exchange; "+1 trade route capacity per city" |
| `mercantilism` | 6 | 220 | guilds | "+25% gold in cities with marketplace or bank" |
| `industrial-capital` | 7 | 330 | joint-stock-companies, mercantilism | unlocksBuildings: factory |
| `labour-markets` | 7 | 325 | mercantilism | "+1 production per 3 population in each city" |

### Science
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `scientific-method` | 5 | 155 | astronomy, medicine | unlocksBuildings: university; "+1 science per library empire-wide" |
| `optics` | 5 | 150 | astronomy | "+1 vision all units" |
| `natural-history` | 6 | 230 | scientific-method | "+1 science from mines and farms" |
| `chemistry` | 6 | 235 | optics, natural-history | unlocksBuildings: laboratory; "Explosive units +5% strength" |
| `thermodynamics` | 7 | 335 | chemistry | "+20% production in cities with a factory" |
| `geology` | 7 | 330 | natural-history | "+1 production from all mines" |

### Civics
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `civic-humanism` | 5 | 150 | political-philosophy, drama-poetry | "+5% gold empire-wide" |
| `constitutional-law` | 5 | 145 | political-philosophy | "Cities claim +1 extra territory tile" |
| `social-contract` | 6 | 225 | civic-humanism, constitutional-law | "+5% science empire-wide" |
| `separation-of-powers` | 6 | 220 | constitutional-law | unlocksBuildings: courthouse |
| `nationalism` | 7 | 330 | social-contract | "+15% combat in own territory" |
| `civil-rights` | 7 | 325 | separation-of-powers, social-contract | "+10% population growth all cities" |

### Exploration
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `circumnavigation` | 5 | 150 | exploration-tech | "+2 gold per coastal city; naval units cross all oceans" |
| `colonial-charter` | 5 | 145 | military-logistics, exploration-tech | "Settlers found cities 50% faster on distant continents" |
| `trade-winds` | 6 | 225 | circumnavigation | "+1 movement all naval units" |
| `land-survey` | 6 | 220 | colonial-charter | "Scouts reveal terrain 2 hexes further" |
| `railway-expansion` | 7 | 330 | land-survey, military-logistics | unlocksBuildings: railway_station; "Units move at double speed on roads" |
| `global-mapping` | 7 | 325 | trade-winds, circumnavigation | "+1 vision all units; trade routes grant +1 science" |

### Agriculture
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `distillation` | 5 | 140 | agricultural-science | unlocksBuildings: distillery; "Wine/grain tiles yield +1 gold" |
| `plantation-farming` | 5 | 145 | selective-breeding | "+1 food from all luxury resource tiles" |
| `enclosure-acts` | 6 | 220 | plantation-farming, distillation | "All farms yield +1 production" |
| `soil-science` | 6 | 215 | agricultural-science | "+1 food all farms" |
| `mechanized-plowing` | 7 | 320 | enclosure-acts, soil-science | "Farms yield +2 food and +1 production" |
| `crop-breeding` | 7 | 325 | soil-science | "+2 food base yield per city" |

### Medicine
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `herbalist-guilds` | 5 | 145 | apothecary | "Units heal +2 HP/turn when idle in friendly territory" |
| `surgical-texts` | 5 | 140 | anatomy | "Units in cities heal 50% faster" |
| `public-health-boards` | 6 | 220 | herbalist-guilds, surgical-texts | "+10% population growth all cities" |
| `epidemic-control` | 6 | 215 | public-health-boards | "Cities immune to plague propagation" |
| `vaccination` | 7 | 320 | epidemic-control | "+15% population growth all cities" |
| `medical-colleges` | 7 | 325 | epidemic-control, public-health-boards | unlocksBuildings: hospital |

### Philosophy
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `empiricism` | 5 | 145 | natural-philosophy | "+1 science all cities" |
| `rationalism` | 5 | 150 | humanism | "+5% gold empire-wide" |
| `enlightenment-thought` | 6 | 225 | empiricism, rationalism | unlocksBuildings: philosophical_society; "+5% research speed" |
| `social-philosophy` | 6 | 220 | rationalism | "Non-aggression pacts last +5 turns" |
| `positivism` | 7 | 325 | enlightenment-thought | "+2 science all cities" |
| `utilitarianism` | 7 | 320 | social-philosophy, enlightenment-thought | "+1 to all yields in capital" |

### Arts
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `renaissance-painting` | 5 | 145 | theater | unlocksBuildings: art_gallery; "+1 gold per culture building empire-wide" |
| `classical-music-form` | 5 | 150 | theater | "+1 science per culture building empire-wide" |
| `baroque-architecture` | 6 | 225 | renaissance-painting, architecture-arts | unlocksBuildings: grand_cathedral; "+1 production per culture building" |
| `opera-houses` | 6 | 220 | classical-music-form | "+2 gold all cities" |
| `romanticism` | 7 | 325 | baroque-architecture, opera-houses | "+10% all trade route gold" |
| `fine-arts-academy` | 7 | 330 | romanticism | unlocksBuildings: conservatory |

### Maritime
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `deep-sea-routes` | 5 | 150 | caravels | "+1 gold per coastal city; naval trade reaches foreign continents" |
| `naval-gunnery` | 5 | 155 | naval-warfare | "Naval combat units +5 strength" |
| `merchant-fleets` | 6 | 225 | deep-sea-routes | "+1 trade route capacity per city with harbor" |
| `squadron-tactics` | 6 | 230 | naval-gunnery | "+10% naval combat when adjacent to another naval unit" |
| `ironclad-doctrine` | 7 | 330 | squadron-tactics | "Steamships +10 strength; naval units ignore zone-of-control" |
| `naval-supremacy` | 7 | 325 | merchant-fleets, naval-gunnery | "+2 gold per coastal city; +1 movement all naval units" |

### Metallurgy
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `blast-furnace-tech` | 5 | 150 | steel-forging | unlocksBuildings: blast_furnace; "+1 production all cities with iron" |
| `cannon-casting` | 5 | 155 | steel-forging, armor-craft | "Siege units +5 strength; cannon production cost −15%" |
| `steel-production` | 6 | 225 | blast-furnace-tech, cannon-casting | "+1 production all cities" |
| `rifling` | 6 | 230 | cannon-casting | "Ranged units +5 strength" |
| `bessemer-process` | 7 | 330 | steel-production | "+2 production all cities" |
| `precision-machining` | 7 | 335 | rifling, steel-production | "All military units +5% strength" |

### Construction
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `renaissance-architecture` | 5 | 145 | city-planning, fortresses | "+1 production per civic/culture building" |
| `vaulted-ceilings` | 5 | 150 | arches | "+1 science per civic building" |
| `baroque-monuments` | 6 | 225 | renaissance-architecture | "+2 gold per wonder built in empire" |
| `urban-planning` | 6 | 220 | city-planning, vaulted-ceilings | "+1 production from each citizen worked tile" |
| `iron-construction` | 7 | 330 | urban-planning, bessemer-process | "All buildings cost 15% less production" |
| `city-infrastructure` | 7 | 325 | urban-planning, baroque-monuments | "+1 all yields per 5 population in each city" |

### Communication
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `printing-press` | 5 | 145 | printing | "+1 science all cities with library; tech research −5% cost" |
| `postal-service` | 5 | 150 | diplomats, courier-networks | "+1 gold per city" |
| `newspaper-industry` | 6 | 225 | printing-press, postal-service | "+2 science empire-wide" |
| `diplomatic-telegraph` | 6 | 220 | postal-service | "Peace treaties last +5 turns" |
| `telegraph-network` | 7 | 330 | diplomatic-telegraph | "+2 gold all cities; units +1 sight near roads" |
| `press-freedom` | 7 | 325 | newspaper-industry | "+2 science all cities" |

### Espionage
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `black-chambers` | 5 | 155 | cryptography, counter-intelligence | "+1 spy slot; decrypt foreign messages (new mission)" |
| `diplomatic-networks` | 5 | 150 | counter-intelligence | "Spy missions in foreign capitals +20% success rate" |
| `double-agents` | 6 | 235 | black-chambers, diplomatic-networks | "+1 spy slot; double-cross mission unlocks" |
| `covert-operations` | 6 | 230 | black-chambers | "Steal Tech mission unlocks; Assassination mission unlocks" |
| `secret-police` | 7 | 335 | double-agents | "Cities with security bureau auto-detect foreign spies each turn" |
| `state-intelligence` | 7 | 330 | covert-operations, double-agents | "Spy success +25%; spy mortality −50%" |

### Spirituality
| Tech ID | Era | Cost | Prerequisites | Key effect |
|---|---|---|---|---|
| `reformation` | 5 | 145 | theology-tech, pilgrimages | "+2 science in cities with temple" |
| `monastic-orders` | 5 | 150 | theology-tech | unlocksBuildings: monastery; "+1 science +1 gold per city with temple" |
| `religious-tolerance` | 6 | 225 | reformation, monastic-orders | "Cities with multiple religions get +2 gold" |
| `secular-governance` | 6 | 220 | reformation | "+5% all city yields" |
| `ecumenism` | 7 | 325 | religious-tolerance | "+5% science empire-wide" |
| `liberation-theology` | 7 | 330 | secular-governance, religious-tolerance | "+1 food +1 production all cities" |

---

## National Project System (New Mechanic)

### Concept

National Projects are buildings that:
- Can be built by **every civilization** (unlike Legendary Wonders which are first-come-first-served globally)
- Can only be built **once per empire** (`uniquePerEmpire: true`)
- Are only **available to build** during `homeEra` and `homeEra + 1`
- Have **time-limited effects** that fade and expire

### Lifecycle

```
Era of build (eraBuilt):     100% yield
eraBuilt + 1:                100% yield
eraBuilt + 2:                50% yield  (fading)
eraBuilt + 3+:               expired — removed from city, event fired
```

**Build window:** shown in production queue when `currentEra ∈ { homeEra, homeEra + 1 }`. When `currentEra > homeEra + 1`, the entry disappears permanently and any in-progress build in the queue is **silently dequeued** with a notification: *"[Project name] is no longer available — your civilization has moved beyond this era."*

**Strategic tension:** rushing to the next era costs you the current era's national projects. Lingering secures the project but delays advancement.

### Architecture

**`src/core/types.ts` — new fields:**
```ts
// Top-level GameState (mirrors completedLegendaryWonders pattern):
builtNationalProjects?: Record<string, {  // keyed by buildingId
  civId: string;
  cityId: string;   // physical host city
  eraBuilt: number;
}>;

// Building type — new fields:
uniquePerEmpire?: boolean;
nationalProject?: { homeEra: number };
requiresBuildings?: string[];  // chain prereq for special buildings
```

`City.buildings` continues to hold the building ID — the national project physically resides in the host city and contributes to that city's production (regular `yields`). Empire-wide effects are computed separately via `civYieldBonus` on the building definition.

**`src/systems/national-project-system.ts` (new file):**

```ts
export function getNationalProjectCivYieldBonus(state, civId): Partial<ResourceYield>
// Iterates state.builtNationalProjects for civId entries.
// Computes multiplier = getNationalProjectMultiplier(currentEra, eraBuilt).
// Returns summed civYieldBonus × multiplier across all active projects.

export function getNationalProjectMultiplier(currentEra, eraBuilt): 0 | 0.5 | 1
// 0 → expired (currentEra - eraBuilt >= 3)
// 0.5 → fading (delta === 2)
// 1 → full

export function expireNationalProjects(state, newEra): ExpiredProject[]
// Called by turn-manager on era:advanced.
// Finds all builtNationalProjects where newEra - eraBuilt >= 3.
// Removes from state.builtNationalProjects AND from host city.buildings[].
// Returns list of { civId, cityId, buildingId } for event firing.
```

`getNationalProjectCivYieldBonus` is wired into the same yield-aggregation path as `getLegendaryWonderCivYieldBonus` in `legendary-wonder-system.ts` — both are summed in the economy system's per-civ yield computation.

**`src/systems/city-system.ts`:**
- Production queue filter: hide national projects where `currentEra > homeEra + 1` OR already in `state.builtNationalProjects` for this civ
- On production completion of a national project: write to `state.builtNationalProjects` AND `city.buildings`
- `uniquePerEmpire` check before queueing: scan `state.builtNationalProjects` across all cities of this civ

**`src/core/turn-manager.ts` (era advancement hook):**
```ts
const expired = expireNationalProjects(state, newEra);
for (const { civId, cityId, buildingId } of expired) {
  emitEvent('city:national-project-expired', { civId, cityId, buildingId });
  // Also dequeue any in-progress builds of this building across civ's cities
}
```

### AI Behavior

The AI must:
- Recognize national projects as high-value targets during their build window
- Prioritize based on effect alignment: science-focused civs prioritize Royal Academy/Institute of Science; military civs prioritize Artillery Corps HQ/Military Academy
- Never queue a national project when `currentEra > homeEra + 1` (the queue filter enforces this, but AI logic should not attempt it)
- Not exclusively chase national projects — they compete with regular buildings and units in the AI's production queue priority

Implement in `src/ai/basic-ai.ts` alongside the existing build-queue scoring logic.

### UI Specification

**In the production queue / city panel:**
- National projects appear in a dedicated **"National Projects"** section in the build chooser, above regular buildings
- Projects outside the build window are hidden entirely (not greyed out — they don't exist for the player at that point)
- Active national project in city panel shows `⏳ [Name] (fading)` badge when multiplier is 0.5
- Tooltip on fading badge: "This institution is losing relevance. It will expire in [N] eras."

**Notifications:**
- Completion: standard build-complete notification. No special ceremony (wonders get ceremonies; national projects are quieter).
- Expiry: fires `city:national-project-expired` → routed to notification log AND a one-turn banner: *"[Name] has expired in [City]. Your civilization has outgrown this era's institutions."*
- Mid-queue dequeue (window closed): notification log only, no banner — low drama since the player should have seen it coming.

**Discovery:** National projects appear in the tech panel's unlock list for their gating techs (same as buildings). No separate discovery moment needed — players encounter them naturally when researching the prerequisite tech.

### SFX

- National project completed: reuse the standard building-complete sound
- National project expiry: a short, quiet "fade away" chime (distinct from building-demolished). Register as `sfx:national-project-expired` in the audio system.
- No fanfare for fading — just the `(fading)` visual label is sufficient.

### National Projects — All 7 Eras (3 per era)

All `civYieldBonus` effects are empire-wide flat values. Per-city or per-route scaling must be in the allowlist in `.claude/rules/game-balance.md`.

**Era 1 (Stone Age) — homeEra: 1**

| Project | Building ID | Req techs | Cost | Effect |
|---|---|---|---|---|
| Sacred Grove | `sacred_grove` | animism, foraging | 40 | Wounded units heal +2 HP/turn in friendly territory |
| Tribal Muster Ground | `tribal_muster_ground` | stone-weapons, tribal-council | 45 | Warrior and axeman training cost −20% |
| Communal Stores | `communal_stores` | gathering, pottery | 40 | `civYieldBonus: { food: 2 }` |

**Era 2 (Bronze Age) — homeEra: 2**

| Project | Building ID | Req techs | Cost | Effect |
|---|---|---|---|---|
| Grand Bazaar | `grand_bazaar` | animal-husbandry, pottery | 80 | +1 gold per city *(allowlisted: era 2 empire ≤ 4 cities)* |
| Foundry Guild | `foundry_guild` | bronze-working, smelting | 85 | Bronze-class units +2 strength |
| Scribes' Hall | `scribes_hall` | writing, irrigation | 80 | `civYieldBonus: { science: 2 }` |

**Era 3 (Iron Age) — homeEra: 3**

| Project | Building ID | Req techs | Cost | Effect |
|---|---|---|---|---|
| Philosopher's Circle | `philosophers_circle` | philosophy, writing | 120 | `civYieldBonus: { science: 3 }` |
| Road Corps | `road_corps` | road-building, engineering | 125 | Roads built 50% faster; trade routes yield +1 gold |
| Iron Legion | `iron_legion` | iron-forging, fortification | 120 | All military units +5% combat strength |

**Era 4 (Classical) — homeEra: 4**

| Project | Building ID | Req techs | Cost | Effect |
|---|---|---|---|---|
| Imperial Archive | `imperial_archive` | printing, astronomy | 160 | `civYieldBonus: { science: 3 }` |
| Praetorian Legion | `praetorian_legion` | tactics, civil-service | 165 | Military units in cities with barracks +10% strength |
| Royal Mint | `royal_mint` | banking, trade-routes | 160 | `civYieldBonus: { gold: 3 }` |

**Era 5 (Renaissance) — homeEra: 5**

| Project | Building ID | Req techs | Cost | Effect |
|---|---|---|---|---|
| Royal Academy | `royal_academy` | scientific-method, civic-humanism | 205 | `civYieldBonus: { science: 4 }` |
| Artillery Corps HQ | `artillery_corps_hq` | black-powder, professional-army | 210 | Cannon units train with +5 strength |
| Explorers' Guild | `explorers_guild` | circumnavigation, colonial-charter | 205 | `civYieldBonus: { gold: 3 }`; scouts +1 vision |

**Era 6 (Gunpowder Age) — homeEra: 6**

| Project | Building ID | Req techs | Cost | Effect |
|---|---|---|---|---|
| Colonial Administration | `colonial_administration` | colonial-charter, separation-of-powers | 260 | +2 gold per city beyond your 4th *(allowlisted: rewards expansion, self-limiting; max ~+12 gold at peak empire size)* |
| Grand Cipher Bureau | `grand_cipher_bureau` | black-chambers, counter-intelligence | 255 | Spy missions +15% success rate empire-wide |
| Military Academy | `military_academy` | line-infantry, military-doctrine | 260 | All military units start with +5% combat strength |

**Era 7 (Industrial Revolution) — homeEra: 7**

| Project | Building ID | Req techs | Cost | Effect |
|---|---|---|---|---|
| National Railway | `national_railway` | railway-expansion, thermodynamics | 360 | Trade routes yield +2 gold; +1 production in cities with railway station |
| Public Health Service | `public_health_service` | vaccination, medical-colleges | 355 | `civYieldBonus: { food: 3, science: 2 }` |
| Institute of Science | `institute_of_science` | thermodynamics, geology | 360 | `civYieldBonus: { science: 4 }` |

---

## New Legendary Wonders (9)

All follow the existing two-step quest pattern. Active era ≤ 7 wonders must not reference relocated tech IDs (enforced by test). Balance ceiling: `civYieldBonus` single key ≤ 5 (eras 5-6) / ≤ 6 (era 7). See `.claude/rules/game-balance.md`.

### Era 5 — productionCost 220

**Sistine Vault** (`sistine-vault`)
- `requiredTechs`: renaissance-painting, monastic-orders
- `requiredResources`: [stone]
- `cityRequirement`: any
- Quest step 1: Complete 4 arts or spirituality technologies
- Quest step 2: Develop 3 cities with at least 3 buildings each
- `reward`: `civYieldBonus: { science: 3, gold: 1 }` — "+3 science and +1 gold empire-wide each turn"

**Codex Eternal** (`codex-eternal`)
- `requiredTechs`: printing-press, scientific-method
- `requiredResources`: []
- `cityRequirement`: any
- Quest step 1: Complete 4 communication or science technologies
- Quest step 2: Maintain 3 active trade routes
- `reward`: `civYieldBonus: { science: 4 }` — "+4 science empire-wide each turn"

**Navigator's Compass** (`navigators-compass`)
- `requiredTechs`: circumnavigation, deep-sea-routes
- `requiredResources`: []
- `cityRequirement`: coastal
- Quest step 1: Discover 3 natural wonders or tribal villages on foreign landmasses
- Quest step 2: Establish 2 coastal trade routes
- `reward`: `civYieldBonus: { gold: 4 }` plus special: naval units empire-wide +1 movement permanently — "+4 gold empire-wide each turn; all naval units gain +1 movement"

### Era 6 — productionCost 265

**Palace of the Sun** (`palace-of-the-sun`)
- `requiredTechs`: baroque-architecture, separation-of-powers
- `requiredResources`: [stone]
- `cityRequirement`: any
- Quest step 1: Complete 4 civics or arts technologies
- Quest step 2: Develop 3 cities with at least 4 buildings each
- `reward`: `civYieldBonus: { gold: 3, science: 2 }` — "+3 gold and +2 science empire-wide each turn"

**Iron Arsenal** (`iron-arsenal`)
- `requiredTechs`: military-doctrine, steel-production
- `requiredResources`: [iron]
- `cityRequirement`: any
- Quest step 1: Win 3 battles against enemy units or cities
- Quest step 2: Develop 2 cities with barracks and walls
- `reward`: special: all newly trained military units gain +5% combat strength permanently — "All military units trained from this point forward spawn with +5% combat strength"

**Merchant Admiralty** (`merchant-admiralty`)
- `requiredTechs`: merchant-fleets, joint-stock-companies
- `requiredResources`: []
- `cityRequirement`: coastal
- Quest step 1: Maintain 4 active trade routes simultaneously
- Quest step 2: Develop 3 coastal cities
- `reward`: `civYieldBonus: { gold: 4 }` — "+4 gold empire-wide each turn"

### Era 7 — productionCost 310

**Crystal Pavilion** (`crystal-pavilion`)
- `requiredTechs`: iron-construction, industrial-capital
- `requiredResources`: []
- `cityRequirement`: any
- Quest step 1: Complete 4 construction or economy technologies
- Quest step 2: Build a factory and a stock exchange in the same city
- `reward`: `civYieldBonus: { production: 4, gold: 2 }` — "+4 production and +2 gold empire-wide each turn"

**Iron Bridge** (`iron-bridge`)
- `requiredTechs`: bessemer-process, city-infrastructure
- `requiredResources`: [iron]
- `cityRequirement`: river
- Quest step 1: Build 3 river improvements or river-adjacent buildings
- Quest step 2: Establish 3 trade routes from this city
- `reward`: `cityYieldBonus: { production: 3 }` plus `civYieldBonus: { gold: 2 }` — "+3 production in the host city and +2 gold empire-wide each turn"

**Grand Station** (`grand-station`)
- `requiredTechs`: railway-expansion, city-infrastructure
- `requiredResources`: []
- `cityRequirement`: any
- Quest step 1: Build railway stations in 3 cities
- Quest step 2: Maintain 4 active trade routes
- `reward`: `civYieldBonus: { production: 3, gold: 2 }` — "+3 production and +2 gold empire-wide each turn"

**Approved roster:** all 9 new wonders must be added to `getApprovedM4LegendaryWonderRoster()` in `src/systems/approved-legendary-wonder-roster.ts` alongside their definitions.

---

## Special Conditional Buildings (6)

Buildings with conditions beyond tech gating. New `requiresBuildings?: string[]` field on Building type. Two yields allowed — the condition is the balancing constraint. Balance rules (single yield, empire-wide flat) do **not** apply to these; they are city-scoped and conditional.

| Building ID | Era | Condition | Req tech | Yields |
|---|---|---|---|---|
| `harbour_exchange` | 5 | `coastalRequired: true` | deep-sea-routes | +3 gold |
| `apothecary_house` | 5 | `requiresBuildings: ['herbalist']` | herbalist-guilds | +1 science, +2 food |
| `arsenal` | 6 | `requiresBuildings: ['barracks', 'walls']` | line-infantry | +2 production; units trained here +3 strength |
| `counting_house` | 6 | `requiresBuildings: ['marketplace']` | joint-stock-companies | +4 gold |
| `steam_works` | 7 | `requiresBuildings: ['factory', 'forge']` | thermodynamics | +5 production |
| `medical_school` | 7 | `requiresBuildings: ['hospital', 'library']` | medical-colleges | +3 science; city grows 25% faster |

---

## Balance Rules Reference

Living policy: **`.claude/rules/game-balance.md`**

Key ceilings enforced by tests:
- National projects: prefer single yield; total ≤ era ceiling; no per-city/per-route scaling except allowlist
- Wonders: max single key ≤ 6; max 2 keys; no per-city/per-route scaling except allowlist
- Movement bonus stacking: no more than +2 empire-wide movement bonus for any unit class from all sources combined

---

## Test Plan

### New test file: `tests/systems/national-project-balance.test.ts`

```
describe('national project structural invariants')
  ✓ every national project has uniquePerEmpire: true
  ✓ every national project has nationalProject.homeEra in range 1–12
  ✓ no national project has both civYieldBonus and cityYieldBonus
  ✓ every national project with per-city or per-route yield is in the explicit allowlist

describe('national project yield ceiling')
  ✓ era 1–2 projects: civYieldBonus total ≤ 2
  ✓ era 3–4 projects: civYieldBonus total ≤ 5
  ✓ era 5–6 projects: civYieldBonus total ≤ 7
  ✓ era 7+ projects: civYieldBonus total ≤ 9

describe('national project yield multiplier')
  ✓ multiplier is 1.0 when currentEra - eraBuilt = 0
  ✓ multiplier is 1.0 when currentEra - eraBuilt = 1
  ✓ multiplier is 0.5 when currentEra - eraBuilt = 2
  ✓ multiplier is 0 when currentEra - eraBuilt = 3
  ✓ multiplier is 0 when currentEra - eraBuilt > 3

describe('national project build window')
  ✓ project IS in production options when currentEra === homeEra
  ✓ project IS in production options when currentEra === homeEra + 1
  ✓ project is NOT in production options when currentEra > homeEra + 1
  ✓ project is NOT in production options when already built empire-wide

describe('national project expiry')
  ✓ expireNationalProjects removes entries where newEra - eraBuilt >= 3
  ✓ expireNationalProjects removes the building from host city.buildings
  ✓ expireNationalProjects returns the expired list for event firing
  ✓ expiry does not affect projects where delta < 3

describe('uniquePerEmpire enforcement')
  ✓ queueing a national project already built empire-wide is rejected
  ✓ two different civs can each build the same national project
```

### Additions to `tests/systems/wonder-definitions.test.ts`

```
  ✓ no active wonder (era ≤ 7) references a relocated tech ID
      (relocated IDs: global-logistics, nuclear-theory, mass-media,
       digital-surveillance, cyber-warfare, amphibious-warfare)
  ✓ no wonder civYieldBonus single key exceeds 6
  ✓ no wonder civYieldBonus has more than 2 keys
  ✓ no wonder cityYieldBonus single key exceeds 4
  ✓ wonders with per-city or per-route yield are in the explicit allowlist

describe('era label')  (added to tests/ui/tech-panel.test.ts or similar)
  ✓ getEraLabel(5) === 'Renaissance'
  ✓ getEraLabel(7) === 'Industrial Revolution'
  ✓ getEraLabel(99) === 'Era 99'  (no gap for unknown era)
```

### Additions to `tests/systems/tech-unlocks-consistency.test.ts`

```
  ✓ no tech in era ≤ 7 has prerequisites referencing a relocated era 5 stub
  ✓ all 90 new tech IDs are present in TECH_TREE after split files are merged
```

---

## PR Breakdown

### PR 1 — Foundation + Era 5 (Renaissance)

**Mechanical foundations (must land first in this PR):**
- Split `tech-definitions.ts` into `tech-definitions-eras1-4.ts` + re-export shim
- Stub relocation (6 techs + 3 wonders)
- Era label lookup table in `tech-panel.ts`
- `national-project-system.ts` (new file: multiplier, expiry, civYieldBonus computation)
- New Building type fields: `uniquePerEmpire`, `nationalProject`, `requiresBuildings`
- `builtNationalProjects` on `GameState`
- Production queue filter, uniquePerEmpire guard, expiry hook in turn-manager
- UI: `(fading)` label, expiry notification, mid-queue dequeue notification
- AI: national project prioritization in `basic-ai.ts`
- `.claude/rules/game-balance.md` (new file)
- `tests/systems/national-project-balance.test.ts` (new file)
- Wonder and tech-unlocks balance test additions

**Era 1–4 national project backfill:** 12 building definitions (3 per era), all new IDs

**Era 5 content (`tech-definitions-eras5-7.ts`, new file):**
- 30 tech definitions (15 tracks × 2)
- New unit: `cannon` (full wiring: UnitType, unit-system.ts, city-system.ts, PRODUCTION_ICONS, basic-ai.ts, turn-manager.ts death cleanup, renderer icon, SFX ID)
- 6 new regular buildings + 2 special buildings + 3 national projects
- 3 wonders (+ approved roster entries)

**Verification gate before PR 2:** era 4 → 5 advancement fires correctly; national project build window enforced; `(fading)` label appears when civ advances; cannon trainable and obsoletes catapult.

---

### PR 2 — Era 6 (Gunpowder Age)

- 30 new tech definitions appended to `tech-definitions-eras5-7.ts`
- New unit: `grenadier` (full wiring)
- 4 new regular buildings; `stock_exchange` `techRequired` updated from defunct stub to `joint-stock-companies`
- 2 special buildings, 3 national projects, 3 wonders

**Verification gate:** era 5 → 6 advancement; era 5 national projects enter fade (50% yields); grenadier trainable.

---

### PR 3 — Era 7 (Industrial Revolution)

- 30 new tech definitions appended to `tech-definitions-eras5-7.ts`
- New unit: `rifleman` (full wiring — obsoletes musketeer + crossbowman; both must dequeue from in-progress city queues via tech-gated dequeue path)
- 4 new regular buildings, 2 special buildings, 3 national projects, 3 wonders

**Verification gate:** era 6 → 7 advancement; era 5 national projects expire and fire removal event; era 6 projects enter fade; rifleman trainable; musketeer and crossbowman dequeue from all AI and player queues.
