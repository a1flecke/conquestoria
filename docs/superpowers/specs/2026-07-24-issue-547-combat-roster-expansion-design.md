# Issue #547 Combat Roster Expansion Design

**Date:** 2026-07-24
**Status:** Approved design; GitHub issue drafting pending user review
**Parent:** GitHub issue #547
**Branch:** `codex/issue-547-combat-roster-design`
**Audited base:** `c6279df67a70a0d85487aa0cce77b63e1fd3415d` (`origin/main`)

## 1. Purpose

Issue #547 began as a list of missing combat units and defenses. The live repository has
since gained amphibious warfare, air basing and interception, Zone of Control, flanking,
pillage and capture, Era 13 content, city combat, crisis actors, legendary beasts, and a
large military-building and national-project roster. Treating #547 as one implementation
issue would now produce a high-risk content dump with weak upgrade chains, hidden
mechanics, duplicated buildings, and a delayed big-bang release.

This design turns #547 into the index for a dependency-ordered program of small,
independently buildable and deployable GitHub issues. Each child issue is intended to
produce one focused pull request. Dark foundations are permitted when they are inert,
tested, serializable, and immediately consumed by an identified later issue. No child
issue may leave live gameplay, saves, AI turns, hot-seat visibility, web builds, or the
Tauri build broken.

The program expands five connected areas:

1. historically legible combat upgrade families;
2. tactically distinct units and fortifications;
3. modernized barbarian combined arms;
4. Beast Stampede and Rogue Elephant Host world pressure;
5. late, non-gating legendary wonders and separate visual/audio polish.

## 2. Goals

- Repair the broken `pre_dreadnought → submarine` upgrade.
- Fill meaningful roster gaps from Chariot through Missile Cruiser without filling every
  possible historical niche.
- Separate heavy mobile, light mobile, beast, siege, capital-ship, escort, infantry,
  fighter, anti-armor, and air-defense roles.
- Give every addition a visible tactical promise rather than only larger numbers.
- Make AI production, research, movement, targeting, and formation choices catalog-driven.
- Let selected new units appear in bounded, era-appropriate barbarian forces without
  granting camps omniscience or civilization-grade armies.
- Add two different elephant crises: a steerable environmental Stampede and a coordinated
  hostile Rogue Elephant Host.
- Add Terracotta Army, Crac des Chevaliers, and NORAD only after their underlying
  mechanics are stable.
- Ship mechanics with explicit temporary art/audio fallbacks, followed by separate
  visual and audio issues containing three or four related assets where practical.
- Specify starting balance values and bounded tuning envelopes.

## 3. Non-goals

- No taming, capturing, breeding, or collectible-beast subsystem.
- No supply, fuel, logistics, general, or commander system; those remain in issue #544.
- No duplication of airborne warfare (#543), submarine stealth/ASW (#542), strategic
  deterrence (#545), or broad tech-mechanical-verb work (#420).
- No wholesale strategic-resource requirement pass. Oil requirements must be handled
  roster-wide rather than imposed only on newly added vehicles.
- No pirate capital-ship roster. Pirates retain their own hull definitions.
- No new generic military yield building or national project. Existing military
  infrastructure is made mechanically relevant instead.
- No wonder may gate the core roster, barbarians, fortifications, or crises.
- No single pull request implements an entire wave.

## 4. Design principles

### 4.1 Role succession, not literal conversion

Upgrade arrows express transfer of battlefield role and player investment. They do not
claim that one historical organization was physically converted into another. This is
especially important for `Armored Car → Attack Helicopter`, `Battleship → Missile
Cruiser`, and the deliberately fantastical handler-to-elephant branch.

### 4.2 Counterplay before power

Every power spike ships with at least one existing or same-wave answer:

- Chariot, Cuirassier, and War Elephant meet spear/pike counters.
- Tank and Main Battle Tank meet Anti-Tank Gun and Attack Helicopter.
- Fighters meet Mobile AA, Anti-Air Battery, SAM Site, and interception.
- Battleships remain vulnerable to submarines.
- Forts meet Trebuchet, Grenadier, Artillery, and Rocket Artillery.
- Rocket Artillery is fragile when directly engaged.

### 4.3 One readable reason to build each unit

No unit may be a strictly better duplicate at the same technology and price. Production
and Codex UI must state its role, counters, vulnerabilities, and upgrade direction.

### 4.4 Metadata over ID branches

Typed definitions express roles, counters, upgrade families, AA providers, fortification
interaction, barbarian eligibility, infrastructure discounts, wonder effects, and crisis
actors. ID-specific branches require a documented reason that metadata cannot represent.

### 4.5 Local knowledge for non-player actors

AI and barbarian decisions may use owned state and earned observations. A camp cannot
spawn Anti-Tank Guns because an unseen Tank exists across the map, and it cannot spawn
Mobile AA merely because the player has researched flight.

### 4.6 Historical anchors, Conquestoria consequences

Dates, dependencies, silhouettes, and battlefield roles should be recognizable. The game
may then heighten those anchors into clear tactical stories: open-ground charges,
fort-directed stampedes, command-dependent elephant hosts, saturation rockets, and
continental air-defense networks.

### 4.7 One ruleset, several levels of explanation

> **Inline review resolution — ages 7–43 and play styles:** The rules must remain deep
> without requiring every player to read a technical manual. Hiding options would help a
> young first-time player at the expense of an optimizer, so the solution is progressive
> disclosure rather than separate or simplified rulesets.

Every player-visible mechanic has three layers:

1. a plain-language role sentence of at most 18 words;
2. icon-and-text summaries for strengths, counters, and missing requirements;
3. expandable exact values and calculation breakdowns.

The first use of an acronym spells it out: anti-aircraft (AA), surface-to-air missile
(SAM), zone of control (ZOC), main battle tank (MBT), and sound effects (SFX). Color,
animation, or sound may reinforce a state but may never be its only carrier. Every
interactive target is usable at the repository's 44-pixel mobile minimum.

Optional one-time hints introduce multi-technology gates, counters, anti-aircraft
coverage, forts, splash, combined arms, and crisis herding. Hints are dismissible,
viewer-scoped, and never repeat for a different hot-seat player who has already dismissed
that hint. Recommendations may promote one understandable response, but the full legal
production and action catalog remains reachable.

### 4.8 Fair difficulty and varied strategies

> **Inline review resolution — difficulty, fun, and fairness:** Explorer, Standard, and
> Veteran use identical definitions, legal actions, combat formulas, rewards, information
> boundaries, and save data. Difficulty changes pressure and decision quality through the
> existing challenge profile; it never grants hidden unit bonuses or unlocks illegal
> counters.

- Explorer, Standard, and Veteran may vary AI planning depth, force caps, crisis force
  size, response delay, cooldown, and escalation exactly through typed challenge fields.
- AI-targeted world pressure always resolves at the repository's Standard severity.
- In hot seat, each human's personal challenge applies independently.
- No difficulty may let a computer player use unseen units, bases, AA providers, or crisis
  routes.
- A military expansionist gains tactical sequencing, not an automatic economy.
- A defender gains forts and layered air defense, but same-era siege and anti-fort roles
  prevent invulnerability.
- A builder may contain crises and complete military wonders through positioning and
  world-pressure defense rather than declaring war on another civilization.
- An explorer gains reconnaissance and route prediction without being forced into
  conquest.
- An optimizer receives exact previews and non-stacking explanations.

### 4.9 Performance and extensibility

> **Inline review resolution — architecture:** Adding 15 units must not produce 15
> parallel ID switches or repeated full-map scans. Each mechanic gets one canonical
> definition/helper and event-source facts; presentation consumes those results.

Use serializable plain objects with stable string IDs. Keep combat roles, prerequisites,
AA coverage, fortification layers, crisis ownership, barbarian observations, and wonder
effects in focused domain modules rather than extending UI handlers. Cache coverage,
role, and local-pressure queries at an appropriate turn/state revision; AI evaluation and
preview must not rescan the entire map once per candidate unit. Shared code remains
distribution-neutral and must not import Tauri APIs.

## 5. Current-state corrections that must land first

### 5.1 Upgrade integrity

`applyUpgrade` currently sets health to 100. Longer chains would turn technology unlocks
into repeatable full-heal opportunities.

The upgrade foundation must:

- preserve health percentage;
- preserve experience;
- consume action and movement;
- explicitly clear only transient state incompatible with the target definition;
- validate every required technology, building, and resource;
- calculate cost from the source/target transition;
- expose all missing requirements to UI;
- remain deterministic and save-safe.

The confirmation surface shows source and target, cost, preserved health and experience,
destination/base requirements, and the role transition before the irreversible action.
It uses text plus icons and refreshes the originating panel immediately.

Cross-domain upgrades require an explicit destination contract. In particular, Armored
Car may upgrade to Attack Helicopter only while in a friendly city with a Helicopter Base
and an available air-base slot. The upgraded unit is assigned to that base through the
canonical air-basing helper. If the base is full, destroyed, or ineligible, the upgrade is
blocked with a visible reason. `applyUpgrade` must not create an unbased air unit by only
changing `type`.

### 5.2 Mounted timing

Horseman and Cavalry currently unlock together at Horseback Riding, while Cavalry costs
only five production more and has ten additional strength. Cavalry must move to the
early-modern era before Chariot or Cuirassier can occupy a meaningful niche.

### 5.3 Existing late endpoints

- Era 9 Tank remains the armor apex through Era 13.
- Artillery is explicitly documented as waiting for Rocket Artillery.
- Era 13 Exosuit Infantry has base strength 58 and cannot be a meaningful successor to a
  proposed strength-61 Mechanized Infantry without recalibration. Its reviewed starting
  target is strength 70 with the normal ±3 strength envelope.
- The current Jet Fighter description conflates WWII and postwar aircraft.
- Anti-Air Battery already provides a live +8 city-defense modifier against air; SAM Site
  must supersede rather than duplicate it.
- Ordinary unit fortification already provides +25%; a built Fort must add value beyond
  that stance.

## 6. Shared type contracts

### 6.1 Combat roles

Add definition-driven roles sufficient to express:

- frontline;
- ranged;
- siege;
- shock;
- pursuit;
- reconnaissance;
- detection;
- anti-mounted;
- anti-armor;
- air-superiority;
- ground-air-defense;
- capital-ship;
- escort;
- formation-support;
- capture;
- civilian.

A unit may have multiple roles. UI ordering uses one primary role plus zero or more
secondary tags. AI consumes the same definitions.

### 6.2 Upgrade families and edges

Each trainable unit has explicit typed `upgradesTo` metadata and may optionally identify
an upgrade family for presentation. Civ-specific replacements may define the same
successor as the generic unit they replace. Tests must reject inferred edges, cycles,
missing targets, permanently unreachable targets, accidental terminal combat units, and
domain changes without a documented role transition.

### 6.3 Multiple prerequisites

Trainable units and buildings need `requiredTechs` semantics in addition to the legacy
single gate during migration. Eligibility, AI research planning, production UI, Codex,
upgrade validation, and tech unlock presentation must use one canonical helper. A single
completed prerequisite is insufficient when the definition is conjunctive.

### 6.4 AA providers

An AA provider definition contains:

- provider kind: unit, building, or naval unit;
- radius;
- defensive strength modifier;
- provider operational requirements;
- stacking group;
- viewer-visible presentation metadata.

When several providers cover one defense, only the strongest applicable modifier in the
same stacking group applies. Coverage computation never reveals hidden providers or
targets to an unauthorized viewer.

### 6.5 Fortification interaction

Fortification modifiers distinguish:

- ordinary unit Fortify stance;
- improvement-derived Fort/Citadel protection;
- city-building defense layers;
- bombardment mitigation;
- anti-fortification penetration.

Preview labels show each applied layer and each ignored or superseded layer.

### 6.6 Presentation metadata

Every new or materially changed definition provides:

- plain-language `roleSummary` copy;
- primary and secondary role keys;
- counter and vulnerability references derived from typed mechanics;
- full and abbreviated display names, with acronym expansion;
- Codex explanation keys and ordered exact-stat rows;
- optional first-use hint key;
- sprite and audio fallback keys.

UI must derive labels from the same metadata and calculation helpers used by gameplay and
AI. Recommendation helpers return an ordered subset plus reasons, never a replacement for
the complete legal catalog.

### 6.7 Persistence contract

> **Inline review resolution — existing saves:** The current audited save schema is 7,
> but child issues must not pre-assign future schema numbers. Each PR rebases on the
> latest main branch and increments only when it introduces required persisted data.

- Existing units are never deleted, downgraded, or made invalid by a retimed unlock.
- A Cavalry item already active or queued before its technology moves is grandfathered
  through a one-time normalized eligibility fact; new Cavalry cannot be queued early.
- Upgrade migrations preserve health, experience, orders, and valid formation state.
- Cross-domain upgrades normalize through the canonical air-base assignment contract and
  never synthesize an over-capacity base.
- Active crisis saves preserve actors, target, stage, seeded route, timers, command links,
  earned reward state, and warning delivery.
- Wonder counters store earned facts at their original viewer-safe granularity.
- Every migration and normalizer is idempotent, rejects malformed values, and supports
  schema-0, immediately previous, and current fixtures.

## 7. Unit balance contract

Starting values may change only inside these default envelopes without renewed design
review:

- production cost: ±15%;
- base strength: ±3;
- percentage modifier: ±5 percentage points.

Movement, vision, range, coverage radius, upgrade edge, splash targeting, and role
identity are outside the tuning envelope.

> **Inline review resolution — balance and fun:** Spreadsheet parity alone is
> insufficient. Each content PR runs deterministic representative matchups against its
> predecessor, successor, intended target, intended counter, and a same-era generalist.
> A role is accepted because it changes a decision, not merely because its numbers differ.

Default balance gates:

- an intended counter should improve the expected exchange by roughly 20–40% without
  routinely destroying a full-health peer in one combat;
- a specialist attacking outside its role should be 10–25% less efficient than the
  appropriate same-era generalist after cost is considered;
- a successor should be attractive after its gate while leaving a short, understandable
  upgrade decision rather than invalidating every contemporary alternative;
- one AA provider should reduce expected air damage by roughly 20–35%, not negate air
  play;
- a representative same-era siege group should break a properly supported Fort/Citadel
  position in four to eight successful engagements;
- no ordinary same-era roster composition may be an answer to every land, naval, and air
  threat;
- production turns remain within the repository's measured pacing bands in one-city,
  typical, and high-production cities.

Every affected wave also plays six deterministic scenarios: early rush, defensive turtle,
mixed combined arms, island/naval, air pressure, and a low-military builder facing world
pressure. Results and approved envelope changes belong in the issue or PR, not in an
untracked tuning note.

| Unit | Gate | Cost | Str | Move | Vision/range | Gameplay identity |
|---|---|---:|---:|---:|---|---|
| Chariot | Wheel + Horseback Riding, E2 | 65 | 30 | 3 | V2 / melee | +20% open-ground attack; −15% rough-ground attack |
| Beast Handler Company | Horseback Riding, E2 | 72 | 24 | 3 | V3 / melee | 35% detection; mobile formation support |
| War Elephant Corps | Tactics, E4 | 110 | 43 | 2 | V2 / melee | +20% open charge; shock reduces non-polearm return damage 15% |
| Trebuchet | Siege Warfare + Fortresses, E4 | 125 | 27 | 1 | V2 / bombard 2 | +25% city damage; −20% unit damage |
| Cavalry | Rifle Tactics + Professional Army, E6 | 140 | 44 | 4 | V2 / melee | light pursuit; +15% versus targets below 60 HP |
| Cuirassier | Rifle Tactics + Professional Army, E6 | 150 | 52 | 3 | V2 / melee | +15% initiating open-ground attack |
| Armored Car | Motorized Transport, E9 | 168 | 48 | 4 | V3 / melee | recon/pursuit; +15% versus targets below 60 HP; no ZOC |
| Anti-Tank Gun | Tank Warfare, E9 | 170 | 43 | 2 | V2 / ranged 1 | +50% versus armor; −15% attacking non-armor |
| Mobile AA | Air Superiority, E9 | 175 | 32 | 2 | V2 / ranged 1 | radius-1 +8 air defense; weak direct combat |
| WWII Fighter | Air Superiority, E9 | 240 | 42 | 5 | op range 4 | +20% interception; carrier eligible |
| Battleship | Dreadnought Construction, E9 | 240 | 66 | 4 | V3 / ranged 3 | +20% coastal/city bombardment; submarine vulnerability |
| Mechanized Infantry | Armored Tactics + Motorized Transport; Tank Depot | 220 | 61 | 3 | V2 / ranged 1 | mobile capture/holding; no charge bonus |
| Rocket Artillery | Rocketry, E10 | 260 | 57 | 2 | V2 / bombard 3 | 25% bounded hostile-military splash; fragile in direct combat |
| Main Battle Tank | Armored Tactics + Precision Engineering, E11 | 270 | 72 | 4 | V2 / ranged 1 | +10% with adjacent line infantry; heavy breakthrough |
| Missile Cruiser | Carrier Warfare + Radar Systems + Rocketry, E11 | 285 | 70 | 5 | V3 / ranged 3 | capital fire support; radius-1 +10 fleet AA |

### 7.1 Final upgrade graph

- `Chariot → Knight → Cuirassier → Tank → Main Battle Tank`
- `Horseman → Cavalry → Armored Car → Attack Helicopter → Combat Drone`
- `Scout Hound → Beast Handler Company → War Elephant Corps`
- `War Hound → Beast Handler Company`
- `Shadow Warden` remains a terminal Persian detection specialist
- `Catapult → Trebuchet → Cannon → Artillery → Rocket Artillery`
- `Ballista → Cannon`
- `Pre-Dreadnought → Battleship → Missile Cruiser`
- `Biplane → WWII Fighter → Jet Fighter`
- `Infantry → Mechanized Infantry → Exosuit Infantry`

Anti-Tank Gun and Mobile AA remain specialist terminals. The domain transition from
Armored Car to Attack Helicopter is presented as succession in light mobile attack and
reconnaissance, not literal vehicle conversion.

### 7.2 Mounted and beast rules

- Chariot requires Horses.
- Cavalry and Cuirassier require Horses; Cuirassier also requires Iron.
- Beast Handler has no strategic-resource requirement.
- Access to the live Ivory luxury resource discounts War Elephant production 15% but is
  not a hard requirement.
- Ivory does not discount upgrades or crisis forces.
- Spear and Pike counters receive +35% against War Elephant and ignore its shock-based
  return-damage reduction.
- War Elephant receives −15% attack in forest, jungle, swamp, or hills.
- Rome's War Hound and the generic Scout Hound converge into Beast Handler.
- Persia's Shadow Warden never converges.

### 7.3 Dreadnought Construction bridge

Add one Era 9 maritime bridge technology:

- ID: `dreadnought-construction`;
- name: Dreadnought Construction;
- cost: 275;
- prerequisites: Naval Armor + Bessemer Steel;
- `countsForEraAdvancement: false`;
- unlock: Battleship.

Pre-Dreadnought remains available from Naval Armor until this bridge completes, then
obsoletes into Battleship. Submarine Warfare unlocks Submarine independently and never
serves as a surface-ship upgrade gate. The new tech's unit unlock places it in the
repository's marquee pacing band and must pass the full-catalog pacing audit.

### 7.4 Aircraft correction

- Move Biplane from Air Superiority to Aviation.
- Add WWII Fighter at Air Superiority.
- Jet Fighter remains at Jet Aviation and is described as postwar.
- WWII Fighter supports strike, intercept, and rebase at operational range 4 and ferry
  range 8.
- WWII Fighter has a 20% interception modifier but no bomber-style bombard profile.

### 7.5 Rocket splash

Rocket Artillery splash:

- applies after legal primary resolution;
- deals 25% of final primary damage to at most two adjacent hostile military units;
- uses stable ID ordering after eligibility;
- never affects allies, civilians, hidden units, cities, embarked cargo, or units outside
  earned visibility;
- appears in preview, combat history, AI target evaluation, and notifications;
- cannot recursively produce more splash.

### 7.6 Combined-arms tank bonus

Main Battle Tank gains +10% attack and defense while adjacent to at least one friendly
eligible line-infantry unit. Multiple infantry do not stack. Eligible infantry is
definition-driven and includes Mechanized and Exosuit Infantry. AI formation logic uses
the same predicate.

The formation helper must not require an exact unit ID and must not reward clustering
multiple infantry around one tank. Preview explains which adjacent unit supplies the
bonus; an unauthorized viewer receives no identity leak.

## 8. Infrastructure contract

### 8.1 Mounted buildings

- Stable: 15% local discount for light mounted and handler units.
- Cavalry Academy: 15% local discount for heavy mounted and elephant units.
- A unit receives at most one discount.
- Light/support: Horseman, Cavalry, Armored Car, Beast Handler.
- Heavy: Chariot, Knight, Cuirassier, War Elephant.
- Tanks, helicopters, and drones receive neither.

### 8.2 Siege Workshop

- 20% local discount for Catapult, Ballista, and Trebuchet.
- Obsoletes at Black Powder.
- Cannon and later siege use industrial or national infrastructure.

### 8.3 Tank Depot

- 10% local production discount for Armored Car, Tank, Mechanized Infantry, and Main
  Battle Tank.
- Eligible vehicles stationed in its city heal +5 additional HP per turn.
- Anti-Tank Gun and Mobile AA do not become armor merely because they are motorized.

### 8.4 Fort/Citadel improvement

- One persisted `fort` improvement type.
- Fort unlock: Fortresses.
- Build time: five Worker turns.
- Citadel scaling: automatic at Fortification Engineering; the save does not rewrite the
  improvement into another type.
- Fort supplies a separate +10% defensive multiplier to an occupying friendly land
  combat unit.
- Citadel supplies +20%.
- Ordinary Fortify remains +25%, producing approximately +37.5% and +50% combined before
  terrain rather than replacing Fortify.
- Trebuchet, Grenadier, Artillery, and Rocket Artillery ignore half of only the
  improvement-derived multiplier.
- Empty or pillaged forts grant no defense.
- Friendly entry does not end movement; hostile entry or pillage does.
- Forts cannot be adjacent to another Fort/Citadel.
- Empire cap: city count plus one additional frontier fort per three cities. An
  above-city-count placement is a frontier fort only when the owned target tile is
  adjacent to unowned or foreign-owned territory.
- Cannot occupy city centers, water, mountains, unowned tiles, or non-replaceable
  improvements.
- Catastrophes, pillage, repair, save normalization, worker replacement UI, AI placement,
  and world actors use canonical improvement paths.

### 8.5 Coastal Battery

- Gate: Naval Armor, Era 8.
- Cost: 170.
- +8 city defense against naval attacks.
- First naval attack against the city each turn receives counterfire equal to 20% of
  damage dealt, capped at 12.
- No land or air benefit.
- Works against player, AI, barbarian, and pirate attackers.

### 8.6 Bunker

- Gate: Reinforced Concrete, Era 8.
- Cost: 175.
- Requires Walls, not Star Fort.
- If Star Fort exists, Bunker suppresses its +5 contribution.
- Effective layer: +8 flat defense and 15% bombardment mitigation.
- No mitigation for adjacent melee attacks.
- UI labels Star Fort as superseded rather than summing both layers.

### 8.7 SAM Site and Radar Station

- SAM gate: Radar Systems + Rocketry, Era 10.
- SAM cost: 195.
- Requires Anti-Air Battery and Radar Station.
- SAM radius: 2; air-defense modifier: +12.
- Anti-Air Battery remains locally buildable until SAM completion cannot be blocked in a
  newly founded city.
- Radar Station retains cost 180 unless the pacing gate requires a change.
- Strongest applicable AA source wins; Mobile AA, Anti-Air Battery, SAM, and Missile
  Cruiser do not add together.
- Coverage UI exposes only viewer-known providers and no hidden aircraft.

> **Inline review resolution — defensive play:** Forts and layered AA should make
> preparation rewarding, not passive play dominant. AI valuation includes threatened
> approaches, local air/naval pressure, maintenance and opportunity cost, and existing
> same-group coverage. It must not fill every eligible city with redundant defenses.
> Overlay toggles default off, remember only the current viewer's preference, and preserve
> map pan/zoom and mobile interaction.

## 9. Barbarian modernization

### 9.1 Eligibility

| Unit | Barbarian window | Rule |
|---|---|---|
| Chariot | E2–4 | common mobile alternative |
| Trebuchet | E4–6 | max one before camp escalation |
| Cavalry | E6–8 | common light mobile slot |
| Cuirassier | E6–8 | rare heavy alternative; not alongside equivalent Cavalry slot |
| Armored Car | E9–11 | mobile reconnaissance/raid slot |
| Anti-Tank Gun | E9+ | only after locally observed armor pressure |
| Mobile AA | E10+ | max one; only after locally observed air pressure |
| Mechanized Infantry | E10+ | uncommon frontline |

Ordinary camps exclude Beast Handler, War Elephant, WWII Fighter, Main Battle Tank,
Rocket Artillery, Battleship, Missile Cruiser, civilization-unique units, crisis actors,
and strategic-deterrence units.

### 9.2 Local response facts

- Armor pressure becomes known after armor is visible within six hexes of the camp or
  attacks a camp-owned unit.
- Air pressure becomes known after a visible based aircraft or air strike within the
  local region.
- Facts are persisted only as coarse camp-local pressure, not copied live unit objects.
- Facts expire after a bounded quiet period.

### 9.3 Composition

- Frontline: 40–60%.
- Ranged plus siege: at most 30%.
- Mobile: at most 40%.
- Specialists: at most 25%.
- AA: at most one per active camp force.
- No more than one siege unit until existing escalation.
- Resource absence never makes the roster empty.
- Selection is seeded and reproducible.
- Era changes affect future reinforcement choices; they do not mass-upgrade existing
  units.

> **Inline review resolution — computer-player fairness:** Modernization responds only to
> persisted camp-local observations and the current era window. Difficulty may alter the
> existing decision quality and force budget, but it cannot relax eligibility, specialist
> caps, or information rules. A seeded fallback always yields a viable force when no
> specialist response is legal.

## 10. Beast world pressure

### 10.1 Crisis-force ownership

Rogue formations use a non-diplomatic crisis-force owner recognized by owner-kind,
hostility, targeting, combat rewards, movement safety, fog, notifications, AI, save
normalization, and cleanup. It is not a fake major civilization, rebel faction, ordinary
barbarian camp, pirate faction, or legendary beast lair.

Crisis-only unit types are not trainable and scale by era with exact formulas:

- Stampede Herd strength: `28 + 4 × (era - 3)`, producing 28–48 across eras 3–8.
- Rogue Handler strength: `22 + 3 × (era - 4)`, producing 22–37 across eras 4–9.
- Rogue Elephant strength: `40 + 4 × (era - 4)`, producing 40–60 across eras 4–9.

All have 100 health. Herds and Rogue Elephants move two hexes; Rogue Handlers move three.
Challenge changes force size and escalation behavior, not these base formulas. AI-targeted
crises use the repository's existing standard-severity rule.

> **Inline review resolution — solo, hot seat, and noncombat players:** Crisis targeting,
> warnings, rewards, and history are scoped to the target civilization and current
> viewer. A hot-seat handoff cannot reveal another human's route preview or warning before
> that player's turn. Computer players use the same visible route and command-link facts
> as humans. Containment is a complete, rewarding solution; neither crisis requires a war
> declaration, city conquest, or a particular trainable unit.

### 10.2 Beast Stampede

- Era band: 3–8.
- Geography: plains or grassland region near a qualifying city.
- Maximum once per target civilization per game.
- Mutually exclusive with an active Rogue Elephant Host for that target.
- Warning stage lasts one target turn; herd actors cannot move or attack on spawn.
- Spawn: Explorer 2, Standard 3, Veteran 4 herd actors.
- Herd movement: two hexes per crisis turn along a seeded outward route.
- Cannot enter water, mountains, or city centers.
- Does not deliberately capture cities or pursue units.
- Crossing an occupied tile triggers trampling combat.
- Crisis-wide pillage cap: two improvements per turn.
- Fort/Citadel tiles add route cost and end that actor's movement on entry.
- Duration: six active turns, after which surviving herds leave the map.

#### Herding

- When visible, UI previews the next two intended route hexes.
- Forts, Citadels, and fortified military units contribute a bounded avoidance score.
- Multiple screens cannot stack beyond the per-hex cap.
- Herd selects the lowest-cost legal outward route using seeded stable tie-breaking.
- Route recalculates only at the herd turn, keeping the prior player-turn preview honest.

#### Resolution and reward

- Defeated: all herd actors destroyed.
- Contained: expires with no city damage, no civilian killed, and at most two
  improvements pillaged.
- Survived: expires without containment.
- Defeated and Contained both grant `10 × era` gold, capped at 80.
- Both grant one ten-turn Herding Insight charge: next Beast Handler or War Elephant
  trained costs 20% less.
- If no eligible unit becomes reachable before expiry, convert the charge to 20 gold.
- No duplicate beast-hoard payout.

The preview names the containment conditions and shows remaining pillage/casualty budget
without exposing hidden route tiles. Explorer, Standard, and Veteran use the same
containment and reward rules.

### 10.3 Rogue Elephant Host

- Era band: 4–9.
- Maximum once per target civilization per game.
- Mutually exclusive with Stampede for that target.
- One visible warning turn; no spawn-turn attack.
- Explorer: one Rogue Handler plus one elephant.
- Standard: one plus two.
- Veteran: one plus three only after representative combat simulation passes.
- Host targets valuable improvements, forts, and weakly defended city approaches.
- While a Handler survives within two hexes, elephants gain +20% attack and defense plus
  coordinated target selection.
- Handler bonuses do not stack.
- Killing the Handler immediately removes coordination, converts surviving elephants to
  Stampede actors, and starts a three-turn dispersal clock.
- Resolution: destroy the host, break command and survive dispersal, or force all herds
  off-map.
- Reward: `12 × era` gold capped at 100 plus one ten-turn Recovered Harnesses charge.
- Recovered Harnesses discounts the next War Elephant by 25%; expiry converts to 25 gold.
- No capture, taming, camp reward, or duplicate elephant reward.
- Save/load preserves command links, conversion state, route, warning stage, target,
  reward charge, and duration.

The handler link is visually and textually legible; killing the handler is a tempting
high-skill shortcut, while screening and dispersal remain viable for cautious players.
AI compares handler removal, elephant damage, screen placement, and city defense using
only locally observed state.

## 11. Legendary wonders

Wonders are the final non-gating wave. Before them, typed military quest facts and
tactical reward effects must be definition-driven, recorded at mutation sources,
serializable, viewer-safe, and evaluated by generic AI.

### 11.1 Terracotta Army

- Era: 3.
- Cost: 125.
- Gates: Iron Forging + Masonry. Both are reachable in Era 3; the wonder must not depend
  on the Era 4 Tactics technology.
- Resource: Stone. The audited live resource catalog has no Clay resource.
- Quest:
  - simultaneously field four combat units spanning at least three roles;
  - win three combats where the participating unit survives.
- Reward:
  - first newly trained land combat unit in each of frontline, ranged, mobile, and siege
    per era starts with 10 experience;
  - maximum four grants per era;
  - unused grants do not carry forward;
  - upgrades, captures, summons, crisis actors, barbarians, and civilians do not qualify.
- No unit duplication.

### 11.2 Crac des Chevaliers

- Display spelling: `Crac des Chevaliers`; search aliases may include `Krak`.
- Era: 5.
- Cost: 220.
- Gates: Fortresses + Professional Army.
- Resource: Stone.
- Quest:
  - build three Forts in distinct city territories;
  - repel two attacks while a friendly unit occupies a Fort or Citadel.
- Reward:
  - occupying friendly units heal +5 HP at turn end;
  - garrisoned Citadels grant adjacent friendly defenders +5%;
  - adjacent bonus never stacks and does not apply from an empty/pillaged Citadel;
  - siege specialists ignore the adjacent reward bonus.

### 11.3 NORAD

- Era: 11.
- Cost: 380.
- Gates: Radar Systems + Rocketry.
- Quest:
  - operate Radar Stations in three distinct cities;
  - complete three successful interceptions.
- Reward:
  - each owned SAM Site whose city has an operational Radar Station extends from radius 2
    to radius 3;
  - first eligible interception per owner turn within any such radius-3 coverage gains
    +10%;
  - later interceptions use ordinary modifiers;
  - coverage grants no hidden aircraft or base intel.

## 12. Visual and audio delivery

Mechanics issues must register a valid temporary catalog mapping, update the canonical
placeholder audit in #622 where applicable, and link the replacement batch. Visual and
audio are never combined in one issue.

### 12.1 Visual batches

1. Chariot, Cavalry/Cuirassier distinction, Beast Handler, War Elephant.
2. Armored Car, Anti-Tank Gun, Mechanized Infantry, Main Battle Tank.
3. WWII Fighter, Mobile AA, SAM Site, Radar Station.
4. Trebuchet, Rocket Artillery, Battleship, Missile Cruiser.
5. Fort/Citadel, Coastal Battery, Bunker.
6. Stampede herd, Rogue Handler treatment, Rogue Elephant treatment, crisis path marker.
7. Terracotta Army, Crac des Chevaliers, NORAD bespoke wonder landmarks.

### 12.2 Audio batches

1. Ancient mounted and beast combat.
2. Industrial vehicles and anti-armor.
3. Air combat and air-defense alerts.
4. Siege and naval heavy weapons.
5. Fortification construction, damage, pillage, and repair.
6. Stampede and Rogue Host warnings, movement, command break, and resolution.
7. The three wonder construction/completion identities.

Every batch includes provenance, catalog coverage, bounded playback/throttling,
representative event routing, and tests that prove the live event reaches the sound
director.

> **Inline review resolution — accessibility and hot-seat audio:** Every warning and
> mechanically relevant sound has an on-screen text/icon equivalent. Playback uses the
> existing mixer categories and respects mute and per-category volume. Repeated AA fire,
> rocket splash, herd movement, and multi-actor resolution are coalesced within a bounded
> window so one event cannot create an audio wall. Reduced motion disables camera shake
> and large route pulses without disabling information. Hidden activity for a non-current
> hot-seat player must not be inferable from audio.

## 13. Ordered GitHub issue program

Each numbered item below becomes one child issue and normally one pull request.
Dependencies are strict unless an issue explicitly states otherwise.

### Wave 0 — Contracts and safeguards

1. **Fix upgrade integrity before expanding combat chains**
2. **Add conjunctive unit/building prerequisite metadata**
3. **Define combat roles, counters, and explicit upgrade families**
4. **Expose roles, counters, vulnerabilities, and upgrade chains in UI/Codex**
5. **Expose named roster modifiers in combat preview and history**
6. **Define canonical ground-based AA coverage and strongest-source stacking**

### Wave 1 — Mounted and beast progression

7. **Retime Cavalry and repair the existing mounted roster**
8. **Add Chariot as the ancient heavy-mobile opener**
9. **Add Beast Handler Company with generic/Roman convergence**
10. **Add War Elephant Corps with shock and Ivory affinity**
11. **Add Cuirassier as the early-modern heavy cavalry step**
12. **Add Armored Car as light-mobile reconnaissance and pursuit**
13. **Make Stable and Cavalry Academy discounts family-driven and non-stacking**

### Wave 2 — Immediate industrial roster repair

14. **Split Biplane, WWII Fighter, and Jet Fighter into credible air eras**
15. **Add Anti-Tank Gun and armor-pressure AI**
16. **Add Mobile AA field protection and escort AI**
17. **Add Mechanized Infantry and recalibrate Exosuit succession**

### Wave 3 — Naval and siege succession

18. **Add the Dreadnought Construction bridge technology**
19. **Add Battleship and repair Pre-Dreadnought succession**
20. **Add Trebuchet between classical siege and Cannon**
21. **Make Siege Workshop recognize the complete classical siege family**
22. **Add Rocket Artillery with bounded saturation splash**
23. **Add Main Battle Tank with line-infantry combined arms**
24. **Make Tank Depot support the typed armored family**
25. **Add Missile Cruiser as modern capital fire support and fleet AA**

### Wave 4 — Fortification and integrated defense

26. **Add the worker-built Fort with automatic Citadel scaling**
27. **Add Fort/Citadel placement, cap, status, and defense UI**
28. **Add Coastal Battery naval defense and bounded counterfire**
29. **Add Bunker as the non-stacking modern city-fortification tier**
30. **Add SAM Site as Radar-enabled city air defense**
31. **Make Radar Station mechanically drive AA coverage and viewer-safe overlays**

### Wave 5 — Barbarian modernization

32. **Replace the hardcoded barbarian era roster with typed eligibility**
33. **Add deterministic weighted barbarian combined-arms composition**
34. **Add camp-local armor and air pressure observations**
35. **Integrate the approved new units into bounded barbarian reinforcements**
36. **Audit barbarian modernization balance, spawn caps, and AI/player parity**

### Wave 6 — Beast world pressure

37. **Add reusable non-diplomatic crisis-force ownership**
38. **Add deterministic roaming-herd movement and herding previews**
39. **Add the Beast Stampede crisis and containment rewards**
40. **Add Beast Stampede AI response, notifications, and hot-seat-safe presentation**
41. **Add the coordinated Rogue Elephant Host**
42. **Add Handler command break, Stampede conversion, and Rogue Host resolution**
43. **Audit elephant-crisis balance, save/load, overlap caps, and world parity**

### Wave 7 — Visual polish

44. **Visual batch: ancient mounted and beast formations**
45. **Visual batch: industrial vehicles and anti-armor**
46. **Visual batch: air combat and air defense**
47. **Visual batch: siege and capital ships**
48. **Visual batch: Fort/Citadel and defensive buildings**
49. **Visual batch: Stampede and Rogue Elephant Host**

### Wave 8 — Audio polish

50. **Audio batch: ancient mounted and beast combat**
51. **Audio batch: industrial vehicles and anti-armor**
52. **Audio batch: air combat and air-defense alerts**
53. **Audio batch: siege and naval heavy weapons**
54. **Audio batch: fortification lifecycle**
55. **Audio batch: Stampede and Rogue Elephant Host**

### Wave 9 — Legendary wonders

56. **Add typed military quest facts for legendary wonders**
57. **Add definition-driven tactical legendary-wonder rewards**
58. **Add Terracotta Army**
59. **Add Crac des Chevaliers**
60. **Add NORAD**
61. **Visual batch: Terracotta Army, Crac des Chevaliers, and NORAD**
62. **Audio batch: Terracotta Army, Crac des Chevaliers, and NORAD**
63. **Run the final military-content integration, pacing, and release audit**

Visual and audio waves may run behind mechanics as soon as every item in their batch has a
stable ID and live event contract. They do not wait for all crises or wonders.

## 14. Required child-issue body

Every created GitHub issue must contain:

1. **Problem**
   - Current live behavior and why it is incomplete or misleading.
   - Audited base commit and relevant existing definitions.

2. **Player outcome**
   - What the player can understand, decide, and do after the issue lands.

3. **Exact scope**
   - Data, canonical systems, UI/renderer/audio paths, AI, saves, and tests in scope.

4. **Out of scope**
   - Adjacent issues that must not be absorbed.

5. **Gameplay contract**
   - Exact starting values, allowed tuning envelope, modifiers, stacking, negative cases,
     and upgrade behavior.

6. **Dependencies**
   - Required predecessor child issues and adjacent repository issues.

7. **Implementation seams**
   - Likely source and mirrored test areas discovered in the audit.
   - Instructions to re-audit paths against latest `origin/main` before editing.

8. **AI and non-player behavior**
   - Production/research eligibility, roles, formation or targeting, barbarian/crisis
     decision, and parity requirements.

9. **UX and information boundaries**
   - Production reachability, immediate panel refresh, preview labels, touch targets,
     hot-seat viewer scope, fog/intel behavior, and accessibility.

10. **Persistence**
    - Schema/migration needs, normalization, idempotence, and active-state save/load.

11. **Art/audio fallback**
    - Temporary mapping, catalog entry, and linked replacement batch.

12. **Acceptance criteria**
    - Positive and negative Given/When/Then outcomes.

13. **Verification**
    - Mirrored targeted tests, source-rule checks, build, full test suite before PR,
      wonder regressions where applicable, and dual-release checks when distribution
      paths are touched.

14. **Delivery rule**
    - One focused PR, deployable at merge, no hidden dependency on an unmerged sibling,
      and no claim of completed final art/audio when placeholders remain.

## 15. Cross-cutting acceptance criteria

Every content issue proves:

- exact tech and production eligibility;
- explicit upgrade and obsolescence behavior;
- resource and building requirements;
- AI roles, production candidacy, and research planning;
- positive and negative counter cases;
- human and at least one non-human mutation path;
- honest description, preview, and Codex text;
- immediate UI refresh after player actions;
- save normalization when persisted shape changes;
- hot-seat/current-player information isolation;
- temporary sprite and audio registration;
- representative production pacing;
- no hardcoded ID branch where shared metadata is sufficient.

> **Inline review resolution — implementation completeness:** “Definition added” is not
> completion. The mutation source, AI, production/research planning, UI, renderer, audio
> fallback, persistence, and both human and non-human callers must agree before content
> becomes reachable.

Each applicable issue also proves:

- Explorer, Standard, and Veteran legality parity, with challenge differences exercised
  only through existing or explicitly typed profile fields;
- full legal catalog reachability after any recommendation or grouping;
- plain-language and exact-detail UI layers, 44-pixel targets, icon-plus-text status,
  acronym expansion, and reduced-motion behavior;
- no color-only, sound-only, or animation-only information;
- no stale panel after build, upgrade, reorder, cancel, pillage, repair, crisis phase, or
  current-player change;
- no hidden-information leak through preview, AI selection, overlay, history,
  notification, audio, or hot-seat handoff;
- deterministic behavior across at least three representative seeds when randomness or
  tie-breaking is involved;
- bounded notification/audio volume for multi-actor events;
- no per-candidate full-map scan in AI, coverage, route, or recommendation code;
- current-schema round trip plus schema-0 and immediately previous migration fixtures
  when persisted shape changes.

New buildings additionally prove generic AI production eligibility. New wonders prove
definition-driven AI eligibility, global uniqueness, no same-civilization
self-competition, quest event provenance, viewer-scoped rival intel, landmark
presentation, and wonder regression coverage.

### 15.1 Required play matrix

The final issue in every mechanics wave executes and records:

| Mode | Required scenario |
|---|---|
| Solo Explorer | first-time hints, recommended response, containment, muted audio |
| Solo Standard | representative combined-arms and production pacing |
| Solo Veteran | higher pressure without illegal knowledge or altered unit rules |
| AI target | Standard-severity crisis, legal production/research, no omniscience |
| Two-human hot seat | independent personal challenge, viewer-scoped overlays and audio |
| Save/load mid-state | queue, upgrade eligibility, fort/AA state, crisis or wonder facts |

For UI work, the plan and PR include a Player Truth Table, Misleading UI Risks, an
Interaction Replay Checklist, and rendered-DOM assertions for every player-visible
transition. Queue changes assert active item, order, exact estimated turns, remove/reorder
behavior, and the visible post-action state.

### 15.2 Regression and verification order

Implementation follows test-driven delivery:

1. add the smallest failing regression for the exact contract;
2. implement through the canonical helper;
3. run the mirrored targeted tests and source-rule check;
4. run adjacent catalog, AI, save, hot-seat, and notification-volume regressions;
5. run `yarn build` and the full suite before push or PR;
6. run wonder regressions for wonder or legendary-quest changes;
7. run both web and Tauri builds only when distribution/platform paths are touched.

The final program audit replays the existing solo setup, turn loop, production, combat,
save/import, current-player switch, and hot-seat tests to detect regressions that focused
content tests cannot see.

## 16. Rollout and failure containment

- Merge Wave 0 before content depending on it.
- Prefer one live content item per PR.
- Foundation PRs remain inert until their first consumer and include direct contract tests.
- Do not merge a definition that becomes player-reachable without AI roles, production
  reachability, preview honesty, save safety, and fallbacks.
- If balance simulation rejects a starting target outside the allowed envelope, update
  this design or obtain explicit approval rather than silently changing the unit's role.
- If an inherited player-visible bug is exposed while extracting a shared path, fix it in
  the same issue or create a fully specified blocker issue before proceeding.
- Rewrite #547 as a checked dependency index only after every child issue exists and its
  final number/link is known.

> **Inline review resolution — small, safe delivery:** Dark code is allowed only when it
> is inert, directly tested, and has no player-visible claim. Every PR must build, deploy,
> load current saves, and leave all previously reachable play intact. A consumer and its
> required AI/UI/save behavior merge together; art and audio replacement remain separate
> because either can be safely improved later without changing mechanics.

- Rebase every child branch on the latest `origin/main`; do not reserve future schema
  numbers or rely on line locations from this audit.
- Use one issue and normally one PR per numbered child. If a child becomes too large,
  split it into independently deployable contract and consumer slices and update
  dependency links before coding.
- A definition may merge dark before its consumer only when production, AI, Codex, and
  unlock paths all prove it unreachable.
- Feature flags are not substitutes for integration tests and must not create divergent
  saved-game shapes.
- Each PR body records measured balance scenarios, migrations, player-facing behavior,
  targeted checks, build, and full-suite results.

## 17. Parent issue completion

Issue #547 closes only when:

- Waves 0–6 are complete, satisfying **Core combat/world-pressure complete**;
- Waves 7–8 have replaced every temporary visual and audio fallback;
- Wave 9's three wonders and their visual/audio batches are complete;
- the final integration, pacing, save, wonder, web, and Tauri audit has passed.

The parent stays open through the wonder epilogue because the user explicitly expanded
this program to include it. The body shows two progress milestones: **Core
combat/world-pressure complete** and **Full program complete**.

## 18. Historical reference anchors

These references support the design's broad chronology and battlefield identities. They
are anchors for believable presentation, not claims that Conquestoria's upgrade families
are literal historical conversions.

- British Museum, [Horses and human history](https://www.britishmuseum.org/blog/horses-and-human-history)
- British Museum, [Chariots in the Sahara](https://africanrockart.britishmuseum.org/thematic/chariots-in-the-sahara/)
- British Museum, [Ptolemaic war-elephant object record](https://www.britishmuseum.org/collection/object/X__813)
- Imperial War Museums, [How Britain invented the tank in the First World War](https://www.iwm.org.uk/history/how-britain-invented-the-tank-in-the-first-world-war)
- Imperial War Museums, [The tanks and guns of the Second World War's Desert War](https://www.iwm.org.uk/history/the-tanks-and-guns-of-the-second-world-wars-desert-war)
- Imperial War Museums, [RNAS Armoured Car Expeditionary Force, 1915–1917](https://www.iwm.org.uk/collections/item/object/205325491)
- U.S. Army Center of Military History, [Modernizing the King of Battle, 1973–1991](https://history.army.mil/portals/143/Images/Publications/catalog/69-5-1.pdf)
- UNESCO, [Mausoleum of the First Qin Emperor](https://whc.unesco.org/en/list/441)
- UNESCO, [Crac des Chevaliers and Qal'at Salah El-Din](https://whc.unesco.org/en/list/1229)
- NORAD, [NORAD Agreement and command history](https://www.norad.mil/About-NORAD/NORAD-Agreement/)
