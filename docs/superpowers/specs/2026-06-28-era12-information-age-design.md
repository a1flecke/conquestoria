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
- **Capturable:** behaves like a settler — if an enemy unit moves onto its hex, it is captured (transferred to the enemy civ), not destroyed
- **Zero combat strength:** never initiates combat; never defends; auto-captured on contact
- **Passive adjacency ability:** exerts an effect on any enemy city it is adjacent to, subject to probabilistic CDC defense (see below)
- **Movement:** normal, uses road/terrain rules
- **AI deployment:** AI targets enemy cities with highest gold output that lack a Cyber Defense Center

This contract is intentionally minimal for era 12. Future specialist units (Propagandist, AI Drone Controller — era 13) extend this class without changing the contract.

### Cyber Defense Center — probabilistic defense

The Cyber Defense Center (CDC) does **not** provide automatic immunity. Each relevant game tick the engine rolls via seeded RNG:

| Threat | Base block chance | With Signals Hub (+10%) |
|---|---|---|
| Cyber Unit gold drain (own city) | 65% | 75% |
| Spy Market Manipulation action | 60% | 70% |
| Mass-surveillance bubble collapse | 70% | 80% |

Block chances never reach 100%. A breach should always be possible — frequency is the lever, not immunity.

**Protection bubble:** Units within 2 hexes of a CDC are hidden from enemy `mass-surveillance`. The bubble collapses (ignoring the 70% roll) if an enemy Cyber Unit is adjacent to the CDC city AND the CDC fails its roll that turn.

---

## Techs (30 — 2 per track × 15 tracks)

Prerequisites reference era 11 tech IDs. Implementation plan must verify exact IDs against `tech-definitions-eras11.ts`.

### Military
```
id: 'cyber-warfare'           cost: 390   prereqs: [icbm-development, satellite-surveillance]
  unlocks: ['Cyber Unit class; enemy cities with no CDC lose −2 gold/turn while your cyber unit is adjacent']
  unlocksUnits: ['cyber_unit']

id: 'stealth-technology'      cost: 400   prereqs: [carbon-fiber, satellite-surveillance]
  unlocks: ['Stealth Bomber; stealth units cannot be targeted by ranged attacks unless enemy has a signals_hub within 2 hexes of the bomber's position']
  unlocksUnits: ['stealth_bomber']
  unlocksBuildings: ['stealth_airbase']
```

### Economy
```
id: 'globalization'           cost: 380   prereqs: [petrodollar-system, stagflation-response]
  unlocks: ['Trade routes gain +1 gold per distinct civ they connect to (scales with diplomacy; lost when at war with that civ)']

id: 'digital-economy'         cost: 385   prereqs: [petrodollar-system, container-shipping]
  unlocks: ['Cities with a market gain +1 gold per trade route they send or receive']
  unlocksBuildings: ['fintech_hub']
```

### Science
```
id: 'genomics'                cost: 390   prereqs: [molecular-biology, green-revolution-crops]
  unlocks: ['Cities produce +1 food for every 3 science they generate (cross-system synergy)']
  unlocksBuildings: ['biotech_lab']

id: 'quantum-computing'       cost: 405   prereqs: [integrated-circuits, molecular-biology]
  unlocks: ['Science-track tech costs reduced by 15%']
  unlocksBuildings: ['data_center']
```

### Civics
```
id: 'digital-rights'          cost: 380   prereqs: [civil-rights-legislation, arms-control-negotiations]
  unlocks: ['Espionage buildings each generate +1 science']

id: 'network-governance'      cost: 385   prereqs: [civil-rights-legislation, arpanet]
  unlocks: ['Your lowest-science city gains +2 science/turn from empire-wide data sharing']
```

### Exploration
```
id: 'gps-navigation'          cost: 385   prereqs: [space-exploration, deep-sea-drilling]
  unlocks: ['Land units in your own territory ignore terrain movement penalties']

id: 'private-spaceflight'     cost: 400   prereqs: [space-exploration, offshore-platforms]
  unlocks: ['+3 gold empire-wide; opens era 13 tech prerequisite chain']
```

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
  unlocks: ['Units survive a lethal hit at 1 HP once per cooldown; cooldown resets when unit spends a full turn in a friendly city without moving or attacking (geneTherapyReady flag)']
  unlocksBuildings: ['gene_therapy_clinic']

id: 'telemedicine'            cost: 380   prereqs: [vaccination-campaigns, civil-rights-legislation]
  unlocks: ['All friendly units within 3 hexes of any friendly city heal +1 HP/turn (extends healing beyond city walls)']
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
  unlocks: ['Units built from this point forward gain +3 base strength']

id: '3d-printing'             cost: 385   prereqs: [precision-engineering, megastructures]
  unlocks: ['Production overflow carries to the next item in the queue (no wasted production turns)']
```

### Construction
```
id: 'smart-cities'            cost: 390   prereqs: [megastructures, offshore-platforms]
  unlocks: ['Cities with both a factory AND semiconductor_fab generate +2 production and +1 science']
  unlocksBuildings: ['smart_grid']

id: 'green-architecture'      cost: 380   prereqs: [offshore-platforms, green-revolution-crops]
  unlocks: ['Cities with 6+ buildings ignore overextension gold penalties']
```

### Communication
```
id: 'internet'                cost: 395   prereqs: [arpanet, satellite-television]
  unlocks: ['Unlocks Cyber Defense Center building; unlocks cyber unit class prerequisite']
  unlocksBuildings: ['cyber_defense_center']

id: 'social-media'            cost: 380   prereqs: [satellite-television, counterculture]
  unlocks: ['You can see competing civs' progress on any wonder you are also building']
  unlocksBuildings: ['broadcast_tower']
```

### Espionage
```
id: 'cyber-intelligence'      cost: 385   prereqs: [black-ops-programs, satellite-surveillance]
  unlocks: ['Spies in infiltrated cities reveal the full build queue (blocked by CDC — 60% chance)']
  unlocksBuildings: ['signals_hub']

id: 'mass-surveillance'       cost: 390   prereqs: [black-ops-programs, arpanet]
  unlocks: ['See all unit positions of civs you are at war with; units within 2 hexes of an enemy CDC are hidden (70% block chance; collapses if your cyber unit is adjacent to the CDC city and block fails)']
```

### Philosophy
```
id: 'transhumanism'           cost: 385   prereqs: [structuralism, postmodernism]
  unlocks: ['Units at full HP gain +5% combat strength']

id: 'secular-rationalism'     cost: 380   prereqs: [postmodernism, structuralism]
  unlocks: ['Civics buildings each generate +1 science']
```

### Arts
```
id: 'digital-art'             cost: 380   prereqs: [pop-art, counterculture]
  unlocks: ['Each wonder you control spreads +1 gold/turn to trade route partners']

id: 'video-games'             cost: 385   prereqs: [pop-art, consumer-boom]
  unlocks: ['Entertainment buildings generate ×1.5 gold']
```

### Spirituality
```
id: 'mindfulness-movement'    cost: 380   prereqs: [ecumenical-movement, new-age-spirituality]
  unlocks: ['Units heal at 1.5× rate in friendly territory (stacks additively with telemedicine)']

id: 'new-secularism'          cost: 380   prereqs: [new-age-spirituality, ecumenical-movement]
  unlocks: ['Science buildings each generate +1 gold']
```

---

## Units

### stealth_bomber
```
type: 'stealth_bomber'
domain: 'air'
strength: 52
movement: 5
range: 3
ranged: true
productionCost: 360
techRequired: 'stealth-technology'
unlocksBuildings: ['stealth_airbase']  (trained from stealth_airbase only)
special: STEALTH — cannot be targeted by ranged attacks unless an enemy signals_hub
         is within 2 hexes of the bomber's current position (not just the city being attacked)
sfxClass: 'air-heavy'
AI: treat as strategic strike unit; prioritise targets lacking signals_hub coverage
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
special: NON-COMBAT SPECIALIST
  - Capturable (not destroyable) — captured when enemy unit enters hex
  - Passive adjacency: enemy city adjacent with no CDC loses −2 gold/turn
    (CDC blocks with 65% chance via seeded RNG each turn)
  - Market Disruption: −2 gold drain specifically targets digital-economy
    and globalization bonuses first, then base gold
sfxClass: 'land-recon'
AI: deploy toward enemy city with highest gold output lacking CDC coverage;
    do not place adjacent to heavily-garrisoned cities
```

---

## Buildings (12)

### cyber_defense_center
```
Unlocked by: internet
productionCost: 200
yields: +2 science
Special (probabilistic via seeded RNG — see contract above):
  - 65% block: Cyber Unit adjacency gold drain
  - 60% block: Spy Market Manipulation action
  - 70% hold: mass-surveillance protection bubble (2-hex radius)
  - Bubble collapses if enemy Cyber Unit adjacent + roll fails
```

### signals_hub
```
Unlocked by: cyber-intelligence
productionCost: 220
yields: +2 science
Requires: cyber_defense_center in same city
Special:
  - Raises all CDC block chances in this city by +10%
  - Stealth bombers within 2 hexes of this city are visible to ranged attacks
    (EM detection — overrides stealth quality)
```

### stealth_airbase
```
Unlocked by: stealth-technology
productionCost: 240
yields: +2 production
Special: trains stealth_bomber (only building that can)
```

### data_center
```
Unlocked by: quantum-computing
productionCost: 200
yields: +3 science
Requires: semiconductor_fab in same city (era 11 building)
```

### biotech_lab
```
Unlocked by: genomics
productionCost: 190
yields: +2 science, +1 food per 4 science generated in this city (cap: +3 food)
```

### broadcast_tower
```
Unlocked by: social-media
productionCost: 170
yields: +3 gold
Special: enemy units within 2 hexes of this city are revealed (EM broadcast detection)
```

### precision_farm
```
Unlocked by: precision-agriculture
productionCost: 160
yields: +2 food
Special: farm improvements in this city also yield +1 production
```

### gene_therapy_clinic
```
Unlocked by: gene-therapy
productionCost: 190
yields: +2 food
Special: units trained in this city start with geneTherapyReady: true
         (pre-charged — no rest turn required for first activation)
```

### telemedicine_hub
```
Unlocked by: telemedicine
productionCost: 180
yields: +2 food
Special: friendly units within 3 hexes of this city heal +1 HP/turn
         (distinct from transplant_hospital which only heals units inside the city)
```

### automated_port
```
Unlocked by: autonomous-shipping
productionCost: 200
coastalRequired: true
yields: +2 gold
Special: trade routes FROM this city have zero maintenance cost
```

### smart_grid
```
Unlocked by: smart-cities
productionCost: 210
yields: +2 production, +1 science
Requires: factory AND semiconductor_fab in same city
```

### fintech_hub
```
Unlocked by: digital-economy
productionCost: 180
yields: +2 gold
Special:
  - +1 gold per trade route this city sends or receives
  - Spies in this city can execute Market Manipulation action without full city
    infiltration (adjacency sufficient); enables soft financial warfare
```

---

## National Projects (3)

All: `uniquePerEmpire: true`, `homeEra: 12`, lifecycle per standard NP contract
(full yield at era 12–13, 0.5× at era 14, expired at era 15).

### national_cyber_command
```
civYieldBonus: { science: 3 }
Special: all CDCs empire-wide gain +5% block chance (stacks with Signals Hub;
         total still never reaches 100%)
Thematic: government body coordinating offensive and defensive cyber operations
```

### sustainability_program
```
civYieldBonus: { food: 3 }
Special: cities with 6+ buildings ignore overextension food penalties
         (green-architecture removes gold penalty; this removes food penalty —
          the two stack to make mature cities fully overextension-immune)
Thematic: domestic policy initiative — renewable energy, efficiency mandates,
          agricultural sustainability
```

### digital_silk_road
```
civYieldBonus: { gold: 3 }
Special: each trade route connecting to a civ you are not at war with generates
         +1 gold additionally
Per-route scaling allowlist entry: era 12 trade route slots are capped by building
investment; maximum realistic gain ≈ +8 gold (8 routes × 1). Rewards diplomatic
play; naturally reduced by war.
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
         — your lowest-science city gains +4 science/turn instead of +2
         (amplifies the network effect; first-mover advantage in the science race)
```

### Quest steps
1. Research both era 12 communication-track techs (`internet` + `social-media`)
2. Build Cyber Defense Centers in 3 cities
3. Connect trade routes to at least 4 distinct civs

### Canvas render
Dark globe crosshatched with glowing fiber-optic connections; server nodes pulse at
major cities; faint binary rain in background; one bright arc of light traces a
connection from one city node to another and pulses.  
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
- [ ] Wonder special effect (doubled network-governance): does not add a second yield key ✓
- [ ] NP `national_cyber_command`: science +3 ≤ 3 (two-type rule not triggered — special effect is not a yield key) ✓; total ≤ 9 ✓
- [ ] NP `sustainability_program`: food +3 ≤ 9 ✓; single key ✓
- [ ] NP `digital_silk_road`: gold +3 + per-route scaling; add to NP per-route allowlist with justification ✓
- [ ] No movement bonuses added — stacking inventory unchanged ✓
- [ ] `nanomaterials` grants +3 strength to future units — does not affect existing units ✓

---

## geneTherapyReady state contract

New boolean field on `Unit`:

```ts
geneTherapyReady?: boolean  // undefined = unit doesn't have gene-therapy benefit
                             // true = ability charged and ready
                             // false = on cooldown
```

**Set to true** when:
- Unit is trained in a city with `gene_therapy_clinic` (starts charged)
- Unit spends a full turn in a friendly city without attacking or moving (reset from cooldown)

**Set to false** when:
- Ability fires (unit would have died; survives at 1 HP instead)

**Undefined** remains until `gene-therapy` tech is researched. Units trained before the tech
do not retroactively receive the field — only units trained after tech research.

Turn manager must: check `geneTherapyReady === true` before applying lethal damage;
set to `false` after trigger; reset to `true` when rest condition is met.

---

## Cyber Unit drain implementation notes

The `−2 gold/turn` drain is applied in turn manager during yield computation:

1. For each enemy city: collect all adjacent Cyber Units owned by the current civ
2. For each adjacent Cyber Unit: roll seeded RNG against CDC block chance (65% if CDC present, 100% pass-through if no CDC)
3. Each unblocked Cyber Unit subtracts 2 from that city's gold yield for the turn
4. Drain targets `digital-economy` and `globalization` bonuses first (thematic: cyber attacks
   hit the digital economy layer), then base gold, flooring at 0

Market Manipulation spy action (enabled by `fintech_hub`):
- When spy executes the action: roll against CDC block chance (60%)
- On failure (breach): halve the city's trade-route gold for 3 turns
- Track as `cyberMarketDisruption: { turnsRemaining: number }` on the city
- Spy is consumed on use regardless of CDC outcome

---

## Test requirements

- `tests/systems/era-12.test.ts` — 30 era-12 tech definitions, all 15 tracks × 2
- Tech count tests: update expected total to 369 (339 + 30)
- `tests/systems/national-project-balance.test.ts` — era-12 describe block for all 3 NPs
- `tests/systems/wonder-definitions.test.ts` — world-wide-web coverage
- `tests/systems/tech-unlocks-consistency.test.ts` — all unlocksUnits/unlocksBuildings wired
- Unit tests for `geneTherapyReady` state transitions (charge → fire → cooldown → reset)
- Unit tests for Cyber Unit adjacency drain (with and without CDC, RNG seeded)
- Unit tests for Market Manipulation (with and without CDC, fintech_hub required)
- ERA_NAMES test: `getEraLabel(12)` returns `'Information Age'`

---

## Files to touch

| File | Action |
|---|---|
| `src/systems/tech-definitions-eras12.ts` | Create — 30 tech definitions |
| `src/systems/tech-definitions.ts` | Import and spread TECH_TREE_ERAS_12 |
| `src/ui/tech-panel.ts` | Add ERA_NAMES 8–12 |
| `src/systems/city-system.ts` | Add 12 buildings to BUILDINGS; add cyber_unit + stealth_bomber to TRAINABLE_UNITS; add PRODUCTION_ICONS entries |
| `src/core/types.ts` | Add 'cyber_unit' \| 'stealth_bomber' to UnitType union |
| `src/systems/unit-system.ts` | Add UNIT_DEFINITIONS + UNIT_DESCRIPTIONS for both units |
| `src/core/turn-manager.ts` | Cyber Unit drain logic; geneTherapyReady reset logic; Market Manipulation timed drain; NP special effects |
| `src/ai/basic-ai.ts` | Cyber Unit deployment heuristic; stealth_bomber targeting |
| `src/renderer/unit-renderer.ts` | Icons for cyber_unit + stealth_bomber |
| `src/renderer/sprites/` | Placeholder sprites for both units (TODO art) |
| `src/renderer/sprites/sprite-catalog.ts` | Register 12 building sprites + 2 unit sprites |
| `src/systems/national-project-system.ts` | national_cyber_command CDC bonus; digital_silk_road per-route gold; sustainability_program overextension food immunity |
| `src/renderer/wonders/` | world-wide-web canvas draw |
| `src/systems/wonder-definitions.ts` | world-wide-web entry |
| `src/data/legendary-landmarks.ts` | world-wide-web landmark catalog entry + motif |
| `src/data/codex.ts` | world-wide-web codex entry |
| `tests/systems/era-12.test.ts` | Create — 30 tech assertions |
| `tests/systems/national-project-balance.test.ts` | Era-12 describe block |
| `tests/systems/wonder-definitions.test.ts` | world-wide-web coverage |

---

## Explicitly out of scope (follow-up issues)

- Cyber Unit Option B (ranged strike action) — issue #419
- ERA_NAMES / tech audit for eras 1–11 — issue #420
- Unit/building obsolescence chains — issue #429
- Era 13 Autonomous Systems content — issue #417 / #418
- Art polish for placeholder sprites (TODO art)
- SFX for cyber_unit + stealth_bomber (deferred audio sprint)
