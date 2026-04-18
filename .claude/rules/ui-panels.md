---
paths:
  - "src/ui/**"
  - "src/renderer/**"
  - "src/main.ts"
---

# UI Panel Rules

## Hot Seat Multiplayer
- NEVER hardcode `'player'` — always use `state.currentPlayer` for the active player
- This applies to: ownership checks, visibility lookups, diplomacy access, unit filtering
- Renderer functions must accept `currentPlayer` parameter for border colors and fog

## City Panel
- Must cycle through ALL player cities, not just `cities[0]`
- Track `currentCityIndex` and increment on each open
- Show building yield values (+food, +production, +gold, +science) in build queue
- Filter trainable units by `techRequired` against `civ.techState.completed`

## HUD
- Show per-turn yield rates (food, production, gold, science) summed across all cities
- Show gold as `currentGold (+perTurn)` format
- Show current research name, not just "..."

## Unit Info Panels
- ALL game entities (units, cities, buildings) must be identifiable on tap — show name, owner, description
- Enemy units must show: owner civ name, civ color (as border/accent), unit description, diplomatic relationship (At War / Neutral / Allied)
- Friendly units must show: description, HP, moves remaining, and available actions
- Use `textContent` / `createTextNode()` for dynamic text — never `innerHTML` with game-generated strings (XSS risk)

## Notifications
- Notifications must queue — never overwrite one notification with another
- Maintain a persistent notification log (last 50 entries) accessible via a log button
- Log entries must include the turn number for context

## Tech Panel
- Must list ALL tech tracks from the `TechTrack` type union — never hardcode a subset
- Derive track list from the type definition or `TECH_TREE` data
- If a panel action mutates state that the same panel renders, the visible panel must refresh immediately or render from a shared reactive helper. Updating only global state/HUD while leaving the open panel stale is a bug.
- Derived UI labels such as `next layer`, `reachable`, `recommended`, or `available soon` must come from one shared helper with both positive and negative coverage. If the label implies conjunctive reachability, tests must prove partially-met prerequisites stay hidden.

## Catalog Panels
- If a panel is the only place a player can browse or trigger a catalog of game actions, it MUST keep the full actionable catalog reachable
- Recommendation sections may be bounded, but they cannot be the only surface for starting lower-ranked items
- If you intentionally truncate or collapse a catalog, provide an explicit tested affordance such as `Show all`, `More`, or a separate complete section
- Add a regression that counts or otherwise proves all expected entries remain accessible from the live panel

## Recommendation Surfaces
- Do not treat seeded placeholder records as actionable advice
- Panels and dashboards that recommend actions must only surface opportunities the player can actually pursue now under tech, resource, city, and visibility rules
- Prefer one shared system helper for “reachable opportunities” instead of duplicating eligibility filters in each panel
- Recommendation sections may be selective. Browse/action sections may not become inaccessible because of recommendation ranking.
- Persistent intel UI must render from viewer-safe snapshots, not from the richer source object if the player did not earn that detail.

## Cities[0] Is Never The Answer (Extended)
The "cycle through all cities" rule applies to EVERY surface that gives city-scoped advice, not just the main city panel. This includes:
- Advisor triggers (`src/ui/advisor-system.ts`)
- Council agenda cards (`src/systems/council-system.ts`)
- Tutorial hints (`src/ui/tutorial.ts`)
- Turn summaries and HUD chips

Use `Object.values(state.cities).filter(c => c.owner === civId)` and then pick the relevant city (hungriest, most under-garrisoned, etc.) — never `civ.cities[0]`.

Exceptions: AI internal decisions that legitimately mean "capital" (e.g., `src/ai/basic-ai.ts` capital-distance heuristics, `src/systems/faction-system.ts` unrest-from-distance). Those may use `cities[0]` with a `// capital = cities[0] by convention` comment, so the hook script can tell intent from accident.

## Privacy And Discovery
- `getMinorCivPresentationForPlayer`, `getQuest*ForPlayer`, `getLegendaryWonderIntel*`, and any other `*ForPlayer` helper must mask EVERY player-visible field — name, color, icon, flavor text — behind the `known` / `discovered` check. Returning the real color while masking the name is a leak.
- UI code must prefer `*ForPlayer` helpers; never read `state.minorCivs[id].color` etc. directly from a viewer-side render path.

## No Silent Destructive UI
- Never silently replace a player-visible list (production queue, research queue, unit stack, trade route roster) when the player takes an action.
- If starting a new activity would discard scheduled work, preserve it (prepend/append the new item, keep the tail) or prompt for explicit confirmation.
- Regression tests must assert that pre-existing queue entries survive the operation.
- Queue UIs must show the active item, the queued follow-ups, and visible ETA/order feedback if the order matters to the player.
- Reorder/remove interactions must have regression coverage that clicks through the control and verifies the rendered queue state afterward, not just the underlying array mutation.
