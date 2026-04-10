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
