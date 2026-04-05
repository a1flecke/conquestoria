---
paths:
  - "src/systems/**"
  - "src/core/**"
---

# Strategy Game Mechanics Checklist

## Core mechanics that MUST exist
Every 4X/Civ-like game needs these — if any are missing, implement them:
- **Healing**: Units must recover HP. Auto-heal for idle units + explicit Rest action for player control
- **Unit identity**: Every unit type must have a human-readable description. Enemy units must show owner name, faction color, and diplomatic relationship
- **Combat preview**: Show expected outcome BEFORE committing to an attack (strength comparison, terrain bonuses, odds assessment)
- **Unit cycling**: After a unit acts, auto-select the next unmoved unit. Provide a "Next Unit" button for manual cycling
- **Persistent notifications**: Important game events must be accessible after they disappear — use a notification log, not just toasts

## Balance across eras
- Combat damage, unit costs, and production rates must be tested at EACH era/age, not just the current one
- Early-game combat between same-tier units should resolve in 2-4 exchanges, not 5+
- Write balance tests with statistical sampling (run N trials, assert average is in expected range)

## Storage resilience
- Primary storage (IndexedDB) MUST have a fallback (localStorage) for mobile Safari eviction
- Call `navigator.storage.persist()` on first use
- Provide manual export/import as a last-resort backup
- Auto-save on game creation, not just on turn end — a player who closes before turn 1 must not lose their game
