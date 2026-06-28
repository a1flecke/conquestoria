# Era 12 — Information Age Design Spec

**Date:** 2026-06-28  
**Issue:** #356  
**Era theme:** Information Age (~1985–2025)  
**Era name (ERA_NAMES):** `'Information Age'`  
**Tech cost range:** 380–420  

---

## ERA_NAMES additions

`tech-panel.ts` currently stops at era 7. Add entries for eras 8–12:

```ts
8: 'Nationalist',
9: 'Progressive',
10: 'Cold War',
11: 'Space Race',
12: 'Information Age',
```

---

## New System: Non-Combat Specialist Class

Era 12 introduces the first **non-combat specialist unit** — a map unit with `strength: 0` that exerts passive effects rather than fighting. Contract:

- **Hex-occupying:** appears on the map like any other unit
- **Capturable (not destroyable):** if an enemy unit moves onto its hex, the unit is captured (ownership transferred to the enemy civ). It is never destroyed by combat. Behaves identically to a settler for capture resolution purposes.
- **Zero combat strength:** never initiates combat; never defends; always loses a hex contest
- **Passive adjacency ability:** exerts an effect on any enemy city it is adjacent to, subject to probabilistic CDC defense (see below)
- **Movement:** normal, uses road and terrain rules
- **AI deployment:** target enemy cities with highest gold output that lack a Cyber Defense Center; avoid hexes adjacent to garrisoned cities

This contract is intentionally minimal for era 12. Future specialist units (Propagandist, AI Drone Controller — era 13) extend this class without changing the contract.

### Cyber Defense Center — probabilistic defense

The Cyber Defense Center (CDC) does **not** provide automatic immunity. Once per turn, for each active threat, the engine rolls via seeded RNG — **one roll per adjacent Cyber Unit per city per turn, one roll per Market Manipulation spy attempt, one roll per turn to hold the mass-surveillance bubble**. Seed: `state.turn + cityId.charCodeAt(0) + agentId.charCodeAt(0)` for determinism across all clients.

| Threat | Base block chance | With Signals Hub (+10%) |
|---|---|---|
| Cyber Unit gold drain (own city) | 65% | 75% |
| Spy Market Manipulation action | 60% | 70% |
| Mass-surveillance bubble | 70% | 80% |

Block chances never reach 100%. A breach should always be possible — frequency is the lever, not immunity.

**Protection bubble:** Units within 2 hexes of a CDC are hidden from enemy `mass-surveillance`. The bubble collapses (ignoring the 70% roll) if an enemy Cyber Unit is adjacent to the CDC city AND the CDC fails its roll that turn.

---

## Techs (30 — 2 per track × 15 tracks)

Prerequisites reference era 11 tech IDs. Implementation plan must verify exact IDs against `tech-definitions-eras11.ts` before coding.

The `unlocks` field contains **player-visible effect text only** — no unit or building names (those belong in `unlocksUnits`/`unlocksBuildings` per the consistency rule).

### Military
```
id: 'cyber-warfare'           cost: 390   prereqs: [icbm-development, satellite-surveillance]
  unlocks: ['Deploy cyber specialists who drain enemy city gold while adjacent; cities
             with no Cyber Defense Center are unprotected']
  unlocksUnits: ['cyber_unit']

id: 'stealth-technology'      cost: 400   prereqs: [carbon-fiber, satellite-surveillance]
  unlocks: ['Strategic bombers evade radar detection; cannot be targeted by ranged
             attacks unless enemy has an EM detection hub within 2 hexes']
  unlocksUnits: ['stealth_bomber']
  unlocksBuildings: ['stealth_airbase']
```

### Economy
```
id: 'globalization'           cost: 380   prereqs: [petrodollar-system, stagflation-response]
  unlocks: ['Trade routes gain +1 gold per distinct civ they connect to;
             bonus lost for any civ you are at war with']

id: 'digital-economy'         cost: 385   prereqs: [petrodollar-system, container-shipping]
  unlocks: ['Cities with a market gain +1 gold per trade route they send or receive']
  unlocksBuildings: ['fintech_hub']
```

### Science
```
id: 'genomics'                cost: 390   prereqs: [molecular-biology, green-revolution-crops]
  unlocks: ['Cities produce +1 food for every 3 science they generate
             (food tracks science output — synergy reward for tall science empires)']
  unlocksBuildings: ['biotech_lab']

id: 'quantum-computing'       cost: 405   prereqs: [integrated-circuits, molecular-biology]
  unlocks: ['All unresearched science-track techs cost 15% less from this point forward']
  unlocksBuildings: ['data_center']
```

### Civics
```
id: 'digital-rights'          cost: 380   prereqs: [civil-rights-legislation, arms-control-negotiations]
  unlocks: ['Espionage buildings each generate +1 science
             (espionage buildings = any BUILDINGS entry with category: "espionage",
              e.g. spy_network, safe_house, surveillance_agency, signals_intelligence)']

id: 'network-governance'      cost: 385   prereqs: [civil-rights-legislation, arpanet]
  unlocks: ['Your lowest-science city gains +2 science/turn from empire-wide data sharing']
```

### Exploration
```
id: 'gps-navigation'          cost: 385   prereqs: [space-exploration, deep-sea-drilling]
  unlocks: ['Land units in your own territory ignore terrain movement penalties
             (defensive and logistics advantage; enemy units attacking into your
              territory still face terrain)']

id: 'private-spaceflight'     cost: 400   prereqs: [space-exploration, offshore-platforms]
  unlocks: ['Cities with a space_center generate +3 gold (commercial launch contracts);
             all air units gain +1 movement (reusable rocket propulsion advances
             aerospace engineering empire-wide)']
```
**Movement note:** private-spaceflight is the first and only empire-wide air movement bonus
(+1 to all air units). Per movement stacking policy: total air empire-wide bonus = +1, within ≤+2 ceiling.
Add to movement stacking inventory table in `.claude/rules/game-balance.md`.

### Agriculture
```
id: 'precision-agriculture'   cost: 380   prereqs: [green-revolution-crops, aquaculture]
  unlocks: ['Farm improvements also yield +1 production']
  unlocksBuildings: ['precision_farm']

id: 'lab-grown-food'          cost: 385   prereqs: [aquaculture, organ-transplantation]
  unlocks: ['Cities ignore food penalties from blockade or war']
```

### Medicine
```
id: 'gene-therapy'            cost: 390   prereqs: [organ-transplantation, vaccination-campaigns]
  unlocks: ['Units survive a lethal hit at 1 HP once per cooldown; cooldown resets
             when unit spends a full turn in a friendly city without moving or attacking']
  unlocksBuildings: ['gene_therapy_clinic']

id: 'telemedicine'            cost: 380   prereqs: [vaccination-campaigns, civil-rights-legislation]
  unlocks: ['All friendly units within 3 hexes of any friendly city heal +1 HP/turn
             (extends healing beyond city walls; distinct from city-interior healing)']
  unlocksBuildings: ['telemedicine_hub']
```

### Maritime
```
id: 'autonomous-shipping'     cost: 385   prereqs: [container-shipping, offshore-platforms]
  unlocks: ['Trade routes have zero maintenance cost']
  unlocksBuildings: ['automated_port']

id: 'deep-ocean-research'     cost: 380   prereqs: [container-shipping, nuclear-submarines]
  unlocks: ['Coastal cities gain +1 trade route slot']
```

### Metallurgy
```
id: 'nanomaterials'           cost: 390   prereqs: [carbon-fiber, precision-engineering]
  unlocks: ['Units built from this point forward gain +3 base strength
             (retroactive to existing units would be too powerful — new production only)']

id: '3d-printing'             cost: 385   prereqs: [precision-engineering, megastructures]
  unlocks: ['Production overflow carries to the next item in the queue
             (no wasted production turns; changes queue management behavior)']
```

### Construction
```
id: 'smart-cities'            cost: 390   prereqs: [megastructures, offshore-platforms]
  unlocks: ['Cities with both a factory AND semiconductor_fab generate +2 production
             and +1 science (rewards fully industrialised cities)']
  unlocksBuildings: ['smart_grid']

id: 'green-architecture'      cost: 380   prereqs: [offshore-platforms, green-revolution-crops]
  unlocks: ['Cities with 6+ buildings ignore overextension gold penalties']
```

### Communication
```
id: 'internet'                cost: 395   prereqs: [arpanet, satellite-television]
  unlocks: ['Unlocks cyber defense infrastructure; the networked economy enables
             a new class of non-combat economic units']
  unlocksBuildings: ['cyber_defense_center']

id: 'social-media'            cost: 380   prereqs: [satellite-television, counterculture]
  unlocks: ['You can see competing civs' progress on any wonder you are also building']
  unlocksBuildings: ['broadcast_tower']
```

### Espionage
```
id: 'cyber-intelligence'      cost: 385   prereqs: [black-ops-programs, satellite-surveillance]
  unlocks: ['Spies in infiltrated cities reveal the full build queue
             (CDC blocks this with 60% chance)']
  unlocksBuildings: ['signals_hub']

id: 'mass-surveillance'       cost: 390   prereqs: [black-ops-programs, arpanet]
  unlocks: ['See all unit positions of civs you are at war with; CDC creates a
             2-hex protection bubble (70% hold chance per turn; collapses if
             enemy Cyber Unit is adjacent and CDC roll fails)']
```

### Philosophy
```
id: 'transhumanism'           cost: 385   prereqs: [structuralism, postmodernism]
  unlocks: ['Units at full HP gain +5% combat strength
             (incentivises fresh units and fast retreats for healing)']

id: 'secular-rationalism'     cost: 380   prereqs: [postmodernism, civil-rights-legislation]
  unlocks: ['Civics buildings each generate +1 science
             (civics buildings = any BUILDINGS entry with category: "civics",
              e.g. courthouse, parliament, constitution_hall, codified_rights)']
```
**Note:** prereqs deliberately differ from `transhumanism` (shares postmodernism but diverges
to civil-rights-legislation) to create distinct research paths within the philosophy track.

### Arts
```
id: 'digital-art'             cost: 380   prereqs: [pop-art, counterculture]
  unlocks: ['Each wonder you control spreads +1 gold/turn to trade route partners']

id: 'video-games'             cost: 385   prereqs: [counterculture, petrodollar-system]
  unlocks: ['Entertainment buildings generate ×1.5 gold
             (entertainment buildings = any BUILDINGS entry with category: "entertainment",
              e.g. music_hall, amphitheater, stadium)']
```
**Note:** prereqs use `counterculture` (arts) + `petrodollar-system` (economy) rather than
`pop-art` to ensure the two arts-track techs have distinct prerequisite structures.

### Spirituality
```
id: 'mindfulness-movement'    cost: 380   prereqs: [ecumenical-movement, new-age-spirituality]
  unlocks: ['Friendly territory heals units at 1.5× rate (applies to base territory
             heal rate; telemedicine +1 HP/turn is added after:
             combined = base_heal × 1.5 + 1)']

id: 'new-secularism'          cost: 380   prereqs: [ecumenical-movement, structuralism]
  unlocks: ['Science buildings each generate +1 gold
             (science buildings = any BUILDINGS entry with category: "science",
              e.g. library, university, research_institute, genetic_research_lab,
              semiconductor_fab, data_center)']
```
**Note:** prereqs use `ecumenical-movement` (spirituality) + `structuralism` (philosophy)
rather than repeating new-age-spirituality to differentiate from `mindfulness-movement`.

---

## Units

### stealth_bomber
```
type: 'stealth_bomber'
domain: 'air'
strength: 52
movement: 5  (becomes 6 after private-spaceflight is researched)
range: 3
ranged: true
productionCost: 360
techRequired: 'stealth-technology'
trainedFrom: 'stealth_airbase' (stealth_airbase is the ONLY building that trains this unit;
              both techRequired AND stealth_airbase in city must be satisfied)
special: STEALTH — cannot be targeted by ranged attacks unless an enemy signals_hub
         is within 2 hexes of the BOMBER's current hex position.
         Broadcast_tower does NOT reveal stealth units — only signals_hub does.
         (Rationale: broadcast towers emit EM signal for area detection of ordinary
          units; signals_hub has dedicated radar/EM analysis that breaks stealth
          signatures. The two buildings serve distinct detection roles.)
sfxClass: 'air-heavy'
AI: treat as strategic strike unit; prioritise target cities lacking signals_hub
    within 2 hexes; approach from hexes outside signals_hub coverage radius
```

### cyber_unit
```
type: 'cyber_unit'
domain: 'land'
strength: 0
movement: 3
ranged: false
productionCost: 120
techRequired: 'cyber-warfare'
special: NON-COMBAT SPECIALIST (first member of the specialist class)
  - Capturable on contact (not destroyable)
  - Passive adjacency: enemy city adjacent with no CDC loses −2 gold/turn;
    CDC blocks with 65% chance via seeded RNG per turn
  - Gold drain is a flat −2 subtracted from total city gold yield (floor: 0);
    no source-priority targeting — the game does not track gold by origin
sfxClass: 'land-recon'
AI: deploy toward highest-gold enemy city lacking CDC; do not move adjacent
    to garrisoned hexes; retreat if a military unit moves within 1 hex
```

---

## Buildings (12)

### cyber_defense_center
```
Unlocked by: internet
productionCost: 200
yields: +2 science
Special (probabilistic via seeded RNG — full contract in system section above):
  - 65% block: Cyber Unit adjacency gold drain
  - 60% block: Spy Market Manipulation action
  - 70% hold: mass-surveillance protection bubble (2-hex radius)
  - Bubble collapses if enemy Cyber Unit adjacent + hold roll fails
```

### signals_hub
```
Unlocked by: cyber-intelligence
productionCost: 220
yields: +2 science
Requires: cyber_defense_center in same city (hard prereq — cannot build without CDC)
Special:
  - Raises all CDC block chances in this city by +10%
  - Stealth bombers within 2 hexes of this city's position are visible to ranged
    attacks (dedicated radar — overrides stealth quality for those hexes)
```

### stealth_airbase
```
Unlocked by: stealth-technology
productionCost: 240
yields: +2 production
Special: the ONLY building that can train stealth_bomber
         (city must have both stealth_airbase AND stealth-technology researched)
```

### data_center
```
Unlocked by: quantum-computing
productionCost: 200
yields: +3 science
Requires: semiconductor_fab in same city (era 11 building — hard prereq)
```

### biotech_lab
```
Unlocked by: genomics
productionCost: 190
yields: +2 science, +3 food
Note: an earlier draft used "+1 food per 4 science (cap +3)" but any era 12 city
generating 12+ science (typical) always hits the cap. Flat +3 food is equivalent,
simpler to implement and display, and avoids a formula the player can't easily read.
```

### broadcast_tower
```
Unlocked by: social-media
productionCost: 170
yields: +3 gold
Special: enemy units (non-stealth) within 2 hexes of this city are revealed
         regardless of fog of war (EM broadcast detection)
         Does NOT reveal stealth_bomber — signals_hub is required for that.
```

### precision_farm
```
Unlocked by: precision-agriculture
productionCost: 160
yields: +2 food
Special: farm improvements on tiles within this city's cultural borders
         yield +1 production additionally
```

### gene_therapy_clinic
```
Unlocked by: gene-therapy
productionCost: 220  (raised from 190 — pre-charging every trained unit is potent)
yields: +2 science   (not food — a gene therapy clinic advances biological research)
Special: units trained in this city start with geneTherapyReady: true
         (pre-charged — no rest turn required for first activation)
```

### telemedicine_hub
```
Unlocked by: telemedicine
productionCost: 180
yields: +2 food
Special: friendly units within 3 hexes of this city heal +1 HP/turn
         (distinct from transplant_hospital which only heals units inside the city;
          era 12 extends the healing radius, not the healing rate)
```

### automated_port
```
Unlocked by: autonomous-shipping
productionCost: 200
coastalRequired: true
yields: +2 gold
Special: trade routes originating FROM this city have zero maintenance cost
         (only outgoing routes; incoming routes from other cities are unaffected)
```

### smart_grid
```
Unlocked by: smart-cities
productionCost: 210
yields: +2 production, +1 science
Requires: factory AND semiconductor_fab in same city (hard prereqs)
```

### fintech_hub
```
Unlocked by: digital-economy
productionCost: 180
yields: +2 gold
Special:
  - +1 gold per trade route this city sends or receives (stacks with digital-economy
    tech for total +2 gold/route in cities with a market)
  - Enables the Market Manipulation spy action: a spy adjacent to an enemy city
    (no infiltration required) can execute Market Manipulation against that city,
    provided the attacking player has a fintech_hub anywhere in their empire.
    CDC rolls 60% block chance on the attempt. On breach: target city's trade-route
    gold is halved for 3 turns.
```

---

## National Projects (3)

All: `uniquePerEmpire: true`, `homeEra: 12`, standard lifecycle
(full yield at eras 12–13, 0.5× at era 14, expired at era 15).

### national_cyber_command
```
civYieldBonus: { science: 3 }
Special: all CDCs empire-wide gain +5% block chance
         (stacks with Signals Hub; still never reaches 100%)
Architecture note: this is the first NP with a non-yield gameplay modifier.
The NP system currently only applies civYieldBonus via getNationalProjectCivYieldBonus.
The CDC block chance modifier must be checked in the CDC roll path in turn-manager.ts —
something like: if (activeNPs.includes('national_cyber_command')) blockChance += 0.05.
This is new code, not a bonus field extension.
Thematic: government body coordinating offensive and defensive cyber operations
```

### sustainability_program
```
civYieldBonus: { food: 3 }
Special: cities with 6+ buildings ignore overextension food penalties
Implementation caveat: verify that processCity applies a food penalty under
overextension conditions. If the game only tracks overextension as a gold/happiness
penalty (not food), this special effect has no gameplay impact and should be
replaced with civYieldBonus: { food: 4 } (single yield, still within ceiling).
Check turn-manager.ts overextension handling before implementing the special.
(green-architecture tech removes overextension gold penalties; this removes food
penalties — the two stack to make mature cities fully overextension-immune
IF the food penalty mechanic exists.)
Thematic: domestic policy — renewable energy mandates, agricultural sustainability
```

### digital_silk_road
```
civYieldBonus: { gold: 3 }
Special: each active trade route connecting to a civ you are NOT at war with
         generates +1 gold additionally
Per-route scaling: add to NP per-route allowlist in .claude/rules/game-balance.md:
  - 'digital_silk_road' (era 12): "+1 gold per peacetime trade route" —
    justified because era 12 trade route slots are capped by building investment;
    maximum realistic gain ≈ +8 gold (8 routes × 1). Naturally self-limits
    through war (any war removes trade with that civ) and slot limits.
Thematic: digital infrastructure investment across partner states
```

---

## Legendary Wonder: World Wide Web

```
id: 'world-wide-web'
name: 'World Wide Web'
era: 12
cost: 380
requiredTechs: ['internet', 'network-governance']
civYieldBonus: { science: 3 }
Special: the network-governance tech's lowest-city science-sharing effect is doubled
         — lowest-science city gains +4 science/turn instead of +2.
         First-mover advantage: the civ that builds the WWW accelerates the
         science levelling effect across their empire.
```

### Quest steps
1. Research `social-media` (the second era 12 communication tech — `internet` is
   already required to build the wonder and need not be re-listed here)
2. Build Cyber Defense Centers in 3 cities
3. Connect trade routes to at least 4 distinct civs

### Canvas render
Dark globe crosshatched with glowing fiber-optic connection lines; server nodes pulse
at major cities; faint binary rain in the background; one bright arc of light traces
a live connection between two city nodes and pulses outward.  
Motif: `network`  
LEGENDARY_LANDMARK_MOTIFS: add `'network'`

### Codex entry
"Proposed in a CERN memo in 1989 and opened to the public in 1991, the World Wide Web
turned the internet from a military routing protocol into the largest collaborative
project in human history — connecting three billion people within three decades."

### Landmark catalog
Group: `Wonders of the Information Age`

---

## Balance compliance checklist

- [ ] Wonder `civYieldBonus`: science +3 ≤ 6 ✓; single key ✓
- [ ] Wonder special effect (doubled network-governance sharing): does not add a second yield key ✓
- [ ] NP `national_cyber_command`: science +3 ≤ 9 ✓; single key ✓; non-yield special effect (CDC bonus) needs new code path — see architecture note ✓
- [ ] NP `sustainability_program`: food +3 ≤ 9 ✓; single key ✓; overextension food mechanic must be verified before implementing the special ✓
- [ ] NP `digital_silk_road`: gold +3 + per-route scaling; add to NP allowlist in game-balance.md with justification text written above ✓
- [ ] No movement bonuses from wonders/NPs ✓
- [ ] `private-spaceflight` grants air units +1 movement — **add to movement stacking inventory in game-balance.md**: first and only air movement bonus; total air empire-wide = +1 ≤ +2 ceiling ✓
- [ ] `nanomaterials` +3 strength applies only to newly trained units ✓

---

## geneTherapyReady state contract

New optional field on `Unit`:

```ts
geneTherapyReady?: boolean
// undefined: unit was trained before gene-therapy tech was researched — no benefit
// true:      ability charged and ready to fire
// false:     on cooldown after firing
```

**Set to `true` when:**
- Unit is trained in a city with `gene_therapy_clinic` (starts pre-charged)
- Unit completes a full turn in a friendly city: `!unit.moved && !unit.attacked && cityOwner === unit.owner` (cooldown reset)

**Set to `false` when:**
- Ability fires: unit would take lethal damage and instead survives at 1 HP

**Left `undefined`:** units trained before `gene-therapy` tech is researched do not retroactively receive the field. Only units trained after tech research are eligible.

**Lethal check location:** The combat system (wherever lethal damage resolution occurs — NOT specifically the turn manager) must check `geneTherapyReady === true` before eliminating a unit, apply the 1 HP survive, then set the flag to `false`. Identify the exact location in the codebase before implementing.

---

## Cyber Unit drain implementation notes

The `−2 gold/turn` drain is applied in turn manager during yield computation:

1. For each enemy city: collect all adjacent Cyber Units owned by the current civ
2. For each adjacent Cyber Unit: roll seeded RNG (seed: `state.turn + cityId.charCodeAt(0) + unitId.charCodeAt(0)`) against CDC block chance — 65% block if CDC present, 0% block (always drains) if no CDC
3. Each unblocked Cyber Unit subtracts 2 from that city's total gold yield, flooring at 0
4. **No source-priority targeting** — drain is applied to the aggregate gold yield only. The game does not track gold by source (digital-economy bonus, trade routes, etc. are not individually addressable). Implementing source-priority would require refactoring yield computation; defer to a future issue if desired.

**Market Manipulation spy action** (enabled when attacker has any fintech_hub; spy adjacent to target city):
- Roll against CDC block chance (60% block if CDC present)
- On breach: set `cyberMarketDisruption: { turnsRemaining: 3 }` on the target city; halve trade-route gold for 3 turns in turn manager yield computation
- On block: spy action fails; spy is still consumed
- On no CDC: always succeeds; spy is consumed

---

## Test requirements

- `tests/systems/era-12.test.ts` — 30 era-12 tech definitions, all 15 tracks × 2 covered
- Tech count tests: update expected total to **369** (339 + 30)
- `tests/systems/national-project-balance.test.ts` — era-12 describe block: all 3 NPs within ceiling
- `tests/systems/national-project-balance.test.ts` — `national_cyber_command` CDC bonus fires (integration: CDC block chance increases when NP active)
- `tests/systems/national-project-balance.test.ts` — `digital_silk_road` per-route gold applies only to peacetime routes (negative: war removes the bonus)
- `tests/systems/wonder-definitions.test.ts` — world-wide-web coverage (balance, quest steps)
- `tests/systems/tech-unlocks-consistency.test.ts` — all `unlocksUnits`/`unlocksBuildings` wired
- `geneTherapyReady` state transitions: charge → fire (unit survives at 1 HP) → cooldown → rest in city → charged again
- `geneTherapyReady` pre-charge: unit trained in city with gene_therapy_clinic starts `true`
- `geneTherapyReady` absent: unit trained before tech starts `undefined`, not `false`
- Cyber Unit adjacency drain: no CDC → always drains; CDC → 65% block (seed the RNG for determinism in test)
- Cyber Unit: captured (not destroyed) when enemy unit enters hex
- Market Manipulation: no fintech_hub → action unavailable; fintech_hub present → available; CDC blocks at 60%
- Stealth bomber: cannot be targeted when no signals_hub within 2 hexes; CAN be targeted when signals_hub present
- broadcast_tower does not reveal stealth_bomber (only signals_hub does)
- ERA_NAMES test: `getEraLabel(12)` returns `'Information Age'`
- `getEraLabel(8)` through `getEraLabel(11)` also return correct names (regression for all new entries)

---

## Files to touch

| File | Action |
|---|---|
| `src/systems/tech-definitions-eras12.ts` | Create — 30 tech definitions |
| `src/systems/tech-definitions.ts` | Import and spread TECH_TREE_ERAS_12 |
| `src/ui/tech-panel.ts` | Add ERA_NAMES 8–12 |
| `src/systems/city-system.ts` | Add 12 buildings; add cyber_unit + stealth_bomber to TRAINABLE_UNITS; add PRODUCTION_ICONS entries; stealth_airbase as `trainedFrom` guard for stealth_bomber |
| `src/core/types.ts` | Add `'cyber_unit' \| 'stealth_bomber'` to UnitType union; add `geneTherapyReady?: boolean` to Unit |
| `src/systems/unit-system.ts` | UNIT_DEFINITIONS + UNIT_DESCRIPTIONS for both units |
| `src/core/turn-manager.ts` | Cyber Unit drain; cyberMarketDisruption tick-down; geneTherapyReady rest-reset; NP civYieldBonus; national_cyber_command CDC modifier; digital_silk_road per-route gold; sustainability_program overextension food (if mechanic exists) |
| `src/systems/national-project-system.ts` | Register 3 era-12 NPs |
| Combat system (locate before implementing) | geneTherapyReady lethal-hit check and survive-at-1-HP branch |
| Stealth targeting path (locate before implementing) | Add signals_hub within-2-hex check before allowing ranged targeting of stealth units |
| `src/ai/basic-ai.ts` | Cyber Unit deployment heuristic; stealth_bomber targeting (avoid signals_hub coverage) |
| `src/renderer/unit-renderer.ts` | Icons for cyber_unit + stealth_bomber |
| `src/renderer/sprites/` | Placeholder sprites for both units (TODO art) |
| `src/renderer/sprites/sprite-catalog.ts` | Register 12 building sprites + 2 unit sprites |
| `src/renderer/wonders/` | world-wide-web canvas draw function |
| `src/systems/wonder-definitions.ts` | world-wide-web entry |
| `src/data/legendary-landmarks.ts` | world-wide-web catalog entry + `'network'` motif |
| `src/data/codex.ts` | world-wide-web codex entry |
| `.claude/rules/game-balance.md` | Add `digital_silk_road` to NP per-route allowlist; add `private-spaceflight` to movement stacking inventory |
| `tests/systems/era-12.test.ts` | Create |
| `tests/systems/national-project-balance.test.ts` | Era-12 describe block |
| `tests/systems/wonder-definitions.test.ts` | world-wide-web coverage |

---

## Explicitly out of scope (follow-up issues)

- Cyber Unit Option B (ranged strike action) — issue #419
- Broader cyber attack/defense system — issue #419
- ERA_NAMES / tech balance audit for eras 1–11 — issue #420
- Era-by-era warfare flavor (hard and soft) — issue #420
- Unit/building obsolescence chains — issue #429
- Era 13 Autonomous Systems content — issues #417 / #418
- Era 13+ full content specification — issue #418
- Art polish for placeholder sprites — deferred art sprint
- SFX for cyber_unit + stealth_bomber — deferred audio sprint
