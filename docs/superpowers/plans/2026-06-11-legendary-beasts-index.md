# Legendary Beasts — MR Index & Tracker

> **For agentic workers:** This is the tracking index for the 8-MR Legendary Beasts feature. Execute one MR at a time, in order, each in its own worktree branched from `main` (never commit to main directly). Each MR plan is self-contained; this file holds the shared contract, ordering, and status.

**Feature goal:** Unique, named, neutral mythic creatures tied to terrain-specific lairs. Era-gated awakening, territorial (leashed) behavior — they never attack cities and never roam. Slaying one is a permanent recorded achievement with escalating rewards by tier. Designed for family hot-seat play (kids 7/10/12): PvE excitement that doesn't pit siblings against each other, with a Calm mode and an Off switch.

**Design summary:** see the conversation/design notes captured in MR1's header and the shared contract below.

---

## Status

| MR | Plan file | Ships | Status |
|---|---|---|---|
| MR1 | [2026-06-11-legendary-beasts-mr1-core-boar.md](2026-06-11-legendary-beasts-mr1-core-boar.md) | Core system + Giant Boar + setup toggle + lair rendering | ✅ merged |
| MR2 | [2026-06-11-legendary-beasts-mr2-bestiary.md](2026-06-11-legendary-beasts-mr2-bestiary.md) | Bestiary panel + sighting banner + per-civ sighting tracking | ◐ in progress ([PR #366](https://github.com/a1flecke/conquestoria/pull/366)) |
| MR3 | [2026-06-11-legendary-beasts-mr3-wolves-basilisk.md](2026-06-11-legendary-beasts-mr3-wolves-basilisk.md) | Dire Wolf Pack + Emerald Basilisk + habitat concealment | ☐ not started |
| MR4 | [2026-06-11-legendary-beasts-mr4-hoard-trophies.md](2026-06-11-legendary-beasts-mr4-hoard-trophies.md) | Hoard choice panel + lair trophies + AI auto-resolve | ☐ not started |
| MR5 | [2026-06-11-legendary-beasts-mr5-serpent-wurm.md](2026-06-11-legendary-beasts-mr5-serpent-wurm.md) | Sea Serpent + Dune Wurm + naval passability + `beast-serpent` rig | ☐ not started |
| MR6 | [2026-06-11-legendary-beasts-mr6-roc-hydra.md](2026-06-11-legendary-beasts-mr6-roc-hydra.md) | Storm Roc + Swamp Hydra + flight + regen + `beast-winged` rig | ☐ not started |
| MR7 | [2026-06-11-legendary-beasts-mr7-ancient-dragon.md](2026-06-11-legendary-beasts-mr7-ancient-dragon.md) | Ancient Dragon apex + ranged breath + slay ceremony + apex reward | ☐ not started |
| MR8 | [2026-06-11-legendary-beasts-mr8-audio-ai-balance.md](2026-06-11-legendary-beasts-mr8-audio-ai-balance.md) | Roar SFX + tension music layer + gated AI hunting + balance bands | ☐ not started |

Update this table as MRs land: ☐ not started → ◐ in progress (PR #N) → ✅ merged (PR #N).

## Ordering & dependencies

```
MR1 ──► MR2 ──► MR3 ──► MR4 ──► MR5 ──► MR6 ──► MR7 ──► MR8
```

Strictly sequential — each plan's code blocks assume the previous MRs are merged to `main`. The game is fully playable (no dead surfaces) after every MR. If an MR must be skipped or reordered, re-read the later plans for references to the skipped pieces before executing.

---

## Shared design contract (authoritative — all plans conform to this)

**Names that must never drift between MRs:**

- Owner constant: `BEAST_OWNER = 'beasts'` (exported from `src/systems/beast-system.ts`)
- `BeastId` union (grows per MR; every `Record<BeastId, …>` stays exhaustive):
  - MR1 `'giant_boar'` · MR3 `'dire_wolf'`, `'emerald_basilisk'` · MR5 `'sea_serpent'`, `'dune_wurm'` · MR6 `'storm_roc'`, `'swamp_hydra'` · MR7 `'ancient_dragon'`
- `UnitType` additions (each forces entries in SIX exhaustive maps — `UNIT_DEFINITIONS`, `UNIT_DESCRIPTIONS`, `FALLBACK_ICONS`, `UNIT_MOTION_STYLES`, `UNIT_SPRITE_CATALOG`, `LOCOMOTION_CLASS`):
  - `beast_boar`, `beast_wolf`, `beast_basilisk`, `beast_sea_serpent`, `beast_wurm`, `beast_roc`, `beast_hydra`, `beast_dragon`
- State: `GameState.beasts?: BeastsState` — `{ mode, lairs, sightingsByCiv, pendingHoardChoices? }`; `BeastLair` `{ id: 'lair-<beastId>', beastId, position, status: 'dormant'|'awake'|'slain'|'claimed', strength, awakenedTurn?, slainBy?, slainTurn?, claimedBy?, unitIds }`
- Settings: `GameSettings.beastsMode?: 'off' | 'calm' | 'wild'` (default `'wild'` for new games; `undefined` legacy saves = no beasts); MR8 adds `aiContestsBeasts?: boolean` (default false)
- Events: `'beast:awakened'`, `'beast:slain'` (MR1) · `'beast:sighted'` (MR2) · `'beast:hoard-claimed'` (MR4)
- Key exports from `beast-system.ts`: `placeBeastLairs`, `processBeasts` (orders-out, mirroring `processBarbarians`), `recordBeastSlain` (shared, actor-complete), `getBeastHoardGold`, `isBeastUnit` (MR1) · `isBeastConcealedFrom` (MR3) · `applyHoardChoice`, `getHoardChoicePreview`, `getClaimedTrophyGoldPerTurn` (MR4) · `isTerrainPassableForBeast`, `canUnitAttackBeast` (MR5) · `isCivUnitInBeastTerritory` (MR8)
- Definitions: `BEAST_DEFINITIONS: Record<BeastId, BeastDefinition>` in `src/systems/beast-definitions.ts`; flags accumulate: `concealedInHabitat` (MR3), `navalOnly` (MR5), `flying` + `regenPerTurn` (MR6)

**Reward ladder:**

| Tier | Beasts | On slay |
|---|---|---|
| 1 | boar, wolves | auto gold (era-scaled) + Victory Feast full heal |
| 2 | basilisk, wurm | choose one: Gold ×2 / Lore (research) / Trophy (+3 gold/turn) |
| 3 | serpent, roc, hydra | slay ceremony, then the tier-2 choice (Trophy +5 gold/turn) |
| 4 (apex) | dragon | ceremony + EVERYTHING (gold ×2 + lore + trophy +8/turn) + slayer becomes max veterancy |

**Behavior invariants (enforced by tests in MR1/MR5/MR6):**

- Beasts are territorial: leashed to their lair radius, never attack cities, never roam
- `calm` mode: beasts exist, regen, and defend, but never initiate movement or attacks; `off`: no lairs placed
- All RNG seeded (`createRng` for placement, local LCG for turns); zero `Math.random`
- Spawn occupancy: never stack on existing units; skip spawn if no free tile
- `recordBeastSlain` is the only slay consequence path — called from main.ts player combat AND turn-manager (actor-complete)
- Legacy saves (`state.beasts === undefined`) load and play normally

**Rules-file exemption (MR1):** beast unit types are intentionally NOT trainable — documented in `.claude/rules/game-systems.md`.

## Roster reference

| Beast | Habitat | Awakens | Tier | Pack | Leash | Signature |
|---|---|---|---|---|---|---|
| Giant Boar | forest | era 1 | 1 | 1 | 3 | the "tutorial" beast |
| Dire Wolf Pack | tundra/snow | era 1 | 1 | 3 | 4 | pack of three |
| Emerald Basilisk | jungle | era 2 | 2 | 1 | 3 | concealed in habitat (ambush) |
| Dune Wurm | desert | era 2 | 2 | 1 | 3 | concealed in habitat (burrow) |
| Sea Serpent | ocean | era 3 | 3 | 1 | 5 | naval-only target; hunts ships |
| Storm Roc | mountain | era 3 | 3 | 1 | 4 | flies over any land terrain |
| Swamp Hydra | swamp | era 3 | 3 | 1 | 3 | regenerates 10 HP/turn |
| Ancient Dragon | volcanic | era 4 | 4 | 1 | 4 | flying + 2-hex fire breath |

## Execution notes for every MR

- Branch from fresh `main` in a new worktree; PR per MR; **never commit to main**
- Gates before any push: `bash scripts/run-with-mise.sh yarn build` AND `bash scripts/run-with-mise.sh yarn test` both exit 0
- Always use `bash scripts/run-with-mise.sh yarn <cmd>` — never `eval "$(mise activate bash)"`
- Each plan carries an Out-of-scope + "Why this is safe to merge partial" PR body per `.claude/rules/incremental-mr-completion.md`
- Follow-up candidates intentionally NOT in any MR: minor-civ "slay the beast" quests (pairs with quest chains, issue #352); beast-slay videos via the wonder-video pipeline; bestiary entries in the wonder atlas
