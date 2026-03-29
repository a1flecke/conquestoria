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

## Tech Panel
- Must list ALL tech tracks from the `TechTrack` type union — never hardcode a subset
- Derive track list from the type definition or `TECH_TREE` data
