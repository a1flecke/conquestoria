# Conquestoria — Game Design Specification

**Date:** 2026-03-21
**Status:** Approved
**Target Audience:** Casual-to-mid-core strategy fans, specifically someone who loved Civ 1-5, Colonization, and SimCity
**Platform:** Web app on GitHub Pages, iPhone Safari (primary) and Chrome macOS (secondary)
**Primary Use Case:** 5-15 minute play sessions on iPhone (waiting rooms, breaks), with longer desktop sessions when time allows

---

## 1. Core Identity

Conquestoria is a turn-based civilization-building strategy game where you start with a primitive tribe and dominate the world through military conquest, economic stranglehold, diplomatic manipulation, or any combination. The only victory condition is domination — but the paths to get there are vast.

**Design Pillars:**
- **Fun first** — every session should feel engaging, surprising, and rewarding
- **Easy to put down, easy to pick up** — auto-save every turn, instant resume, no lost progress
- **Exploration never ends** — there's always something new to discover, no matter the era
- **Your civilization, your story** — choices in tech, diplomacy, wonders, and city building make every playthrough unique
- **Offline-first** — works fully without network after first load

---

## 2. Architecture & Tech Stack

### Core Stack
- **TypeScript** — type safety across the entire codebase
- **Vite** — fast dev server, optimized static builds for GitHub Pages
- **Canvas 2D** — hex map rendering, unit sprites, animations, fog of war
- **DOM/CSS** — all UI panels (menus, tech tree, city view, marketplace, diplomacy)
- **Web Audio API** — layered sound effects with positional awareness
- **HTML5 Audio** — background music with era-based adaptive playlists
- **IndexedDB** — game state persistence (thin wrapper, no library)
- **Service Worker + Cache API** — full offline support, all assets cached

### Architectural Principles
- **Event-driven** — game systems communicate through an event bus, not direct coupling
- **Serializable state** — entire game state is a plain object, serializable to IndexedDB in one call
- **Mobile-first rendering** — Canvas renders at device pixel ratio, touch gestures are first-class
- **Offline-first** — the game assumes no network; Service Worker caches everything on first visit

### Project Structure
```
src/
  core/        — game state, turn manager, event bus
  systems/     — map, city, unit, tech, economy, diplomacy, espionage, threats, wonders
  ai/          — civilization AI, threat AI
  renderer/    — canvas map renderer, animation system
  ui/          — DOM-based panels, menus, HUD
  audio/       — music manager, sound effects
  storage/     — IndexedDB wrapper, auto-save, state serializer
  input/       — touch handler, mouse/keyboard, gesture recognition
public/
  assets/      — sprites, tiles, sounds, music
  sw.js        — service worker
```

---

## 3. Map & World

### Hex Grid
- Axial coordinate system (q, r) for efficient pathfinding, neighbor lookups, and distance calculations
- Each hex stores: terrain type, elevation, resource, improvement, owner, visibility state
- Horizontal wrapping (east-west circumnavigation), polar ice edges north/south
- Configurable map sizes: Small (30x30), Medium (50x50), Large (80x80), Epic (120x120)

### Terrain Types
Grassland, Plains, Desert, Tundra, Snow, Forest, Jungle, Hills, Mountains (impassable early), Ocean, Coast, River (hex edges), Swamp, Volcanic

Terrain affects: movement cost, combat modifiers, city yields, visual appearance.

Elevation system: lowland, highland, mountain — affects line of sight and fog of war reveal radius.

### World Generation
- Procedural using layered noise (Perlin/Simplex) for natural-looking continents
- Map types: Continents, Pangaea, Archipelago, Inland Sea, Random
- Resource placement follows terrain logic
- Strategic resources hidden until relevant tech researched
- Rivers generated via water flow simulation from mountains to coast
- Balanced starting positions

### Fog of War
- Three states: Unexplored (black), Previously seen (dimmed terrain, no units), Visible (full detail)
- Vision radius varies by unit type
- Hills/mountains grant extended vision
- Subtle animation when new tiles are revealed

### Exploration Layers (Exploration Never Ends)

| Era Range | Discovery Layer |
|---|---|
| Tribal – Classical | Surface exploration — fog of war, tribal villages, natural wonders, first contacts |
| Medieval – Renaissance | Ocean exploration — new continents, islands, deep ruins, pirate hideouts |
| Enlightenment – Industrial | Underground layer — cave systems, mineral deposits, underground rivers, lost civilizations |
| Modern – Atomic | Deep ocean — underwater ruins, ocean floor resources, volcanic vents, sunken ships |
| Information | Data exploration — satellites reveal surface but not underground/underwater/espionage networks. Anomalies increase. Map is "visible" but far from fully understood |

Satellites do NOT reveal: underground resources, underwater features, ancient ruins contents, anomaly details, hidden spy networks, barbarian tunnels, guerrilla hideouts.

### Map Events
- Volcanic eruptions create new land
- Earthquakes reveal underground passages
- Ocean level shifts expose or submerge coastal tiles
- Events keep the map feeling dynamic through all eras

---

## 4. Civilizations & Leaders

### Historical Civilizations (18)

| Civ | Theme | Unique Bonus |
|---|---|---|
| Egypt | Wonder builders | Faster wonder construction |
| Rome | Military expansion | Roads auto-built between cities |
| China | Technology & walls | Extra tech track research speed |
| Greece | Diplomacy & culture | Stronger diplomatic influence |
| Persia | Trade empire | Bonus gold from trade routes |
| Mongolia | Mounted conquest | Cavalry units move further |
| England | Naval dominance | Stronger naval units, wider coastal vision |
| Aztec | War & sacrifice | Combat victories yield production |
| Japan | Bushido discipline | Units fight at full strength when damaged |
| Viking/Norse | Raiding & exploration | Naval raids, faster exploration |
| India | Population & growth | Cities grow faster, bonus food |
| Spain | Exploration & faith | Bonus rewards from natural wonders & tribal villages |
| Zulu | Military mobilization | Faster unit training, cheaper upkeep |
| Ottoman | Siege warfare | Bonus against fortified cities |
| France | Culture & diplomacy | Higher city influence radius |
| Germany | Industrial efficiency | Production bonus in all cities |
| Russia | Expansion & endurance | Bonus from tundra/snow tiles, larger territory |
| Babylon | Ancient science | Free tech at start of each era |

### Fantasy Civilizations (11)

| Civ | Source | Theme | Unique Bonus |
|---|---|---|---|
| Gondor | Lord of the Rings | Noble defenders | Fortified cities harder to take |
| Rohan | Lord of the Rings | Horse lords | Cavalry heal in grasslands |
| The Shire | The Hobbit | Peaceful prosperity | Bonus food & happiness, weaker military |
| Isengard | Lord of the Rings | Industry & war | Faster unit production, forests razed for production |
| Prydain | Book of Three | Heroic resistance | Combat bonus when defending homeland |
| Annuvin | Book of Three | Dark expansion | Espionage network grows faster |
| Lothlórien | Lord of the Rings | Forest guardians | Forest bonus resources, units invisible in forests |
| Narnia | Chronicles of Narnia | Allied kingdoms | Stronger alliance bonuses |
| Atlantis | Mythology | Naval & science | Coastal science bonus, powerful navy |
| Wakanda | Marvel/Afrofuturism | Hidden tech | Reduced tech costs, cities hidden from espionage |
| Avalon | Arthurian Legend | Chivalry & quests | Wonders grant additional unique bonuses |

### Leader Personalities
- Each AI civ gets a leader with 2-3 randomized personality traits: Aggressive, Diplomatic, Expansionist, Trader, Paranoid, Honorable, Treacherous, Builder
- Traits affect AI decisions and diplomatic responses
- Creates unique combinations each game

### Custom Civilization
- Player can create a custom civ: pick name, color, and choose abilities from a menu

### Hot Seat Multiplayer
- 2-4 players on one device, taking turns
- "Pass the device" screen between turns hides previous player's map
- Independent fog of war per player
- AI fills remaining civ slots

---

## 5. Turn System & Combat

### Turn-Based
- Classic turn-based: each player/AI takes their full turn, then the next goes
- Perfect for mobile — no time pressure, take as long as you need

### Combat
- Auto-resolve with modifiers
- Units have base strength values
- Modifiers from: terrain, tech, flanking, fortification, experience, health
- Some randomness to keep outcomes from being perfectly predictable
- Brief, satisfying clash animation with clear outcome display
- Veteran units develop unique traits from surviving many battles

---

## 6. City Building (Hybrid System)

### World Map Layer — Tile Improvements
Workers improve hexes around cities: Farms, Mines, Lumber mills, Fishing boats, Quarries, Pastures, Trading posts, etc.

Improvements upgrade with tech (Farm → Irrigated Farm → Industrial Farm → Automated Farm).

Strategic resources require specific improvements to harvest.

### City Interior View — The SimCity Layer
Clicking a city opens a building grid:

**Building Categories:**
- Production: Workshop, Forge, Factory, Assembly Plant
- Food: Granary, Market Garden, Greenhouse, Food Processing
- Science: Library, University, Research Lab, Tech Campus
- Economy: Marketplace, Bank, Stock Exchange, Trade Hub
- Military: Barracks, Armory, War Academy, Command Center
- Happiness: Temple, Theater, Arena, Stadium, Park
- Health: Herbalist, Hospital, Clinic, Medical Center
- Infrastructure: Aqueduct, Sewer, Power Plant, Transit System

**Key Mechanics:**
- Adjacency bonuses — Library next to University gives research boost
- Limited building slots that grow with population — forces specialization
- Visual progression through eras
- Builder advisor suggests optimal placements
- Cities specialize: science city, military city, trade city — empire works as an interdependent network

### City Growth
- Population grows based on food surplus
- More population = more building slots, workers, output — but more food/happiness needed
- Medicine tech track and Health buildings affect growth rate

---

## 7. Multi-Track Tech Trees

### The Fifteen Tracks

| Track | Governs | Example Progression |
|---|---|---|
| Military | Units, tactics, fortifications | Stone weapons → Bronze swords → Gunpowder → Tanks → Drones |
| Economy | Trade, currency, markets | Barter → Currency → Banking → Stock markets → Digital |
| Science | Physics, chemistry, engineering | Fire → Wheel → Alchemy → Electricity → Quantum theory |
| Civics | Government, law, diplomacy | Tribal council → Monarchy → Republic → Democracy → Federation |
| Exploration | Movement, vision, cartography | Pathfinding → Cartography → Sailing → Aviation → Satellites |
| Agriculture | Food, livestock, land | Gathering → Irrigation → Crop rotation → Fertilizer → GMOs |
| Medicine | Health, population, growth | Herbalism → Sanitation → Surgery → Antibiotics → Genomics |
| Philosophy | Ethics, influence, loyalty | Oral tradition → Ethics → Logic → Humanism → Existentialism |
| Arts | Culture pressure, city beauty | Cave painting → Pottery → Sculpture → Renaissance art → Cinema |
| Maritime | Ships, fishing, ocean, ports | Rafts → Galleys → Caravels → Steamships → Aircraft carriers |
| Metallurgy | Resource processing, tools, armor | Copper working → Bronze → Iron → Steel → Composites |
| Construction | Buildings, infrastructure, wonders | Mud brick → Masonry → Aqueducts → Skyscrapers → Megastructures |
| Communication | Diplomacy speed, espionage, trade range | Drums → Writing → Printing press → Telegraph → Internet |
| Espionage | Spy capabilities, counter-intelligence | Scouts → Informants → Spy rings → Cryptography → Cyber ops |
| Spirituality | Morale, happiness, wonder bonuses | Animism → Shamanism → Temples → Pilgrimages → Transcendence |

### Cross-Track Dependencies
Techs form a web across tracks:
- Gunpowder (Military) requires Alchemy (Science) + Iron smelting (Metallurgy)
- Cathedrals (Construction) requires Architecture (Arts) + Organized belief (Spirituality)
- Aircraft carriers (Maritime) requires Aviation (Exploration) + Steel (Metallurgy)

### Research Mechanics
- Cities generate Research Points from buildings (libraries, universities, etc.)
- Priority system: rank tracks as High / Medium / Low / Ignore
- Points auto-distribute by priority weighting
- Manual boost option to rush a specific tech
- Advisors suggest priorities based on game state

### The Twelve Eras
1. Tribal
2. Stone Age
3. Bronze Age
4. Iron Age
5. Classical
6. Medieval
7. Renaissance
8. Enlightenment
9. Industrial
10. Modern
11. Atomic
12. Information

### Tech Count
- ~15-20 techs per track × 15 tracks = **225-300 total techs**
- Branching choices within tracks for further variety
- 12 eras, each unlocking new tiers across all tracks
- Every tech unlocks something tangible — no filler

---

## 8. Living Economy & Trade

### Resource Categories (12)

| Category | Examples | Era Dynamics |
|---|---|---|
| Food | Wheat, Rice, Corn, Fish, Cattle, Sugar | Corn unavailable until Exploration era |
| Raw Materials | Wood, Stone, Clay, Sand, Marble | Always needed, usage evolves |
| Metals | Copper, Tin, Bronze, Iron, Steel, Aluminum, Titanium | Era-defining: Bronze Age needs copper+tin, Industrial needs steel |
| Energy | Firewood, Coal, Oil, Natural Gas, Uranium, Solar | Dominant source shifts per era. Coal: king in Industrial, liability in Information |
| Luxury Goods | Silk, Wine, Porcelain, Perfume, Chocolate, Coffee, Tobacco | Fashion shifts — Silk premium in Medieval, common by Industrial |
| Precious | Gold, Silver, Gems, Diamonds, Jade, Amber | Always valuable, relative worth fluctuates |
| Textiles | Furs, Wool, Cotton, Linen, Synthetic Fibers | Era progression: furs → wool → cotton → synthetics |
| Knowledge | Scrolls, Books, Blueprints, Patents, Data | Tradeable tech — espionage can steal these |
| Weapons | Bronze weapons, Iron arms, Gunpowder, Munitions, Advanced weapons | Huge trade value during wars. Arms dealing as strategy |
| Medicinal | Herbs, Medicines, Vaccines, Pharmaceuticals | Scarce during plagues — price spikes |
| Cultural | Art, Music, Literature, Film, Fashion | Generated by Arts track. Trade for influence. Some timeless, others fade |
| Exotic | Incense, Myrrh, Ivory, Rare Animals, Alien Artifacts | Rare exploration finds. Some become controversial in later eras |

### Dynamic Market
- Every resource has a base value that fluctuates with supply and demand across all civs
- Monopoly pricing: control 60%+ of a resource and you set the price
- Price history graphs visible in Marketplace
- Fashion cycles: luxury desirability shifts semi-randomly
- Treasurer advisor comments on trends

### Resource Era Dynamics
- Rising and falling demand per era
- Resources can become obsolete (Bronze weapons worthless once Iron is common)
- Old resources can find new uses (copper for wiring in electrical era)
- Transition periods where both old and new coexist — savvy traders profit

### Trade Routes
- Assign trade units (caravan or cargo ship) between cities
- Generate gold for both parties, bonuses for distance and diversity
- Visible on map as dotted paths with traveling caravans
- Can be raided by barbarians, pirates, or enemies
- More routes = more income but more vulnerability

### Trade Agreements
- Bilateral deals, trade pacts, exclusive deals, embargoes
- Economic warfare: strangle rivals through trade manipulation
- Cornering markets as a viable path to domination

### Scarcity Events
- Random events disrupt supply: mine collapse, drought, plague
- War disrupts trade routes, creating artificial scarcity
- Stockpiles become strategic assets

---

## 9. Espionage Network

### Five Growth Stages

| Stage | Era Range | Capabilities |
|---|---|---|
| Scouts | Tribal – Bronze | Reveal fog, spot troops, identify settlements |
| Informants | Iron – Classical | See resources, tech, trade deals, leader traits |
| Spy Rings | Medieval – Renaissance | Steal tech, sabotage production, incite unrest, poison, counter-espionage |
| Shadow Operations | Enlightenment – Industrial | Assassinate advisors, forge documents, stage coups, fund rebels, arms smuggling |
| Digital Warfare | Modern – Information | Full modern toolkit (see below) |

### Digital Warfare Capabilities

| Mission | Effect | Risk |
|---|---|---|
| Mass Data Collection | Reveals everything about target civ | Minor — "everyone does it" |
| Cyber Attacks | Temporarily disable city production/trade/defenses | Moderate — could trigger war |
| Misinformation Campaigns | Lower happiness, turn opinion against leader, increase breakaway chance | Hard to trace — low risk, slow burn |
| Utility Sabotage | Knock out energy infrastructure for several turns | Severe — act of war |
| Market Manipulation | Crash/inflate resource prices, trigger economic panic | Moderate — Treasurers can detect patterns |
| Election Interference | Force government change, reduce diplomatic effectiveness | Severe — world turns hostile |
| Deep Fakes / Forged Alliances | Make two rivals believe the other is attacking | Catastrophic if traced |
| Infrastructure Worms | Slow persistent damage to Construction/Communication | Low per turn but compounds |
| Whistleblower Ops | Expose target's espionage to the world | Target knows it was you |
| Double Agent Networks | Turn enemy agents into your assets, feed false intel | Lose two agents if discovered |

### Agent Mechanics
- Recruit agents, assign to cities (yours for defense, enemy for missions)
- Agents build "cover" over time — fresh agents are ineffective
- Experience system — veteran agents are powerful but painful to lose
- Captured agents can be traded in diplomatic negotiations
- Double agents possible in both directions

### Counter-Measures
- Encryption (Communication track) reduces cyber attack effectiveness
- Counter-Intelligence AI (Science track) auto-detects operatives
- Closed Networks — sacrifice trade efficiency for security
- Transparency Doctrine — publish data voluntarily, immune to whistleblower/misinfo

---

## 10. Diplomacy as a Weapon

### Relationship System
- Each AI tracks relationship score: -100 to +100
- Asymmetric — you can like them more than they like you
- Affected by: trades, treaties, borders, espionage, shared enemies, personality
- Displayed as: Hostile / Wary / Neutral / Friendly / Allied

### Diplomatic Actions by Era

| Era Range | Actions |
|---|---|
| Tribal – Bronze | War, peace, basic trade, non-aggression pact |
| Iron – Classical | Alliances, open borders, tribute demands, joint wars |
| Medieval – Renaissance | Vassalage, marriage alliances, trade pacts, embargoes, defensive leagues |
| Enlightenment – Information | Federations, economic unions, surrender terms, proxy wars, world congress |

### Vassalage
- Weaker civs become vassals through military pressure, economic dependence, or diplomatic influence
- Vassals pay tribute, follow your wars, keep their cities
- Vassals can rebel if mistreated or strong enough
- Vassals count toward domination victory

### Strategic Manipulation
- Share or fabricate intelligence to manipulate rivals
- Propose joint wars, let allies do heavy lifting
- Form leagues that isolate targets
- Chancellor advisor excels at suggesting manipulation strategies

### Betrayal & Reputation
- Breaking treaties gives "Treacherous" reputation all civs remember
- Civs share info about you with each other
- Reputation recovers slowly
- Some strategies deliberately embrace treachery

### Surrender & Absorption
- Beaten civs offer surrender: become vassal, cede cities, pay reparations
- Demand surrender backed by military/economic/diplomatic pressure
- Conquered cities retain identity — source of unrest or breakaway factions

---

## 11. Dynamic Threat System

### Threat Types

| Threat | When | Behavior |
|---|---|---|
| Roaming Bands | All game | Small hostile groups in wilderness |
| Barbarian Camps | Early – Mid | Fortified, spawn raiders, clear for rewards. Grow if ignored |
| Tribal Villages | Early – Mid | Peaceful — visit for random bonuses |
| Minor Civilizations | All game | Independent city-states with personality. Befriend, vassalize, conquer, or trade |
| Pirates | Ocean exploration | Raid sea trade, establish island hideouts |
| Evolved Tribes | Mid game | Ignored barbarian camps grow into minor civs, potentially full rivals |
| Breakaway Factions | Mid – Late | Unhappy cities rebel, become hostile mini-civs |
| Guerrilla Groups | Late game | Spawn in conquered/unhappy territory, hard to pin down |
| Pirate Kingdoms | Late game | Unchecked pirates establish naval power |
| Revolutionary Movements | Late game | Ideological, spread across multiple cities |

### Scaling (Relative to Map Size)

| Map Control | Threat Level |
|---|---|
| < 10% | Low — roaming bands, barbarian camps, peaceful exploration |
| 10-25% | Medium — pirates, faster barbarians, first guerrilla risk |
| 25-45% | High — breakaway factions, guerrillas, pirate kingdoms |
| 45%+ | Critical — revolutionary movements, multiple simultaneous threats |

Additional factors: empire stretch (distance from capital), rate of expansion, happiness per city, hostile neighbors.

### Happiness System
- Each city has happiness driven by: food, luxury goods, buildings, government, distance from capital, war weariness, overcrowding
- Global happiness affects: production, research, internal threat likelihood
- Happiness is the pressure valve preventing infinite expansion

---

## 12. World Wonders

### 120 Wonders Target
10 per era across 12 eras, distributed across categories:
- ~25 Strategic — powerful gameplay bonuses
- ~20 Economic — trade, production, resource bonuses
- ~20 Cultural — influence, happiness, city beauty
- ~15 Military — defense, unit bonuses, intimidation
- ~25 Vanity — bragging rights, unique visuals, personal expression
- ~15 Quest — require expeditions, rare resources, multi-step achievements

### Wonder Mechanics
- Exclusive: only one civ can build each
- Visible on map as unique structures
- Quest wonders require prerequisites + quest completion + production
- Era-locked: miss the window and it's gone
- Vanity wonders exist for fun and making your civ feel yours

### Natural Wonders (~15-20 per game, scaled to map size)
Unique terrain features with distinct visuals and bonuses:

Great Volcano, Crystal Caverns, Ancient Forest, Grand Canyon, Aurora Fields, Coral Reef, Frozen Falls, Sacred Mountain, Bottomless Lake, Dragon Bones, Singing Sands, Sunken Ruins, Floating Islands, Bioluminescent Bay, Eternal Storm

First discovery bonus for the civ that finds them.

---

## 13. Discovery & Surprise System

### Discovery Types

| Discovery | How It Works |
|---|---|
| Tribal Villages | Random reward: gold, tech, map reveal, unit upgrade, resource cache |
| Natural Wonder First Discovery | One-time bonus on top of ongoing hex bonus |
| Ancient Ruins | Multi-turn excavation for bigger rewards: lost techs, unique units, wonder blueprints |
| Resource Veins | Cluster discovery gives production boost, Explorer marks settlement location |
| Rival Civ First Contact | Both get gold bonus, open diplomacy. Chancellor gives first impression |
| Geographic Milestones | First ocean crossing, circumnavigation, pole reached — prestige + happiness |
| Lost Expeditions | Map reveals and lore fragments hinting at natural wonder locations |
| Anomalies | Rare mysteries requiring Science tech to investigate. Rewards scale with era |

### Surprise Events Across All Systems

**Frequency:**
- Every 2-3 turns: small surprise (trade windfall, advisor quip, market shift)
- Every 5-8 turns: medium event (diplomatic twist, tech eureka, weather)
- Every 15-20 turns: major event (defectors, secret alliance, volcanic eruption)

**Tone:** ~60% positive, ~25% neutral/choice, ~15% mild challenges

**Tech Surprises:** Eureka moments (bonus discovery in related track), zero-day exploits (one-time-use espionage ability), dead ends that pay off later, cross-pollination bonuses, stolen brilliance.

**Espionage Surprises:** Accidental intel, turned assets, hidden loyalists, blowback, double crosses.

**Trade Surprises:** Route discoveries, market crashes (buy-low opportunities), windfalls, smuggler contacts, trade partner gifts, counterfeit goods.

**Diplomacy Surprises:** Secret alliances revealed, unexpected proposals, refugee waves, heir crises, mutual enemy bonding.

**Military Surprises:** Veteran discoveries (unique traits), ancient caches, defectors, weather events, heroic stands.

**Wonder Surprises:** Hidden chambers, wonder rivalry consolation prizes, pilgrimages, inspired citizens.

**Guardrails:**
- Surprises create choices, not forced outcomes
- No game-ending surprises
- Every surprise gets an advisor comment
- Higher difficulty = more frequent negative surprises

---

## 14. Advisor System

### Eight Advisors

| Advisor | Domain | Personality |
|---|---|---|
| War Chief | Military, defense, combat | Bold, direct, occasionally bloodthirsty |
| Chancellor | Diplomacy, civics, alliances | Cautious, strategic, sees every angle |
| Treasurer | Economy, trade, production | Numbers-focused, practical, worries about costs |
| Scholar | Science, philosophy, medicine | Curious, enthusiastic, excited about discoveries |
| Explorer | Exploration, maritime, cartography | Adventurous, restless, wants to see what's next |
| Builder | Construction, agriculture, city growth | Patient, proud, cares about the people |
| Spymaster | Espionage, communication | Secretive, cryptic, speaks in implications |
| Artisan | Arts, spirituality, wonders | Passionate, dramatic, cares about legacy |

### Advisor Behavior
- Contextual tips as small, dismissable notifications — not modal popups
- Speak in character with personality
- React to game events
- Suggest tech priorities
- Frequency setting: Frequent / Occasional / Silent

### Advisor Dynamics
- **Disagreements:** Advisors conflict when their domains clash. War Chief vs Chancellor on military threats. Builder vs Treasurer on spending. Creates realistic tension.
- **Accuracy:** Usually right in their domain, can misjudge outside it. Occasionally just wrong — keeps player from blindly following.
- **Multiple right answers:** Sometimes 3-4 advisors urgently need resources and they're ALL correct. Core tension = prioritization under scarcity.
- **Reactive:** After outcomes, they comment: "I told you we needed those walls" or "Well played — the trade route was the right call."

### Unlock Progression
- Turn 1: Builder + Explorer
- First barbarian encounter: War Chief
- First trade opportunity: Treasurer
- First research complete: Scholar
- First rival civ discovered: Chancellor
- Espionage network unlocked: Spymaster
- First wonder available: Artisan

### Tutorial Integration
Advisors narrate the guided tutorial, handing off naturally as systems are introduced.

---

## 15. Audio & Visual Design

### Art Style — Stylized/Illustrated
- Warm, hand-painted hex textures with visible brushstrokes
- Charming unit sprites with personality
- Cities evolve visually through eras with transition animations
- Wonders are visual showpieces with ambient animations
- Fog of war has parchment/watercolor aesthetic
- UI panels feel like beautifully crafted journal pages

### Animation Priorities
- Hex reveal (tiles unfurl like a map being drawn)
- City growth transitions
- Trade caravans traveling routes
- Combat clash with outcome
- Wonder completion celebration
- Era transitions (map palette shifts)
- Constant subtle movement in water, forests, weather

### Sound Design

| Layer | Implementation |
|---|---|
| Ambient | Environmental sounds based on viewport — birds, waves, wind, city bustle |
| UI | Satisfying sounds for every interaction — clicks, chimes, whooshes |
| Event stingers | Short musical phrases: ominous for threats, triumphant for discoveries |
| Combat | Brief, punchy, era-appropriate |
| Advisor signatures | Each advisor has a unique sound cue — drum hit, page turn, compass click |

### Era-Evolving Adaptive Music

| Era Range | Style |
|---|---|
| Tribal – Stone | Sparse percussion, wooden flutes, ambient nature |
| Bronze – Iron | String melodies, deeper drums |
| Classical – Medieval | Fuller orchestration, lutes, choral hints |
| Renaissance – Enlightenment | Harpsichord, chamber music |
| Industrial – Modern | Piano-driven, brass sections |
| Atomic – Information | Electronic + orchestral blend, synths |

### Music Depth System
- 4-6 unique tracks per era, each 3-5 minutes
- Multiple variations per track (different instrumentation, tempo, mood)
- ~240-360 minutes total unique music across all 12 eras
- Adaptive layers that mix based on game state: base melody, harmony (thriving), tension (threats), percussion (war), contemplative (building), triumph (victories)

### Avoiding Monotony
- Shuffle within era, never same sequence
- Variation cycling on repeat plays
- Silence gaps (30-60 seconds of ambient only)
- Crossover tracks between adjacent eras
- Contextual selection based on player activity
- Main theme reimagined per era for continuity
- Civilization motifs, wonder fanfares, advisor themes

### Performance
- Compressed textures, sprite sheets, audio sprites
- requestAnimationFrame with graceful frame-skip
- Progressive music streaming
- Target: 60fps iPhone 12+, 30fps older devices

---

## 16. Mobile-First UI & UX

### Touch Design
- One-thumb reachable: all primary actions in bottom bar
- Tap to select, tap again to act, long-press for details
- Swipe up for notifications, left/right between cities
- Pinch zoom with smooth inertia
- All buttons minimum 44x44pt
- Safe area respect for notch/home indicator

### Screen Flow
- Main Map → default home
- City Interior → tap city on map
- Tech Tree → bottom bar
- Marketplace → bottom bar or city market
- Diplomacy → bottom bar
- Espionage → unlocks mid-game
- Advisors → tap notification
- Menu → top corner

### Notifications
- Slide-down cards, beautiful and brief
- Tap to expand, swipe to dismiss
- Never interrupt mid-action
- Queue multiple events with badge count

### Session Resumption
- Opens to map exactly where she left off
- "Welcome back" card with turn/era/status summary
- Mid-decision states preserved
- No login, no loading screen friction

### Desktop Enhancements
- Sidebar panels instead of overlays
- Keyboard shortcuts
- Mouse hover tooltips
- Right-click context menus
- Wider tech tree view
- Same save, cross-device play

---

## 17. Offline & Storage

### Service Worker Strategy

| Asset Type | Strategy |
|---|---|
| HTML, JS, CSS | Cache on install, background update |
| Sprites, textures | Cache on install |
| Music (current era) | Cache on first play, preload adjacent |
| Music (other eras) | Lazy load when online |
| Sound effects | Cache on install |
| Save data | IndexedDB only, never leaves device |

### First Load
- < 5MB for playable state
- Remaining assets load progressively
- Full cache: ~150-200MB over first few sessions

### Save System
- Auto-save overwrites after every turn
- Hot seat games get own save slots
- Settings, tutorial progress persisted
- ~500KB-2MB per save

### Updates
- Background check, quiet notification
- Never interrupts gameplay
- Saves always forward-compatible

---

## 18. Tracer Bullet Delivery

### Milestone 1 — "The First Evening"
- Small hex map (30x30), basic terrain
- One civ (player), one AI rival, barbarian camps
- Settler → found city → basic buildings
- Worker → farms and mines
- Scout and warrior → explore, fight
- Fog of war with reveal animation
- 3 tech tracks (Military, Economy, Science) × ~5 techs
- Basic auto-resolve combat
- End turn, auto-save, offline capable
- Stylized hex art, ambient sounds, one music track
- Mobile-first touch UI
- Guided tutorial with Builder and Explorer advisors

### Milestone 2 — "Real Rivals"
- Full AI with basic diplomacy
- 4-6 playable civs with unique bonuses
- Chancellor and War Chief advisors
- Basic trade
- 5 tech tracks × ~8 techs
- City interior view
- More terrain, rivers
- 2-3 music tracks per era (first 4 eras)

### Milestone 3 — "The Living World"
- Dynamic economy with fluctuating prices
- Pirates, minor civs, tribal villages
- 15 tech tracks × ~8 techs
- Natural wonders, discovery bonuses
- Treasurer and Scholar advisors
- Map size selection
- Hot seat (2 player)

### Milestone 4 — "Deep Strategy"
- Espionage network (stages 1-3)
- Full diplomacy (vassals, alliances, betrayal)
- Breakaway factions, guerrilla groups
- 40-50 wonders
- All 8 advisors with disagreements
- 10+ playable civs
- Desktop UI enhancements
- Terrain readability — labels or texture patterns so terrain type is visible without tapping (#2)
- Combat onboarding — advisor-driven guidance for new players on how combat works (#4)
- Map icon legend — tooltips or legend for wonder stars, village tents, and other map icons (#5)
- Auto-explore mode — let scouts and units auto-explore toward fog of war (#10)

### Milestone 5 — "The Full Experience"
- All 12 eras, full tech depth
- Digital warfare espionage
- Underground and deep ocean layers
- 120+ wonders
- All 29 civs
- Full adaptive music system
- All surprise/discovery events
- 4-player hot seat
- Polish, balance, performance
- Music quality overhaul — replace/improve procedural generation, especially early era tracks (#3)
- Zoom-level sprites — render detailed unit/building sprites when zoomed in, emoji at overview (#9)

### Milestone 6+ — "Feedback-Driven"
- Priorities from playtester feedback
- Double down on what she loves
- Simplify what she skips
- Fix what frustrates
- Add what she suggests
