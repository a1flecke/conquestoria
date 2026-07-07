# Minor Civ Regional Grievance And Mobilization Design

Date: 2026-07-07

Issue: https://github.com/a1flecke/conquestoria/issues/355

Follow-up issue for deeper hidden city-state economy: https://github.com/a1flecke/conquestoria/issues/490

## Summary

Issue 355 should become a regional consequence system for aggression against minor civilizations. When a major civilization conquers or seriously harms a city-state, nearby surviving city-states remember that act as regional grievance against the aggressor. Grievance can move a city-state through readable postures: `Wary`, `Mobilizing`, `Coalition Talks`, `At War`, and `Cooling Down`.

The feature is not a full city-state economy. It uses a focused grievance and mobilization ledger so city-states can respond believably without magical unit grants. Full hidden city-state production, build queues, richer yields, and league politics belong to issue 490.

## Design Influences

This design borrows patterns from other strategy games without copying their full complexity:

- Europa Universalis IV uses aggressive expansion and coalitions to slow runaway conquest and make regional conquest politically dangerous.
- Civilization VI uses grievances and warmongering memory so aggression persists, decays, and can be repaired through restorative play.
- Crusader Kings II defensive pacts and threat systems show the risk of over-punitive anti-expansion mechanics: they are useful guardrails, but must be readable and avoid dogpiling young realms too early.
- Diplomacy and historical league politics show that coalition play is most fun when trust, fear, betrayal, and recovery are legible rather than purely numeric.

Reference links:

- https://eu4.paradoxwikis.com/Relations
- https://civilization.fandom.com/wiki/Grievances_(Civ6)
- https://civilization.fandom.com/wiki/Warmongering_(Civ6)
- https://ck2.paradoxwikis.com/Defensive_pact
- https://en.wikipedia.org/wiki/Diplomacy_(game)

## Current Code Context

The current code already has useful foundations:

- `src/systems/minor-civ-system.ts` owns minor-civ placement, turn behavior, conquest, garrison replacement, quests, and diplomatic reactions.
- `conquestMinorCiv(state, mcId, conquerorId)` captures the minor-civ city, clears the conquered minor civ, and currently applies a broad relationship penalty to every surviving minor civ.
- `src/systems/minor-civ-actions.ts` has canonical helpers for gifts, festivals, and minor-civ war and peace.
- `src/systems/minor-civ-diplomacy.ts` has `isMinorCivAtWar` and `isMinorCivHostileToOwner`.
- `src/systems/diplomacy-system.ts` has bilateral `declareWar`, `makePeace`, and relationship helpers.
- `src/core/opponent-challenge.ts` defines `explorer`, `standard`, and `veteran` profiles.
- Minor-civ notifications already route owner-scoped quest, alliance, relationship, and guerrilla events through hot-seat-aware listeners.

The main current behavior to replace is the global conquest penalty in `conquestMinorCiv`. Coalition pressure should be local, relationship-aware, difficulty-aware, era-aware, and reversible over time.

Implementation must also respect the current repo rule that turn-processing systems return new `GameState` objects. New coalition, grievance, and mobilization helpers must use immutable state updates and explicit transition payloads instead of mutating nested `MinorCivState`, `City`, `Unit`, or `GameState` fields in place. Existing mutable minor-civ paths touched by this work should be corrected within the touched code path rather than copied into new helpers.

## Goals

- Make rapid conquest of city-states create meaningful diplomatic consequences.
- Keep the consequence regional and understandable rather than global and arbitrary.
- Prevent coalition war from firing too early while civilizations are still young.
- Avoid magical free unit spawns. Mobilized units must come from time, local defensive posture, or costly emergency conscription.
- Let relationships heal through time, reparations, quests, festivals, defense, liberation, and returning city-state cities.
- Support both solo and hot-seat games with the same saved state and viewer-safe presentation.
- Keep UI readable for mobile and younger players while preserving enough mystery for adult players.

## Non-Goals

- Do not implement a full hidden minor-civ production economy in issue 355.
- Do not create city-state leagues, voting bodies, or confederacies in issue 355.
- Do not expose exact grievance formulas in normal UI.
- Do not make city-states full major-civ opponents.
- Do not allow coalition war in Era 1.

## Player-Facing Contract

City-state aggression creates a story the player can understand:

- `Wary`: They remember your attack on a nearby city-state.
- `Mobilizing`: They fear further conquest and are preparing defenders.
- `Coalition Talks`: Nearby city-states are coordinating against you.
- `At War`: They joined a regional coalition war.
- `Cooling Down`: Tensions are easing, but trust has not fully recovered.

The UI should show short cause and recovery text instead of exact numbers. Example messages:

- "They remember your conquest of Geneva."
- "Nearby city-states fear further conquest."
- "Reparations can calm this crisis. Defending city-states or returning a captured city will heal trust more deeply."
- "Time is helping, but trust will recover slowly."

## State Model

Add focused, serializable state to `MinorCivState`:

```ts
export type MinorCivGrievanceCauseType =
  | 'minor-civ-conquered'
  | 'minor-civ-attacked'
  | 'coalition-war'
  | 'reparations'
  | 'quest-completed'
  | 'festival-sponsored'
  | 'threat-defeated'
  | 'city-liberated'
  | 'city-returned'
  | 'time-decay';

export interface MinorCivGrievanceCause {
  type: MinorCivGrievanceCauseType;
  turn: number;
  sourceMinorCivId?: string;
  cityId?: string;
  pressureDelta: number;
  relationshipDelta: number;
}

export type MinorCivCoalitionPosture =
  | 'none'
  | 'wary'
  | 'mobilizing'
  | 'coalition-talks'
  | 'at-war'
  | 'cooling-down';

export interface MinorCivRegionalGrievance {
  aggressorCivId: string;
  pressure: number;
  posture: MinorCivCoalitionPosture;
  lastAggressionTurn: number;
  lastPostureChangeTurn: number;
  causes: MinorCivGrievanceCause[];
  coalitionId?: string;
  talksStartedTurn?: number;
  warEligibleOnTurn?: number;
  pairCooldownUntil?: number;
  conscriptCooldownUntil?: number;
  strainedUntil?: number;
  mobilizationProgress?: number;
}

export interface MinorCivCoalitionRecord {
  id: string;
  targetCivId: string;
  memberIds: string[];
  regionKey: string;
  status: 'talks' | 'war' | 'cooling-down' | 'dissolved';
  formedTurn: number;
  warEligibleOnTurn: number;
  cooldownUntil?: number;
}
```

Expected storage placement:

- `MinorCivState.regionalGrievanceByCiv?: Record<string, MinorCivRegionalGrievance>`
- `GameState.minorCivCoalitions?: Record<string, MinorCivCoalitionRecord>`
- `GameState.minorCivRegionalCooldowns?: Record<string, { targetCivId: string; memberIds: string[]; cooldownUntil: number }>`

The exact property names can change during implementation, but the design requires these concepts: aggressor-specific grievance, city-state posture, coalition group membership, pair cooldown, regional cooldown, conscription cooldown, recovery strain, and mobilization progress.

Cause records are durable gameplay state, not notification copy. Presentation helpers must translate cause records into viewer-safe text, masking undiscovered city-state names and cities.

## Aggression Recording

`conquestMinorCiv(state, victimMcId, conquerorId)` should call a shared helper such as `recordMinorCivRegionalAggression` after the conquest mutation is known.

The helper evaluates nearby surviving minor civs using:

- Distance between the victim city and the neighbor city, with wrapped hex distance when the map wraps.
- Whether the neighbor is destroyed or missing a city.
- The neighbor's relationship or durable alliance status toward the victim's known friends or toward the aggressor.
- Neighbor archetype. Militaristic city-states may respond more quickly to threat. Cultural and mercantile city-states may condemn conquest more sharply.
- Current era.
- Opponent challenge profile.
- Existing pair and regional cooldowns.

Conquest should no longer apply a blanket penalty to every surviving minor civ. Distant city-states may hear rumors later in a richer diplomacy system, but issue 355 should focus on local regional reaction.

The same helper must be used for human and AI conquest paths. Tests must prove a human conquest and an AI/non-human conquest both record grievance through the same actor-complete mutation path. UI handlers must not own grievance logic.

## Posture Evaluation

The posture evaluator maps hidden pressure to readable states:

- `none`: no active grievance.
- `wary`: pressure exists but no active military posture.
- `mobilizing`: pressure is high enough that the city-state changes defensive priorities.
- `coalition-talks`: two or more eligible nearby mature city-states coordinate against the same aggressor.
- `at-war`: the coalition has declared war.
- `cooling-down`: the crisis ended, but pair or regional cooldown still prevents immediate reformation.

Transition events must be emitted only when posture changes or a concrete action occurs. Events must not be re-derived every turn from steady-state scans.

## Era And Maturity Gates

Era 1 is protected:

- City-states can become `wary`.
- City-states can become `mobilizing`.
- Directly threatened city-states may use limited local emergency conscription if all conscription rules pass.
- Formal `coalition-talks` records are not created in Era 1. Era 1 can show warning or rumor text through `wary` or `mobilizing` presentation only.
- Coalition war cannot begin.

Era 2 and later:

- Coalition talks require at least two eligible nearby surviving minor civs with active grievance against the same aggressor.
- Coalition war requires active talks, no blocking pair cooldown, no blocking regional cooldown, and enough maturity.
- Maturity is a conjunctive gate: era alone is not enough, and grievance alone is not enough. The implementation plan must define a concrete regional maturity score from city size, city maturity, surviving unit count, or the aggressor's relative regional threat. A single tiny outpost must not trigger a full regional war by itself.

## Difficulty Tuning

Use `resolveOpponentChallenge(state)` and the existing challenge profile style.

Explorer:

- Higher grievance thresholds.
- Slower posture escalation.
- Longer coalition-talk countdown.
- Less frequent conscription.
- Clearer and earlier warning messages.
- Longer recovery windows after a crisis ends.

Standard:

- Balanced thresholds.
- Coalition talks are meaningful but avoid surprise war.
- Emergency conscription is rare and costly.

Veteran:

- Lower grievance thresholds.
- Faster talks.
- Better mobilization priorities.
- Shorter hesitation before war.
- Still no free units and still no Era 1 coalition war.

## Mobilization

Mobilization changes priorities instead of granting units for free.

While a minor civ is `mobilizing` or in `coalition-talks`:

- Units prefer defense, nearby threat response, and coalition target awareness.
- Garrison replacement may become more urgent, subject to legal spawn tiles.
- `mobilizationProgress` accumulates each turn.
- When progress reaches the trained-defender threshold, the city-state may create an era-appropriate defender if a legal tile exists.
- Trained defender thresholds should scale by city maturity, era, archetype, difficulty, and strain.

This is a minimal internal meter, not a full production queue. Issue 490 can later replace or enrich it with a hidden city-state economy.

## Conscription

Emergency conscription is allowed only when all conditions pass:

- The minor civ is at high grievance posture or under direct threat.
- The city has population above a minimum.
- `conscriptCooldownUntil` is absent or reached.
- A legal spawn tile exists.
- The city is not already under `strainedUntil` unless the design deliberately allows a harsher emergency override.

Conscription effects:

- Reduce the city population by 1.
- Create a weaker militia-style unit, not a full professional unit.
- Set `conscriptCooldownUntil`.
- Set `strainedUntil`.
- Emit a transition event for visible feedback when the viewer is allowed to know.

The militia can be implemented as a new unit type or as an existing low-tier unit with typed modifier metadata. The implementation plan must choose the path that best fits current unit catalog and renderer coverage. If a new unit type is introduced, it must follow all trainable/unit wiring rules or be explicitly marked as non-trainable emergency-spawn content with matching renderer, description, and tests.

## Coalition War

Coalition war begins only after `coalition-talks` has lasted through its countdown and all eligibility rules still pass.

When war begins:

- Use canonical bilateral minor-civ war helpers such as `setMinorCivWarState`.
- Each member declares war against the target major civ.
- No duplicate war declarations.
- Member city-states fight with their existing and mobilized units.
- No hidden doom stack is granted.
- The coalition record changes from `talks` to `war`.

The fun target is: "My actions woke the region up." It must not feel like the game cheated.

## Recovery

Grievance heals through deeds, money, and time.

Time:

- Pressure decays slowly if there is no new aggression.
- Decay is suppressed or reduced while the aggressor continues conquering or attacking nearby city-states.
- Relationship can heal over a significant amount of time rather than snapping back after a few turns.

Reparations:

- A new action such as `Offer Reparations` can reduce active pressure and improve relationship modestly.
- Reparations calm the crisis but should not erase memory completely.
- Reparations are available only when there is active grievance or cooling-down pressure from the viewing major civ toward that minor civ.
- Reparations must show a clear gold cost, disabled reason when unaffordable or unavailable, and immediate panel refresh after payment.
- Reparations must not be repeat-clickable from stale DOM after a successful payment.

Restorative actions:

- Completing quests helps more than generic money.
- Sponsoring festivals can repair cultural harm.
- Defending city-states from barbarians, pirates, hostile units, or other threats reduces fear.
- Liberating or returning a captured city-state city is the strongest recovery action.

Relationship recovery:

- Relationship score and hidden grievance are related but not identical.
- A city-state can be less angry numerically while still cooling down from a regional crisis.
- Earned durable alliances should break on war as they do today, and recovery after peace should require rebuilding trust through existing quest-chain rules.

## Cooldowns

Use two layers of cooldown:

- Pair cooldown: each minor civ remembers the aggressor and cannot immediately rejoin or reform a coalition against that same civ.
- Regional cooldown: a shared region fingerprint prevents the same nearby cluster from flipping in and out of coalition talks or war repeatedly.

Regional fingerprints should be stable and deterministic, for example based on sorted member IDs and target civ ID. If a member is destroyed or the region changes, stale records are cleaned safely.

## UI And Notifications

The UI should use readable status, cause, and recovery text instead of exact pressure math.

Diplomacy panel:

- Show broad posture for discovered city-states.
- Show cause text when the viewer has enough knowledge.
- Show recovery actions when available.
- Keep all ordinary minor-civ actions reachable; coalition recovery UI must not hide quests, gifts, festivals, war/peace, or existing alliance-chain surfaces.
- Rerender immediately after reparations, festival, quest, peace, return-city, or other pressure-changing actions.

Advisor:

- Use plain, actionable language.
- Avoid shaming the player; frame the situation as a strategic consequence.
- Examples:
  - "The city-states near Geneva are frightened by our conquest. We can calm them by helping, paying reparations, or giving them time."
  - "A regional coalition is forming. More conquest here may bring war."
  - "Our peaceful actions are healing the damage."

Notifications:

- Grievance first recorded against the viewer.
- Posture changes to `mobilizing`.
- Coalition talks begin.
- Coalition war countdown reaches a warning threshold.
- Coalition war begins.
- Recovery action reduces pressure.
- Region enters cooldown.

Notifications must route through hot-seat-safe listeners and should enter the persistent notification log.

## Discovery And Privacy

Unknown city-states must not reveal exact names or hidden details.

Known city-states:

- May show broad posture.
- May show nearby cause text if the cause is discoverable.
- Should not reveal exact hidden pressure values.

Friendly or allied city-states:

- May reveal richer cause and recovery detail.

Hot-seat:

- Messages must route only to the affected viewer.
- Pending hot-seat events must store viewer-safe messages, not raw hidden ledgers or undiscovered city-state identities.

## Save And Load Compatibility

This feature must be safe for both solo and hot-seat saves.

Existing saves:

- Missing `regionalGrievanceByCiv`, `minorCivCoalitions`, and `minorCivRegionalCooldowns` normalize to empty objects.
- Missing conscription, strain, or mobilization fields normalize to inactive values.
- Invalid posture values normalize to `none` or are dropped.

Solo saves:

- Use the same `GameState` fields as hot-seat.
- No solo-only state shape.

Hot-seat saves:

- Use the same durable coalition state.
- Viewer-specific privacy lives in presentation helpers and pending events, not in separate hidden ledgers.
- Pending event records must remain safe if the save is loaded by a different active player.

Round-trip requirements:

- Preserve grievance ledgers.
- Preserve posture.
- Preserve coalition talks countdown.
- Preserve coalition member IDs.
- Preserve pair cooldowns.
- Preserve regional cooldowns.
- Preserve conscription cooldowns.
- Preserve strain timers.
- Preserve mobilization progress.

Cleanup requirements:

- Destroyed minor civs are removed from coalition records.
- Missing city IDs invalidate that member's active grievance posture.
- Eliminated aggressors clear related active grievances and coalition records.
- Malformed member lists are normalized or dropped deterministically.
- Normalization must be idempotent: loading a normalized save and saving it again must not change coalition/grievance state.

## Events

Add typed events for transition-owned feedback. Candidate event names:

```ts
'minor-civ:regional-grievance-recorded': {
  minorCivId: string;
  targetCivId: string;
  cause: MinorCivGrievanceCause;
  state?: GameState;
};
'minor-civ:coalition-posture-changed': {
  minorCivId: string;
  targetCivId: string;
  oldPosture: MinorCivCoalitionPosture;
  newPosture: MinorCivCoalitionPosture;
  state?: GameState;
};
'minor-civ:coalition-talks-started': {
  coalitionId: string;
  memberIds: string[];
  targetCivId: string;
  warEligibleOnTurn: number;
  state?: GameState;
};
'minor-civ:coalition-war-declared': {
  coalitionId: string;
  memberIds: string[];
  targetCivId: string;
  state?: GameState;
};
'minor-civ:coalition-cooling-down': {
  coalitionId: string;
  memberIds: string[];
  targetCivId: string;
  cooldownUntil: number;
  state?: GameState;
};
'minor-civ:reparations-accepted': {
  minorCivId: string;
  majorCivId: string;
  pressureReduced: number;
  state?: GameState;
};
'minor-civ:emergency-conscription': {
  minorCivId: string;
  targetCivId: string;
  unitId: string;
  populationSpent: number;
  state?: GameState;
};
```

The exact names can change, but the event set must distinguish grievance, posture, talks, war, cooldown, recovery, and conscription.

## Error Handling And Invariants

- Never declare coalition war in Era 1.
- Never declare coalition war when pair cooldown or regional cooldown blocks it.
- Never conscript if population is too low.
- Never conscript onto an occupied or invalid tile.
- Never add duplicate `atWarWith` entries.
- Never emit posture-change notifications without an actual posture change.
- Never leak undiscovered city-state names through hot-seat events.
- Never preserve coalition membership for destroyed minor civs.
- Never make an emergency militia equivalent to a fully trained era defender unless the design explicitly changes that rule.

## Testing Strategy

System tests:

- Conquest spillover is local rather than global.
- Human and AI conquest both record regional grievance through the shared helper.
- Distance uses wrapped hex distance on wrapping maps.
- Relationship and alliance status affect grievance severity.
- Viewer-safe cause records preserve source IDs while presentation masks undiscovered names.
- Repeated conquest escalates posture faster than one conquest.
- Era 1 allows warning and mobilization but blocks coalition war.
- Era 2 with grievance but without maturity does not create coalition war.
- Era 2 with maturity but without grievance does not create coalition war.
- Era 2 and later require grievance plus regional maturity for coalition talks and war.
- Explorer, Standard, and Veteran tune thresholds/countdowns/mobilization.
- Time slowly reduces grievance.
- New aggression suppresses or slows recovery.
- Reparations reduce pressure moderately.
- Quests, festivals, defense, liberation, or returning a city reduce pressure more deeply.
- Pair cooldown blocks immediate rejoining against the same aggressor.
- Regional cooldown blocks immediate reformation of the same cluster.
- Coalition war uses canonical war helpers and deduplicates war state.
- Conscription costs population, creates weaker militia, sets cooldown and strain, and respects spawn occupancy.

UI tests:

- Diplomacy panel shows posture labels without exact hidden math.
- Diplomacy panel shows recovery actions only when valid.
- Reparations show cost and disabled reasons when unavailable or unaffordable.
- Panel rerenders after reparations or other pressure-changing actions.
- Repeat-clicking a stale reparations button cannot charge twice.
- Coalition recovery UI does not hide ordinary minor-civ actions.
- Unknown city-states do not reveal names, colors, or hidden causes.
- Friendly or allied city-states can reveal richer detail.
- Advisor line appears for meaningful escalation and gives actionable recovery.

Notification tests:

- Grievance, mobilization, talks, war, cooldown, reparations, and conscription events route to the correct viewer.
- Hot-seat pending events do not leak hidden identities.
- Transition events fire exactly once.

Save tests:

- Legacy solo save without coalition fields normalizes to empty ledgers.
- Legacy hot-seat save without coalition fields normalizes to empty ledgers.
- Solo round trip preserves grievance, posture, coalition, cooldown, strain, and mobilization state.
- Hot-seat round trip preserves durable state while keeping pending events viewer-safe.
- Stale destroyed members and eliminated aggressors are cleaned deterministically.

Balance tests:

- Era 1 city-state rush creates warnings but no coalition war.
- A single conquest in Standard does not immediately create a crushing war.
- Repeated local conquest in Era 2 or later can create coalition talks.
- Veteran escalates faster than Standard.
- Explorer gives more warning and less conscription than Standard.
- Coalition members do not receive free doom stacks.

## Implementation Slices

Suggested implementation order:

1. Add state types, normalization, and pure grievance/posture helpers.
2. Replace global conquest penalty with local grievance recording and relationship changes.
3. Add turn-time pressure decay, posture transitions, and cooldowns.
4. Add minimal mobilization progress and trained-defender creation.
5. Add emergency conscription with population cost, cooldown, strain, occupancy checks, and weaker militia.
6. Add coalition talks and coalition war declaration through canonical war helpers.
7. Add reparations and recovery hooks.
8. Add presentation, diplomacy panel UI, advisor copy, and notifications.
9. Add solo and hot-seat save/load tests and migration normalization.
10. Add balance tests across Era 1, Era 2+, Explorer, Standard, and Veteran.

## Open Implementation Decisions

These are intentionally left as implementation-plan decisions, not design ambiguities:

- Whether emergency militia is a new unit type or an existing unit with typed modifier metadata.
- Exact numeric pressure thresholds.
- Exact distance radius for local grievance.
- Exact cooldown lengths per difficulty.
- Exact UI layout for compact mobile presentation.

The implementation plan must choose concrete values and add negative tests for all gated rules.
