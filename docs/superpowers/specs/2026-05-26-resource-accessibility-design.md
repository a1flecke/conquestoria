# Resource Accessibility Design

**Date:** 2026-05-26
**Problem:** Kids (ages 7, 10, 12) — and occasionally adults — find special resources too hard to reach and don't understand how to go get them. Three distinct pain points: mechanics opacity (don't know the path), hope drain (journey takes too long), motivation gap (reward feels too decoupled from effort).
**Goal:** Multi-faceted solution that preserves the specialness and strategic weight of resources while making them legible, reachable, and exciting for the full family age range. Do not overcorrect into triviality.

---

## The Four Pillars

### Pillar 1 — Foundation Fixes: "Closer and Cheaper"

Root-cause changes to map generation and settler cost. All other pillars assume these are in place.

#### Map generation

- Raise `DEFAULT_RESOURCE_PROBABILITY` in `src/systems/map-generator.ts` from `0.15` → `0.20`.
- Add a **start-area resource guarantee** pass that runs after civ placement:
  - For each starting position, scan tiles within hex distance 5.
  - If no luxury resource exists in that radius, force-place one on the nearest eligible terrain tile (closest by hex distance; ties broken by seeded RNG draw; never overwriting an existing resource).
  - Repeat for strategic resources.
  - Tiles at radius 0–1 (the starting tile and immediate neighbors) count toward the guarantee — no wasted placement if they already have one close.
- The guarantee pass uses the existing seeded `resourceRng` so maps remain reproducible.

#### Settler cost

Current `SETTLER_COST_BY_ERA` in `src/systems/city-system.ts`:

| Era | Current | New |
|-----|---------|-----|
| 1   | 24      | 16  |
| 2   | 32      | 24  |
| 3   | 40      | 40  |
| 4   | 48      | 48  |
| 5   | 56      | 56  |

Eras 1–2 reduced by one-third. Era 3+ unchanged — by mid-game momentum carries players past the cost barrier. The scaling curve is preserved; only the early floor drops.

---

### Pillar 2 — Expedition + Resource Outpost: "Plant Your Flag"

A new unit and structure that provide the adventurous middle path between "wait for settlers" and "trade with neighbors." Solves hope drain for mountain/hill resources specifically.

#### Expedition unit

| Property | Value |
|----------|-------|
| Type ID | `'expedition'` |
| Icon | 🧭 |
| Production cost | 18 |
| Movement | 3 |
| Terrain penalty | None — moves through hills and mountains at full speed |
| Combat | None — destroyed by any enemy unit that moves onto its tile |
| Tech required | `'foraging'` (earliest exploration tech) |

The Expedition's identity is speed and reach, not fighting. It goes where settlers can't easily go.

#### "Establish Outpost" action

- Available when: Expedition is standing on a tile that has a resource AND the civ has researched the tech that reveals that resource.
- Duration: 2 turns (progress indicator shown, identical to improvement construction).
- The Expedition unit is consumed and replaced by the Outpost structure.

#### Resource Outpost structure

| Property | Value |
|----------|-------|
| Effect | Full resource effect (happiness, gold/turn, production/turn, or strategic access) — identical to owning via city territory |
| Upkeep | 2 gold/turn |
| Defenses | None — any enemy unit on the tile pillages and destroys the outpost |
| Visibility | Visible to all players (no fog concealment) |
| Conversion | If the owning civ later founds a city on that tile, the outpost converts to normal city-territory resource access and upkeep drops to zero |
| Tech dependency | Requires the revealing tech to remain researched (dormant if lost — not currently possible but future-proof) |

**Strategic texture:** Adults face a real choice — pay 2 gold/turn indefinitely vs. spend turns to settle. For a resource 8 hexes away through mountains, the outpost wins. For a resource 3 hexes into friendly flatlands, settling wins. The outpost being pillage-able naturally nudges players toward "maybe I should settle there eventually."

**Age 7 experience:** "Send my fast explorer, wait 2 turns, get iron, now I can build swordsmen." Concrete, exciting, short.

---

### Pillar 3 — Diplomatic Resource Trading: "Make Friends, Get Stuff"

The social path. Rewards exploration and relationship maintenance. Gives the youngest player a concrete reason to talk to neighbors.

#### Trade routes as resource conduits

- When a trade route is established between your city and another civ's city, you gain access to **one resource that civ possesses** — the one with the highest `basePrice` that you currently lack, evaluated at route creation time and fixed for the life of the route.
- If the trading civ loses that resource mid-route (e.g. their city is captured), the shared effect ends immediately even though the route itself remains active.
- The resource effect is identical to owning it via city territory.
- The resource is also lost the moment the trade route ends for any reason: war declared, route cancelled, city captured, route out of range.
- Declaring war on a civ mid-war means losing their resource supply — diplomatic cost has real teeth.

#### Marketplace panel — "Available from Known Civs" section

New section added to the existing Marketplace panel:

- Lists resources available from civs the player has met (never reveals undiscovered civs).
- Each entry shows: resource icon + name, which civ has it, active trade route status, and a "Propose Trade Route" button if no route exists.
- If at war with the only civ that has a resource: `"⚔️ Unavailable — at war with [Civ]"` — a visible reminder of the diplomatic cost.
- For the 7-year-old: a shopping list of reasons to explore and make friends.

#### One-time emergency import

- Available when: diplomatic contact exists with a civ that has the resource AND not currently at war with them (no active trade route required).
- Cost: 3× base resource price.
- Duration: 10 turns, then expires. Renewal costs the same — no loyalty discount.
- Purpose: "I need iron right now to finish this war" escape valve, not a preferred path.
- Expensive enough that players naturally migrate to trade routes for anything long-term.

---

### Pillar 4 — Guidance: "Teach As You Play"

Sits on top of all three paths. Makes the mechanic legible without a manual. Every tip uses **session-scoped suppression** (in-memory flag, cleared on page load) — not game-state suppression. Kids who play weekly forget between sessions; the advisor resets on each load so they get the reminder without penalty, while adults see it once and move on.

#### Advisor tip — resources exist (turn 3)

Fires on turn 3 if the player hasn't yet acted on any resource:

> "Special resources are scattered across the world — Iron, Silk, Ivory, and more. Each unlocks powerful units and buildings. Explore to find them!"

Session-scoped: fires at most once per load.

#### Advisor tip — resource discovered

Fires when fog lifts and reveals a resource tile:

- **Tech already researched:** Explorer advisor: *"We've spotted [icon] [Resource] to the [cardinal direction]! Build a [Improvement] there to claim it — or send an Expedition to plant a flag!"*
- **Tech not yet researched:** *"Scouts report an unknown deposit nearby. Our scholars say we'd need [Tech Name] to make use of it."*

Each resource type triggers this at most once per session load.

#### Advisor tip — locked item frustration

If a player opens the city panel, sees a locked item with a missing resource, and stays on the screen for 5+ seconds without acting (wall-clock timer, not game turns), the Builder advisor fires:

> "To unlock [Unit/Building], we need [Resource]. Tap 📍 to find the nearest deposit."

#### "Show me" waypoint — locked item button

The locked item hint in the city panel currently reads e.g. *"Iron (Mine on an Iron tile)"*.

Replace with a **📍 Find Iron** button that:
1. Closes the city panel.
2. Drops a visible waypoint marker on the nearest known (visible or fog-last-seen) Iron tile on the map.
3. Opens a small tooltip: *"Iron is here. To claim it: settle nearby + build a Mine, OR send an Expedition, OR trade with a civ that has it."*

If no Iron tile has ever been seen: *"No Iron spotted yet — keep exploring!"*

#### Improved locked-item tooltip text

Replace the terse single-line hint with three acquisition paths:

```
To get Iron:
  • Expand your city to an Iron tile and build a Mine
  • Send an Expedition to plant an Outpost on a distant Iron tile
  • Establish a trade route with a civilization that has Iron
```

---

## What This Preserves

- Resources remain special — every path requires real investment (turns, gold, diplomacy, or expedition risk).
- Adults still optimize toward the permanent settle path for efficiency.
- The 12-year-old has three interesting strategic choices per resource.
- The 10-year-old has an exciting expedition quest.
- The 7-year-old has a short visible path to the unit they want.
- War has a real cost: diplomatic trading breaks, outposts can be pillaged.
- Map seeds remain reproducible (start guarantee uses seeded RNG).

## Out of Scope

- Outpost garrisoning / defense upgrades (possible future feature).
- Resource-specific trade deals (sell a resource you have surplus of) — handled by existing trade route system.
- Tech that removes the improvement requirement (considered, deferred — adds complexity without clear payoff given the outpost path now exists).
