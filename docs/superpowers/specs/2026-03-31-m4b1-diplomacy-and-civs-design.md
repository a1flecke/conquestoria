# M4b-1: Diplomacy & Civs — Design Spec

> **Goal:** Expand diplomacy with vassalage, betrayal reputation, embargoes, and defensive leagues. Add 4 new civilizations (Russia, Ottoman, Shire, Isengard).

## 1. Vassalage

### Overview

A civ that has lost 50%+ of its peak cities or military units can offer vassalage to a stronger neighbor. Vassalage creates a binding overlord/vassal relationship with real obligations on both sides.

**Eligibility:** A civ qualifies to offer vassalage when its current city count or military unit count drops below 50% of its peak count during the game. Peak counts are tracked on DiplomacyState.

**Bilateral update rule:** All vassalage operations (`offerVassalage`, `acceptVassalage`, `endVassalage`) MUST update both the vassal's and overlord's `DiplomacyState.vassalage` atomically, following the project's bilateral diplomacy convention.

### Vassal Obligations

- Pays tribute: 25% of gold income per turn to overlord
- Cannot declare war, sign treaties, join/propose embargoes, or join/propose leagues independently — all blocked at the action validation layer
- Must join overlord's wars: when overlord calls `declareWar()`, vassal's `declareWar()` is called inline in the same function (not deferred to turn processing)
- Automatically joins overlord's embargoes

### Overlord Obligations

- Must defend vassal if attacked (auto-declare war on attacker)
- Failure to protect reduces protection score

### Protection Score

- Tracked per vassal: starts at 100
- When vassal is attacked, a protection timer starts
- **Multiple simultaneous attacks:** `protectionTimers` is an array — each attacker gets its own 3-turn timer
- If overlord declares war on attacker within window: that timer is cleared, no penalty
- If a timer expires without overlord response: -20 protection score per undefended attack
- Protection score modifies independence threshold:
  - Default: vassal petitions at 60% of overlord's military strength
  - Per 20 points lost: threshold drops by 10% (e.g., at protection 60 → petitions at 40%)
- At protection ≤ 20, vassal breaks away automatically (no petition, immediate independence)

### Independence

- Vassals petition for independence when military strength exceeds the (modified) threshold
- Overlord can accept (peaceful separation, +10 relationship) or refuse (vassal declares war, relationship drops to -50)
- AI personality drives decision: aggressive/expansionist civs refuse more often; diplomatic civs accept

### Edge Cases

- **Overlord eliminated:** If overlord loses all cities, all vassals gain immediate independence with no treachery penalty. Event: `vassalage-ended` with reason `'overlord_eliminated'`.
- **Vassal in a league:** Vassals cannot be members of a defensive league. Becoming a vassal forces league departure (no treachery penalty — involuntary).
- **Vassal declares independence war:** Counts as treaty-breaking — vassal gains +20 treachery for breaking vassalage.

### Data Model

```typescript
// On DiplomacyState
vassalage: {
  overlord: string | null;
  vassals: string[];
  protectionScore: number;        // 0-100, only relevant for vassals
  protectionTimers: Array<{       // multiple simultaneous attacks supported
    attackerCivId: string;
    turnsRemaining: number;
  }>;
  peakCities: number;             // highest city count this game
  peakMilitary: number;           // highest military unit count this game
}

// New treaty type
type TreatyType = ... | 'vassalage';

// New diplomatic actions
type DiplomaticAction = ... | 'offer_vassalage' | 'petition_independence';
```

### Turn Processing (wired into turn-manager.ts, after gold calculation)

- Update peak city/military counts for all civs
- Process vassalage tribute: deduct 25% gold from vassal, add to overlord
- Decrement protection timers; apply -20 penalty for each expired timer
- Check auto-breakaway: if protection ≤ 20, end vassalage immediately
- Check independence threshold: if vassal military > modified threshold, trigger petition
- If overlord is eliminated, free all vassals

## 2. Betrayal & Reputation

### Overview

Breaking treaties has lasting consequences. A treachery score tracks how untrustworthy a civ has become, affecting all diplomatic relationships globally.

### Treachery Scoring

| Action | Treachery Increase |
|--------|--------------------|
| Break non-aggression pact | +20 |
| Break trade agreement | +15 |
| Break alliance | +30 |
| Break vassalage (overlord abandons vassal) | +40 |
| Vassal declares independence war | +20 |
| Leave embargo while target at war with remaining participants | +5 |
| Leave defensive league while member under attack | +10 |

**Stacking on war declaration:** Declaring war on a civ automatically breaks any NAP and alliance with that civ. Both breaks trigger treachery independently. Example: declaring war on an ally with a NAP = +20 (NAP) + +30 (alliance) = +50 total treachery. This is intentional — having more treaties means more trust to break.

**Clamping:** Treachery score is clamped to 0-100. It cannot exceed 100 regardless of stacking.

### Global Penalty

On each betrayal, all other civs receive a relationship penalty:
- Penalty = -(treacheryScore / 4), applied once at time of betrayal
- Because treacheryScore is cumulative, later betrayals produce larger global penalties — this is intentional to make serial betrayers increasingly isolated
- Example: first NAP break (treachery 20) → -5 with all civs; second alliance break (treachery 50) → -12 with all civs

### Decay

- Treachery decays at 1 point per 5 turns
- Minimum is 0; takes 100+ turns to fully clear a major betrayal

### AI Personality Interaction

- Honorable civs (diplomatic trait): refuse all treaties with civs at treachery > 40
- Treacherous civs (aggressive trait): ignore others' treachery scores
- Neutral civs: factor treachery into treaty acceptance (lower acceptance probability)

### Data Model

```typescript
// On DiplomacyState
treacheryScore: number;  // 0-100, clamped, persistent

// New diplomatic event type
type DiplomaticEventType = ... | 'treaty_broken';
```

### Integration

- `breakTreaty()` updated to increment treachery (clamped) and broadcast global penalty
- `declareWar()` checks for broken treaties (NAP, alliance) and triggers treachery for each
- `processRelationshipDrift()` factors in treachery for AI treaty decisions
- Turn processing decays treachery (1 point per 5 turns, after diplomacy processing)

## 3. Embargoes

### Overview

Any civ can propose an embargo against another civ. Embargoes are multilateral — multiple civs can participate in cutting off a target.

### Mechanics

- **Proposal:** any civ can propose an embargo against any other civ they're not allied with. Requires Currency tech or era ≥ 2 (consistent with trade system gating).
- **Joining:** other civs can be invited to join; AI weighs relationship with proposer vs target
- **Effect:** severs all existing trade routes between participants and target (trade route objects are deleted); blocks new trade agreements with target while active. When embargo lifts, routes must be manually re-established.
- **Duration:** permanent until explicitly lifted
- **Leaving:** any participant can unilaterally leave; counts as minor betrayal (+5 treachery) if target is actively at war with remaining participants
- **Vassals:** vassals automatically join their overlord's embargoes and cannot independently propose, join, or leave them
- **Multiple embargoes:** only one embargo can exist per target civ. If a second is proposed against the same target, the proposer joins the existing embargo instead.

### AI Decision

- AI joins if: relationship with proposer > relationship with target + 20
- Aggressive civs have lower threshold (+10 instead of +20)
- Diplomatic civs have higher threshold (+30)

### Data Model

```typescript
// On GameState (multilateral, NOT optional — always initialized as empty array)
embargoes: Array<{
  id: string;
  targetCivId: string;
  participants: string[];
  proposedTurn: number;
}>;

// New diplomatic actions
type DiplomaticAction = ... | 'propose_embargo' | 'join_embargo' | 'leave_embargo';
```

### Turn Processing (wired into turn-manager.ts, BEFORE trade route income)

- Enforce embargoes: delete any trade routes between embargo participants and target
- Remove invalidated embargoes: remove if no participants remain

## 4. Defensive Leagues

### Overview

Two or more civs form a multilateral defense pact. An attack on one triggers war from all.

### Mechanics

- **Formation:** any civ can propose a league with another civ
- **Requirements:** Writing tech minimum, relationship > 0 with all existing members
- **Inviting:** existing members can invite outsiders to join
- **Petitioning:** outsiders can request to join; requires majority vote from existing members (AI votes based on relationship > 10 with petitioner)
- **Effect:** attack on any member triggers automatic war declaration by all other members against the attacker
- **Cascade prevention:** auto-war declarations triggered by league defense do NOT trigger other leagues' defensive clauses. Only direct (voluntary) war declarations trigger league defense. This prevents instant world wars.
- **Dissolution:** league dissolves if any two members go to war with each other. All remaining members lose their league membership; no automatic re-formation (must propose a new league).
- **Leaving:** a member can voluntarily leave; +10 treachery if leaving while a member is under active attack
- **Limit:** a civ can only belong to one defensive league at a time
- **Vassals:** vassals cannot be league members. Becoming a vassal forces league departure (no treachery penalty — involuntary).

### AI Decision

- AI accepts league proposals if: relationship with all existing members > 10, and no member is at war with a civ the AI has an alliance with
- AI petitions to join leagues if: surrounded by hostile civs and league members are nearby

### Data Model

```typescript
// On GameState (multilateral, NOT optional — always initialized as empty array)
defensiveLeagues: Array<{
  id: string;
  members: string[];
  formedTurn: number;
}>;

// New diplomatic actions
type DiplomaticAction = ... | 'propose_league' | 'invite_to_league' | 'petition_league' | 'leave_league';
```

### Turn Processing (wired into turn-manager.ts, after diplomacy processing)

- When `declareWar()` is called with `isVoluntary: true` flag, check if target is in a defensive league → auto-declare war on attacker from all league members (with `isVoluntary: false` to prevent cascade)
- Clean up dissolved leagues (any two members at war with each other)

## 5. Four New Civilizations

| Civ | ID | Color | Bonus Effect | Personality |
|-----|----|-------|-------------|-------------|
| Russia | `russia` | `#1e3a5f` | `tundra_bonus` — +1 food, +1 production on tundra/snow tiles | expansionist, aggressive |
| Ottoman | `ottoman` | `#b91c1c` | `siege_bonus` — +50% damage against fortified cities | aggressive, expansionist |
| The Shire | `shire` | `#86efac` | `peaceful_growth` — +2 food in all cities, -25% military production | diplomatic, trader |
| Isengard | `isengard` | `#374151` | `forest_industry` — can raze forest tiles for +30 burst production | aggressive, expansionist |

### Bonus Effect Integration

- **Russia (`tundra_bonus`):** `resource-system.ts` → `calculateCityYields(city, map, bonusEffect?)` gains optional third parameter. Adds +1 food, +1 production for tundra/snow tiles owned by Russian cities. Caller in turn-manager.ts already looks up civDef, passes `civDef?.bonusEffect`.
- **Ottoman (`siege_bonus`):** `combat-system.ts` → `resolveCombat()` gains a `context?: { attackerBonus?: CivBonusEffect; defenderInFortifiedCity?: boolean }` parameter. Applies +50% attack damage when Ottoman unit attacks a city with walls/fortification.
- **Shire (`peaceful_growth`):** `resource-system.ts` → +2 base food per city via bonusEffect parameter; `city-system.ts` → military unit production costs × 1.25 (applied last, after all other production bonuses, as a multiplicative penalty on final cost).
- **Isengard (`forest_industry`):** `city-system.ts` → new function `razeForestForProduction(city, map, tileCoord)`: checks tile is forest and adjacent to city, changes terrain to plains, destroys any existing improvement on the tile, adds +30 production to current queue item. This is an irreversible map mutation visible to all players.

### CivBonusEffect Types (added to existing union in types.ts)

```typescript
| { type: 'tundra_bonus'; foodBonus: number; productionBonus: number }
| { type: 'siege_bonus'; damageMultiplier: number }
| { type: 'peaceful_growth'; foodBonus: number; militaryPenalty: number }
| { type: 'forest_industry'; productionBurst: number }
```

## 6. Architecture & Wiring

### Files Modified

| File | Changes |
|------|---------|
| `src/core/types.ts` | New diplomatic actions, treaty types, vassalage fields, treachery score, embargo/league types on GameState (non-optional, initialized as empty arrays), 4 new CivBonusEffect variants added to existing union |
| `src/systems/diplomacy-system.ts` | Vassalage lifecycle (bilateral), betrayal tracking with global broadcast, embargo CRUD, league CRUD, treachery decay, `declareWar()` gains `isVoluntary` flag for cascade prevention |
| `src/systems/civ-definitions.ts` | 4 new civ definitions |
| `src/systems/resource-system.ts` | `calculateCityYields()` gains optional `bonusEffect` parameter; Russia tundra bonus, Shire food bonus |
| `src/systems/combat-system.ts` | `resolveCombat()` gains optional `context` parameter; Ottoman siege bonus |
| `src/systems/city-system.ts` | Isengard `razeForestForProduction()`, Shire military penalty (applied last) |
| `src/ai/ai-diplomacy.ts` | AI decisions for vassalage, embargoes, leagues, treachery awareness |
| `src/core/turn-manager.ts` | Vassalage tribute (after gold), embargo enforcement (before trade routes), protection timers, treachery decay (after diplomacy), league cleanup (after diplomacy) |
| `src/core/game-state.ts` | Initialize vassalage on each civ's DiplomacyState, embargoes/leagues arrays on GameState in both createNewGame and createHotSeatGame |
| `src/ui/advisor-system.ts` | Chancellor advisor messages for new diplomatic options |

### Turn Processing Order (insertion points in processTurn)

```
1. Cities (food, growth, production)
2. Research
3. Gold calculation
4. >>> Vassalage tribute (after gold, so tribute is based on this turn's income)
5. Unit resets
6. Diplomacy (drift, decay, treaties)
7. >>> Treachery decay (after diplomacy processing)
8. >>> League cleanup (after diplomacy — check for dissolved leagues)
9. Visibility
10. >>> Embargo enforcement (before marketplace/trade route income)
11. Marketplace / trade routes
12. Wonders
13. Barbarians
14. Minor civs
15. Espionage
16. >>> Protection timer processing (after all war declarations have been processed)
17. >>> Independence threshold check (after protection timers updated)
18. Era advancement
19. Turn increment
```

### Wiring Checklist (lesson from M4a)

Every new system must be:
1. **Initialized** in `createNewGame()` and `createHotSeatGame()` in game-state.ts
2. **Processed** in `processTurn()` in turn-manager.ts at the specified insertion points
3. **AI-driven** in `processAITurn()` in basic-ai.ts (via ai-diplomacy.ts)
4. **Typed** with events in GameEvents interface
5. **Tested** with integration tests verifying the full wiring

**Note:** The existing `createNewGame()` at line 34 uses `Math.random()` for AI civ selection — this is a pre-existing bug. M4b-1 must NOT introduce any new `Math.random()` calls. All AI diplomatic decisions must use seeded RNG.

### Events (added to GameEvents)

```typescript
'diplomacy:vassalage-offered': { fromCivId: string; toCivId: string }
'diplomacy:vassalage-accepted': { vassalId: string; overlordId: string }
'diplomacy:vassalage-ended': { vassalId: string; overlordId: string; reason: 'independence' | 'war' | 'auto_breakaway' | 'overlord_eliminated' }
'diplomacy:protection-failed': { overlordId: string; vassalId: string; attackerId: string }
'diplomacy:treachery': { civId: string; action: string; newScore: number }
'diplomacy:embargo-proposed': { proposerId: string; targetCivId: string; embargoId: string }
'diplomacy:embargo-joined': { civId: string; embargoId: string }
'diplomacy:embargo-left': { civId: string; embargoId: string }
'diplomacy:league-formed': { leagueId: string; members: string[] }
'diplomacy:league-joined': { civId: string; leagueId: string }
'diplomacy:league-dissolved': { leagueId: string; reason: string }
'diplomacy:league-triggered': { leagueId: string; attackerId: string; defenderId: string }
```

## 7. Testing Strategy

### Unit Tests
- Vassalage: offer/accept/refuse, tribute calculation, protection score mechanics (multiple timers), independence petition threshold, auto-breakaway at ≤20, overlord eliminated frees vassals, bilateral state sync
- Betrayal: treachery scoring for each action type (including stacking on war declaration), global penalty calculation, clamping at 100, decay over turns, AI personality filtering
- Embargoes: propose/join/leave, trade route deletion, tech gate validation, one-per-target merging, vassal auto-join, invalid embargo cleanup
- Leagues: propose/invite/petition (majority vote), attack triggers war (voluntary only — no cascade), dissolution on internal conflict, leave penalties, vassal cannot join
- Civs: bonus effect integration for each new civ, Isengard forest raze destroys improvements

### Negative Tests
- Vassal attempts to declare war independently → blocked
- Vassal attempts to propose embargo → blocked
- Vassal attempts to join league → blocked
- Propose embargo against an ally → blocked
- Join a second defensive league → blocked
- Offer vassalage when above 50% peak strength → blocked
- Propose embargo without Currency tech / era 2 → blocked
- Propose league without Writing tech → blocked

### Integration Tests
- Vassalage tribute flows through turn processing (correct gold amounts)
- Betrayal penalties propagate to all civs bilaterally
- Embargo deletes trade routes in turn processing (gold income zeroed)
- League attack triggers war declarations through turn processing (voluntary flag)
- League auto-war does NOT cascade to trigger other leagues
- AI makes reasonable vassalage/embargo/league decisions with seeded RNG (deterministic)
- Hot seat: multilateral state (embargoes, leagues) visible to all players correctly
- Game state initialization includes all new fields (embargoes, leagues, vassalage)
- Cross-system: vassal forced out of league when accepting vassalage
- Cross-system: overlord eliminated → all vassals freed
- Cross-system: embargo + vassalage → vassal auto-joins overlord's embargo

## 8. Acceptance Criteria

- [ ] Losing civ (below 50% peak) can offer vassalage; tribute, war obligations, and independence petition all work
- [ ] Overlord protection score tracks defensive commitment with per-attacker timers; poor protection accelerates breakaway; auto-breakaway at ≤20
- [ ] Overlord elimination frees all vassals automatically
- [ ] Vassals cannot act independently (war, treaties, embargoes, leagues all blocked)
- [ ] Treaty-breaking triggers treachery score (stacking on war declaration) with global relationship penalties; clamped at 100; decays over time
- [ ] Any civ can propose embargo (requires Currency/era 2); trade routes deleted; one embargo per target; participants can leave
- [ ] Vassals auto-join overlord embargoes
- [ ] Defensive leagues form, trigger war on voluntary attack only (no cascade), dissolve on internal conflict
- [ ] League invitation and petition (majority vote) mechanics work
- [ ] Vassals cannot be league members; becoming vassal forces league departure
- [ ] Russia, Ottoman, Shire, Isengard playable with functional bonus effects
- [ ] Isengard forest raze is irreversible, destroys improvements, changes terrain to plains
- [ ] All new systems wired into game loop at correct insertion points, game creation, and AI turn processing
- [ ] No new Math.random() calls — all AI decisions use seeded RNG
- [ ] All new systems have unit + negative + integration tests
