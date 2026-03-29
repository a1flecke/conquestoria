# Milestone 4 — "Deep Strategy" Design Specification

**Date:** 2026-03-29
**Status:** Approved
**Depends on:** Milestone 3 (complete), M3 bugfix pass (complete)
**Goal:** Transform Conquestoria from a solid 4X foundation into a game with deep strategic layers — espionage, diplomatic power plays, empire instability, buildable wonders, and a full advisor council with real personality.

---

## 1. Milestone Decomposition

M4 is delivered as five sub-milestones. Each is independently playable — no stubs, no placeholder systems. Every sub-milestone ships a complete slice of new gameplay alongside new civilizations and QoL improvements.

| Sub | Theme | Major Systems | Civs | QoL |
|-----|-------|--------------|------|-----|
| **4a** | Eyes & Ears | Espionage stages 1-2, Spymaster advisor | France, Germany, Gondor, Rohan | Terrain readability |
| **4b** | Power & Influence | Vassalage/betrayal/embargoes, simple wonders (15-20) | Russia, Ottoman, Shire, Isengard | Combat tutorial |
| **4c** | Shadow Wars | Espionage stages 3-4, breakaway factions (unrest + revolt) | Spain, Viking, Prydain, Annuvin | Icon legend |
| **4d** | Grand Ambitions | Espionage stage 5, quest wonders (15-20), full breakaway, Artisan advisor | Lothlórien, Narnia, Atlantis | — |
| **4e** | The Council | Advisor lobbying/disagreements, auto-explore, custom civs, desktop UI | Wakanda, Avalon, custom civ | Desktop UI, balance pass |

---

## 2. Espionage System

The largest new system in M4. Five stages that mirror the game's era progression, each unlocking more powerful (and riskier) spy operations. Delivered incrementally: stages 1-2 in M4a, stages 3-4 in M4c, stage 5 in M4d.

### 2.1 Core Mechanics

- **Spy unit type:** Recruited from cities with Barracks (or equivalent military building). Invisible to other civs unless detected. One spy per city initially, scaling with espionage tech.
- **Assignment:** Assign a spy to a foreign city (offensive) or your own city (counter-intelligence). Spies travel to their target city over 1-2 turns.
- **Missions:** Each mission has a turn duration, success chance, and failure consequence. Success chance = spy experience + espionage tech level − target city's counter-intelligence score.
- **Detection:** Failed missions result in expulsion (spy returned home, 5-turn cooldown) or capture (spy lost, diplomatic incident). Capture triggers a diplomatic event: relationship penalty, victim can demand apology or declare war.
- **Spy experience:** Spies gain XP from successful missions. Higher XP = better success rates. Losing a veteran spy is a meaningful setback.

### 2.2 Stage 1 — Scouts (Tribal–Bronze Age)

Passive intelligence only. No active missions.

- Assign spy to a foreign city → reveals fog of war in a radius around that city
- Reports troop movements: units entering/leaving the city's territory
- Low risk — detection chance is minimal at this stage

### 2.3 Stage 2 — Informants (Iron Age–Classical)

First active missions unlock.

| Mission | Duration | Effect |
|---------|----------|--------|
| Gather Intel | 3 turns | Reveals target civ's tech progress, treasury, and active treaties |
| Identify Resources | 4 turns | Reveals strategic resources in target city's territory |
| Monitor Diplomacy | 3 turns | See target's trade partners and relationship scores |

### 2.4 Stage 3 — Spy Rings (Medieval–Renaissance)

Spies become active agents capable of disruption.

| Mission | Duration | Effect |
|---------|----------|--------|
| Steal Technology | 5-8 turns | Copy a tech the target has that you don't |
| Sabotage Production | 4 turns | Target city loses 3-5 turns of production progress |
| Incite Unrest | 5 turns | Increases unhappiness in target city, pushes toward breakaway ladder |
| Counter-Espionage | Passive | Station spy in own city, increases detection chance for enemy spies |

### 2.5 Stage 4 — Shadow Operations (Enlightenment–Industrial)

High-risk, high-reward covert operations.

| Mission | Duration | Effect |
|---------|----------|--------|
| Assassinate Advisor | 6 turns | Disable one of target civ's advisors for 10 turns |
| Forge Documents | 5 turns | Fabricate diplomatic incident between two other civs (relationship penalty between them) |
| Fund Rebels | 6 turns | Inject resources into an unrest/revolt city, accelerating breakaway |
| Arms Smuggling | 4 turns | Spawn stronger hostile units (barbarians/rebels) in enemy territory |

### 2.6 Stage 5 — Digital Warfare (Modern–Information)

Remote operations. Some missions no longer require a placed spy.

| Mission | Duration | Effect |
|---------|----------|--------|
| Cyber Attack | 2 turns | Shut down target city's production for 3 turns. Remote — no spy placement needed. |
| Misinformation Campaign | 3 turns | Reduce target civ's research speed by 20% for 10 turns |
| Election Interference | 5 turns | Force government change in target civ (Republic/Democracy only) for 15 turns |
| Satellite Surveillance | Passive | Global vision of all surface tiles in target civ's territory (requires Satellites tech) |

### 2.7 Spy Promotions

After enough successful missions, spies specialize (permanent choice):

- **Infiltrator** — bonus to offensive missions (steal, sabotage, cyber attack)
- **Handler** — bonus to influence missions (incite, forge, fund rebels)
- **Sentinel** — bonus to counter-espionage and detection

### 2.8 Double Agents (Stage 5)

A captured enemy spy can be "turned" instead of expelled. The double agent continues reporting to their home civ but feeds false intel — wrong troop counts, fake tech progress, fabricated treaties. The enemy civ makes decisions based on lies. If they run a "verify agent" mission, the double agent is exposed and lost.

### 2.9 Counter-Intelligence Scaling

By the Information era, AI civs actively run counter-espionage. Players who neglected defensive spying face frequent successful enemy missions. The Spymaster advisor's warnings become increasingly urgent.

### 2.10 Espionage UI

Dedicated espionage panel showing:
- All active spies, their assignments, and mission progress
- Spy experience and promotion status
- "Threat board" summarizing detected foreign spy activity in your cities
- Mission success probability before committing

---

## 3. Diplomacy Expansion

Builds on the existing diplomacy system (relationship scores, treaties, war/peace). Adds vassalage, betrayal consequences, embargoes, and defensive leagues. Delivered in M4b.

### 3.1 Vassalage

When a civ is losing a war badly (lost 50%+ cities or military strength), they can offer to become a vassal.

**Vassal obligations:**
- Pay tribute: percentage of gold and resources per turn to overlord
- Cannot declare war or sign treaties without overlord approval
- Overlord must defend vassal if attacked by a third party

**Independence:**
- Vassal can petition for independence each turn
- Granted peacefully if relationship with overlord is high
- Otherwise triggers a rebellion war — vassal declares war on overlord
- AI personality determines vassalage behavior: proud civs fight to the death, pragmatic ones surrender early

### 3.2 Betrayal & Reputation

Breaking a treaty (alliance, non-aggression pact, open borders) has lasting consequences:

- Betrayed civ and their allies get a permanent "treacherous" memory
- Global relationship penalty with all civs — decays slowly over many turns
- Repeat betrayals compound — "known backstabber" reputation makes future diplomacy progressively harder
- Leader personality interaction: Treacherous trait civs care less about reputation; Honorable civs refuse to deal with known backstabbers

### 3.3 Embargoes

New diplomatic action: propose an embargo against a target civ.

- Requires existing trade agreement with the civ you're asking to join
- Cuts off all trade routes to the embargoed civ
- Effective at economic strangulation if enough civs participate
- AI weighs relationship with proposer vs relationship with target when deciding

### 3.4 Defensive Leagues

Two or more civs can form a defensive league:
- Attack on any member triggers war with all members
- Different from bilateral alliance — multilateral
- Leagues dissolve if members go to war with each other
- Requires Communication-era tech

---

## 4. Buildable Wonders

Currently the game has 15 natural wonders (discovered on the map). M4 adds 30-40 player-constructed wonders in two tiers: simple (M4b) and legendary quest wonders (M4d).

### 4.1 Wonder Race Mechanic

- Wonders appear in the city production queue, gated by era and tech
- Only one civ can complete each wonder — but multiple can attempt simultaneously
- When construction starts, civs with espionage intel on you see a notification
- **Consolation for losers:**
  - Simple wonders: 50% of invested production returned as gold, plus option to redirect remaining progress toward another wonder or building at 30% efficiency
  - Quest wonders: 60% production refund as gold, plus a unique minor bonus (e.g., failed Manhattan Project still grants a research boost)

### 4.2 Simple Wonders (15-20, M4b)

Require only production + the right tech. Examples:

| Wonder | Era | Effect |
|--------|-----|--------|
| Great Library | Classical | Free tech in lowest research track |
| Colosseum | Classical | Happiness bonus empire-wide |
| Great Wall | Iron Age | All cities get fortification bonus |
| Lighthouse of Alexandria | Classical | Coastal cities get trade route bonus |
| Hanging Gardens | Bronze Age | City food surplus doubled |
| Pyramids | Bronze Age | Worker improvement speed doubled |
| Stonehenge | Stone Age | Free Spirituality tech |
| Oracle | Classical | Free advisor unlock |
| Terracotta Army | Iron Age | Duplicate all current military units once |
| Machu Picchu | Medieval | Mountain-adjacent city gets gold bonus |
| Notre Dame | Medieval | Happiness boost, cultural pressure |
| Forbidden Palace | Renaissance | Reduces empire unhappiness from city count |
| Sistine Chapel | Renaissance | Arts track research doubled for 20 turns |
| Big Ben | Industrial | Gold purchases cost 25% less |
| Eiffel Tower | Industrial | Tourism/cultural pressure bonus |

### 4.3 Legendary Quest Wonders (15-20, M4d)

Multi-stage construction requiring prerequisites, quest completion, then production investment.

**Construction flow:**
1. **Prerequisites:** specific techs + strategic resources (e.g., marble + iron + Construction tech)
2. **Quest chain:** complete 2-3 objectives (explore a ruin, establish a trade route, defeat a stronghold)
3. **Construction:** high production cost, 15-30 turns

**Examples:**

| Wonder | Era | Quest | Effect |
|--------|-----|-------|--------|
| Oracle of Delphi | Classical | Philosophy tech → pilgrimage to natural wonder | Free advisor unlock + enemy movement prediction for 20 turns |
| Grand Canal | Renaissance | Construction + river city → connect two cities via river | Permanent trade bonus between connected cities |
| Manhattan Project | Atomic | 3 science techs + uranium → 5 research milestones | Unlocks nuclear capability (all civs notified) |
| Internet | Information | Communication + Electronics → trade routes with 5+ civs | Doubles research speed, spy bonus |

Quest wonders are dramatically more powerful than simple wonders. The effort justifies the reward. They're also vulnerable to espionage sabotage during the long build time.

### 4.4 Wonder UI

- New section in city panel showing available wonders, their requirements, and construction progress
- Wonder race status: who else is building what (visible if you have espionage intel on them)
- Quest wonder progress tracker with clear step indicators
- Completed wonders gallery showing your empire's achievements

---

## 5. Breakaway Factions

Empires that grow too fast or neglect happiness face internal collapse. Three escalating stages: unrest → revolt → full breakaway. Zero risk in early game. Delivered across M4c (stages 1-2) and M4d (stage 3).

### 5.1 Scaling Factors

Breakaway pressure scales with:
- **Empire size:** more cities = lower happiness threshold per city (overextension)
- **Era:** impossible before Iron Age, rare before Medieval, common in later eras
- **Distance from capital:** farther cities are more vulnerable
- **Conquest:** recently conquered cities have elevated breakaway risk
- **War weariness:** prolonged conflicts increase unhappiness empire-wide
- **Espionage:** enemy "Incite Unrest" and "Fund Rebels" missions directly feed the system

### 5.2 Stage 1 — Unrest (M4c)

- **Trigger:** city unhappiness exceeds threshold
- **Effect:** city yields reduced by 25%, "Unrest" icon displayed
- **Advisor warning:** Spymaster and Chancellor both flag the situation
- **Resolution options:**
  - Garrison a military unit in the city
  - Spend gold to appease (scales with city size)
  - Build happiness buildings
  - Address root cause (end a war, reduce taxes, build improvements)
- **Escalation:** if unaddressed for 5+ turns, moves to Stage 2

### 5.3 Stage 2 — Revolt (M4c)

- **Trigger:** unrest unaddressed for 5+ turns
- **Effect:** yields reduced by 50%, production halted, rebel units spawn around the city (strength scales with era)
- **City is locked:** cannot train units or construct buildings
- **Resolution:** defeat rebel units AND address underlying unhappiness. Military alone is insufficient — crush the rebels but ignore the cause and unrest returns in 10 turns.
- **Escalation:** if unaddressed for 10+ turns, moves to Stage 3

### 5.4 Stage 3 — Full Breakaway (M4d)

- **Trigger:** revolt unaddressed for 10+ turns
- **Effect:** city becomes a new independent mini-civ
  - Gets its own color, generated name, and territory claim
  - Units in the city's territory at breakaway join the faction
  - Starts hostile to former owner, neutral to everyone else
  - Other civs can immediately open diplomacy — ally, trade, or weaponize against you

- **Faction behavior:**
  - Defensive — holds territory but doesn't expand aggressively
  - Accepts alliances with civs at war with former owner
  - Can be reconquered (military), diplomatically reabsorbed (high gold cost + relationship repair), or left alone (becomes permanent minor civ)
  - Reconquered cities start at high unrest — brute force doesn't buy loyalty

- **Empire size feedback loop:** The bigger your empire, the more breakaway pressure everywhere. Conquering a 5-city civ when you already have 15 cities means those new cities are almost guaranteed to experience some unrest. Forces investment in happiness, garrisons, and governance — not just military steamrolling.

---

## 6. Advisor System Expansion

Currently 6 advisors. M4 adds 2 new advisors and a lobbying/disagreement system that gives them all real personality.

### 6.1 Spymaster Advisor (M4a)

- **Unlocks:** when first espionage tech is researched
- **Domain:** espionage operations, spy placement, counter-intelligence
- **Suggests:** where to place spies ("Rome is building a large army — we should watch them")
- **Warns:** about undefended cities ("We have no counter-intelligence in Alexandria")
- **Reacts:** to mission outcomes ("Our spy in Mongolia was captured — expect diplomatic fallout")
- **Personality:** paranoid streak — occasionally overestimates threats

### 6.2 Artisan Advisor (M4d)

- **Unlocks:** when first Arts track tech is researched
- **Domain:** wonders, culture, city beauty, legacy
- **Suggests:** wonder builds ("We have marble and a river — the Grand Canal would be magnificent here")
- **Warns:** about wonder races ("Mongolia has begun the Great Library — shall we compete?")
- **Comments:** on cultural influence ("Our arts are spreading to Greek border cities")
- **Personality:** enthusiastic, occasionally dramatic, dismissive of purely military solutions

### 6.3 Advisor Lobbying (M4e)

Memory system: each advisor tracks their last 3-5 recommendations and whether the player followed them. Stored in game state as a simple array per advisor.

- **Followed advice:** advisor gains confidence, future messages are more assertive
- **Ignored advice:** advisor notes it, may reference later ("As I suggested last time...")
- **Advice proved wrong:** advisor acknowledges it ("I misjudged Mongolia's intentions")

### 6.4 Advisor Disagreements (M4e)

When a game event is relevant to multiple advisors, they offer conflicting takes. Presented as a brief dialogue:

> **Chancellor:** "Rome is weak — now is the time for a trade agreement, lock in favorable terms"
> **War Chief:** "Rome is weak — now is the time to strike, not trade"

Player chooses, and the "losing" advisor remembers.

**Trigger frequency:** Disagreements fire on high-stakes moments — declaring war, signing treaties, starting wonder construction, choosing espionage targets. 1-2 per era to keep them special, not every turn.

### 6.5 Advisor Personalities

| Advisor | Personality |
|---------|-------------|
| Builder | Cautious, prefers infrastructure over risk |
| Explorer | Optimistic, always wants to push further |
| Scholar | Analytical, presents data but hedges conclusions |
| Chancellor | Political, frames everything as leverage |
| War Chief | Direct, respects strength, impatient with diplomacy |
| Treasurer | Conservative, worried about cost of everything |
| Spymaster | Paranoid, sees threats everywhere, occasionally right |
| Artisan | Enthusiastic, values legacy and beauty over efficiency |

### 6.6 "I Told You So" Moments

If an advisor warned about something and it happens (e.g., War Chief warned about Rome's army and Rome declares war), the advisor gets a callback message. Infrequent but memorable.

---

## 7. Civilizations

M4 adds 17 new civilizations (6 historical, 11 fantasy) plus custom civilization creation, bringing the total to 29 + custom.

### 7.1 Rollout Schedule

| Sub-milestone | Historical | Fantasy |
|---------------|-----------|---------|
| M4a | France, Germany | Gondor, Rohan |
| M4b | Russia, Ottoman | The Shire, Isengard |
| M4c | Spain, Viking/Norse | Prydain, Annuvin |
| M4d | — | Lothlórien, Narnia, Atlantis |
| M4e | — | Wakanda, Avalon + custom civ |

### 7.2 New Historical Civilizations

| Civ | Theme | Bonus |
|-----|-------|-------|
| France | Culture & diplomacy | Higher city influence radius (cultural pressure on neighboring tiles) |
| Germany | Industrial efficiency | Production bonus in all cities |
| Russia | Expansion & endurance | Bonus yields from tundra/snow tiles, larger territory per city |
| Ottoman | Siege warfare | Bonus damage against fortified cities |
| Spain | Exploration & faith | Bonus rewards from natural wonders and tribal villages |
| Viking/Norse | Raiding & exploration | Naval raids yield gold, faster exploration movement |

### 7.3 Fantasy Civilizations

| Civ | Source | Theme | Bonus |
|-----|--------|-------|-------|
| Gondor | Lord of the Rings | Noble defenders | Fortified cities harder to capture |
| Rohan | Lord of the Rings | Horse lords | Cavalry heal in grasslands |
| The Shire | The Hobbit | Peaceful prosperity | Bonus food & happiness, weaker military |
| Isengard | Lord of the Rings | Industry & war | Faster unit production, forests razed for burst production |
| Prydain | Book of Three | Heroic resistance | Combat bonus when defending homeland tiles |
| Annuvin | Book of Three | Dark expansion | Espionage network grows faster (spy XP bonus, shorter mission times) |
| Lothlórien | Lord of the Rings | Forest guardians | Forest bonus resources, units invisible in forests |
| Narnia | Chronicles of Narnia | Allied kingdoms | Stronger alliance bonuses (extra yields from allied civs) |
| Atlantis | Mythology | Naval & science | Coastal science bonus, powerful naval units |
| Wakanda | Marvel/Afrofuturism | Hidden tech | Reduced tech costs, cities hidden from espionage |
| Avalon | Arthurian Legend | Chivalry & quests | Wonder bonuses doubled |

### 7.4 Custom Civilization (M4e)

Player creates a custom civ:
- Text input for name
- Color picker
- Select 1 bonus from a menu of all existing bonus types
- Simple UI — no new mechanics, just mix-and-match from existing effects

---

## 8. QoL & UI Improvements

### 8.1 Terrain Readability (M4a, #2)

- Subtle text labels or distinct texture patterns on terrain types
- Visible at default zoom level, fade at extreme zoom-out
- Respects fog of war — only labeled for visible tiles
- Goal: distinguish grassland from plains without tapping

### 8.2 Combat Tutorial (M4b, #4)

- War Chief advisor detects first combat situation and walks player through it
- Explains modifiers: terrain, health, unit strength
- Shows predicted outcome range before committing
- Triggers once per game, then advisor returns to normal tips
- Non-intrusive — can be dismissed, respects advisor enable/disable setting

### 8.3 Icon Legend (M4c, #5)

- Toggleable legend overlay showing what map icons mean
- Wonder stars, village tents, barbarian camps, resource icons, city-state markers
- Accessible from HUD button or long-press/right-click on any icon
- Contextual: only shows icons currently visible on screen
- Auto-dismisses after a few seconds or on tap

### 8.4 Auto-Explore (M4e, #10)

- Toggle on any scout or military unit: "Auto-Explore"
- Unit moves toward nearest fog of war each turn
- Priority: unexplored tiles > tribal villages > natural wonders
- Avoids: enemy territory, barbarian camps (unless military unit), hostile units
- Disengages on: damage taken, no reachable fog, or manual player move
- Uses existing A* pathfinding — new destination selector picks best fog-adjacent tile

### 8.5 Desktop UI Enhancements (M4e)

- Keyboard shortcuts: E = end turn, T = tech tree, D = diplomacy, C = city panel, S = espionage panel
- Right-click context menus on units and cities
- Hover tooltips on hex tiles (terrain, yields, owner, improvements)
- Wider panel layouts for desktop screen real estate
- Mouse wheel zoom

### 8.6 Balance Pass (M4e)

- Espionage success rates across all 5 stages
- Breakaway faction thresholds and timing
- Wonder race consolation values (50%/60% refunds)
- Advisor disagreement frequency
- New civ bonus strengths (especially fantasy civs with wilder abilities)
- Vassal tribute rates

---

## 9. Technical Considerations

### 9.1 New Types Required

- `Spy`, `SpyMission`, `SpyPromotion`, `EspionageState` — espionage system
- `VassalState`, `Embargo`, `DefensiveLeague` — diplomacy extensions
- `BuiltWonder`, `WonderQuest`, `WonderQuestStep` — wonder construction
- `BreakawayFaction`, `UnrestLevel` — faction system
- `AdvisorMemory`, `AdvisorDisagreement` — advisor lobbying

### 9.2 New System Files

- `src/systems/espionage-system.ts` — spy recruitment, assignment, missions, detection
- `src/systems/wonder-construction.ts` — built wonder production, race mechanic, consolation
- `src/systems/faction-system.ts` — unrest, revolt, breakaway, faction AI
- `src/ui/espionage-panel.ts` — spy management UI
- `src/ui/wonder-panel.ts` — wonder browser and quest tracker

### 9.3 Modified Files

- `src/core/types.ts` — all new type definitions
- `src/systems/diplomacy-system.ts` — vassalage, embargoes, leagues, betrayal reputation
- `src/systems/civ-definitions.ts` — 17 new civ definitions
- `src/ui/advisor-system.ts` — Spymaster, Artisan, lobbying, disagreements
- `src/core/turn-manager.ts` — espionage tick, faction tick, wonder progress
- `src/ai/basic-ai.ts` — AI espionage decisions, vassal decisions, wonder priorities
- `src/renderer/hex-renderer.ts` — terrain labels, icon legend
- `src/ui/city-panel.ts` — wonder construction queue

### 9.4 Architecture Notes

- All new systems follow the existing event-driven pattern — communicate via EventBus
- All new state is serializable plain objects — no class instances
- Espionage state is per-civ (each player has their own spy roster and threat board)
- Breakaway factions reuse existing minor-civ infrastructure where possible
- Hot seat: espionage panel must respect current player — never show another player's spies
- All randomness uses seeded RNG — no `Math.random()`
