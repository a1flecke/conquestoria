# #1086 — Persistent National Intent / Strategic Posture (Design)

**Status:** design, ready for implementation.
**Base SHA:** `d5870a04ef14ed5be263d61cfb28e920629bc42a` (`origin/main`). #1086 is open,
no comments, no open PR or branch collision (re-checked at design time).

## 0. Source audit summary

Read in full before designing: `src/core/types.ts` (`PersonalityTraits`, `AIPlanReason`,
`OpponentAIState`, `MajorCivPlanPortfolio`, `CivPressureLedger`, `AIStrategicPlan`),
`src/core/opponent-ai-state.ts` (normalization), `src/ai/ai-domination.ts`
(`DominationDoctrine` — transient, not persisted), `src/ai/ai-personality.ts`
(`weightTechChoice`, `weightProductionChoice`, `weightProductionRoles`,
`shouldDeclareWar`), `src/ai/ai-prepared-turn.ts` (`objectiveCandidates`,
`prepareMajorCivStrategicPlan` — the entry point), `src/ai/ai-round-scheduler.ts`
(`writePreparedPortfolios`, `processNonHumanMajorRound`), `src/ai/ai-plan-portfolio.ts`
(`AICityThreat`), `src/systems/civilization-liveness.ts` (`getCivilizationLiveness`).
Confirmed via `rg -i "nationalintent|strategicposture"` across `src/` and `tests/`: **no
existing implementation** — clean slate.

Key facts this design depends on:

- `PersonalityTrait = 'aggressive' | 'diplomatic' | 'expansionist' | 'trader'` — exactly
  the four #1087 requires, already the only traits that exist.
- `DominationDoctrine` (`ai-domination.ts`) is **transient**: its own doc comment states
  "it neither selects a target nor stores a strategic state in the save file." It is
  recomputed every `prepareMajorCivStrategicPlan` call from `DominationKnowledge` +
  `ownCityCount` + `personality` + `challenge`. `pursuit` is gated on
  `personality.traits.includes('aggressive')` — a hardcoded restriction, not itself
  data-driven.
- `OpponentAIState` already has a precedent for "per-major-civ persistent state that is
  not part of `MajorCivPlanPortfolio`": `pressureByCiv: Record<string, CivPressureLedger>`.
  However its normalization loop (`normalizeOpponentAIState`) scopes it to **living
  humans only** (`resolvePressureSeverityForCiv`'s own doc comment: "AI: ALWAYS
  'standard'"). The loop I need to mirror is instead the **`majorCivs` loop**
  (`civ && !civ.isHuman && getCivilizationLiveness(...).living`), since national intent
  is exactly the AI-major-civ population `majorCivs` already scopes to.
- `normalizeOpponentAIState` runs **unconditionally on every load** (`game-state.ts`'s
  own doc comment, and both `save-manager.ts` call sites) and is fully self-normalizing:
  every field is rebuilt from `createEmptyOpponentAIState()` defaults plus validated
  `source.*` reads. `pressureByCiv` and `majorCivs` were both added this exact way —
  **no `SAVE_VERSION` bump**, per `.claude/rules/game-systems.md`'s #1006 "safe additive
  field" path (option 2: optional, every reader tolerates absence, proven by a
  predates-the-field-loads-unchanged test).
- `prepareMajorCivStrategicPlan` (`ai-prepared-turn.ts:733`) is the single entry point:
  builds perception, `DominationKnowledge`, personality, `DominationDoctrine`, then calls
  `objectiveCandidates(state, civId, perception, knownMap, doctrine, knowledge,
  personality, trainableTypes)`. This is the exact seam where a `NationalIntentState`
  read/evaluate/write cycle belongs.
- `PreparedMajorCivPlan` (return type of `prepareMajorCivStrategicPlan`) does **not**
  currently carry anything beyond `portfolio`/`assignments`/`forceDemands`/`traces`.
  `ai-round-scheduler.ts`'s `writePreparedPortfolios` is the single place a prepared
  civ's portfolio is written back into `state.opponentAI.majorCivs[civId]` — the same
  function is where `nationalIntentByCiv[civId]` must be written back, in the same pass.
- `getCivilizationLiveness` returns `{ living: true, reason: 'settler' }` for a
  cityless-but-not-eliminated civ — the exact "recovery from citylessness" signal #1086
  asks for, already computed, no new state needed.
- `AICityThreat` (already computed by `cityThreats()` inside `prepareMajorCivStrategicPlan`)
  carries `isLastCity: boolean` and `captureRisk: number` per threatened city — the
  "severe military threat" shock signal, also already computed, no new state needed.
- `AIDecisionTrace.decision: 'objective' | 'tactical' | 'production' | 'research'` — a
  natural `'intent'` member to add for traceability.

## 1. Chosen intent set

Five, not all nine of the issue's illustrative names:

**`expand` | `develop` | `dominate` | `deter` | `recover`**

Each maps to mechanics that exist today:

| Intent | Grounds in existing code |
|---|---|
| `expand` | `objectiveCandidates`'s `expand` branch, `getExpansionCitySoftCap`, `weightProductionRoles`'s `settlement` term |
| `develop` | The peacetime default — no active military/expansion urgency; boosts `economy`/`trade`/`worker` roles already scored by `weightProductionRoles`/`weightTechChoice` |
| `dominate` | Wraps `DominationDoctrine` (see §4) — `doctrine.pursuit`, `captureValueBonus`, the `capture` objective branch |
| `deter` | Existing `defend`/`repel` objectives (`ai-plan-portfolio.ts`'s `cityThreats`-driven defense plans), reduced offensive candidate admission |
| `recover` | `getCivilizationLiveness`'s `'settler'` reason, `AICityThreat.isLastCity`/`captureRisk`, the existing `recover` `AIStrategicObjective` value |

`trade` and `influence` were investigated and **rejected for this MR**: the marketplace
system (`marketplace.tradeRoutes`) and minor-civ leagues have no per-major-civ
strategic-candidate representation `objectiveCandidates` can bias today (trade routes are
economic-yield mechanics, not a candidate class), and diplomacy's `AllianceOffer`/treaty
machinery has no "trade corridor" or "influence campaign" concept to bias toward. Adding
either would mean inventing new downstream mechanics inside this MR, which
`.claude/rules/game-balance.md`'s and this repo's own recurring "no per-city/per-route
scaling unless implemented" and "do not invent mechanics solely to give something to do"
guardrails both reject. `consolidate`/`survive` were folded into `develop`/`recover`
respectively — a sixth and seventh label with no behaviorally distinct downstream effect
would violate "no intent is merely a label."

**`recover` is shock-only** — it is never chosen by ordinary ambition scoring (§3); it is
only ever entered via the shock override (§5) and exited back into ordinary scoring once
stabilized. This matches the issue's own framing ("Recovery/survival conditions should be
able to **override** peacetime ambitions") — recover is not a civ's chosen identity, it is
an emergency state imposed on it.

## 2. Data model and ownership

New file `src/ai/ai-national-intent.ts` (mirrors `ai-domination.ts`'s pure-function
style, but — unlike `DominationDoctrine` — this state **is** persisted).

```ts
// src/core/types.ts additions
export type NationalIntent = 'expand' | 'develop' | 'dominate' | 'deter' | 'recover';

export type NationalIntentReason =
  | 'intent-initial-selection'
  | 'intent-shock-recover'
  | 'intent-shock-resolved'
  | 'intent-sustained-evidence'
  | 'intent-hysteresis-retained'
  | 'intent-personality-bias'
  | 'intent-domination-pursuit';

export interface NationalIntentState {
  current: NationalIntent;
  previous: NationalIntent | null;
  selectedTurn: number;
  reconsiderAfterTurn: number;
  shockActive: boolean;
  reasonCodes: NationalIntentReason[];
}
```

`OpponentAIState` gains one sibling field, at the same level as `majorCivs` (explicitly
**not** nested inside `MajorCivPlanPortfolio` — the issue's target architecture draws
Intent strictly *above* the portfolio, and a sibling top-level map is the only shape that
keeps that ordering honest rather than implying intent is portfolio metadata):

```ts
export interface OpponentAIState {
  // ...unchanged...
  nationalIntentByCiv: Record<string, NationalIntentState>;
}
```

**Ownership contract:** exactly one writer (`prepareMajorCivStrategicPlan` computes the
next `NationalIntentState`; `ai-round-scheduler.ts`'s write-back path commits it,
identically to how `portfolio` is committed today), exactly one normalizer
(`normalizeOpponentAIState`'s new loop, mirroring the existing `majorCivs` loop's
`civ && !civ.isHuman && getCivilizationLiveness(...).living` filter — the same population,
so the two loops can share the same `stableActorIds`-shaped iteration), plain
JSON-serializable data, no class instances, no `Date.now()`.

**No `SAVE_VERSION` bump.** `nationalIntentByCiv` is optional/additive exactly like
`pressureByCiv` was: `createEmptyOpponentAIState()` defaults it to `{}`; every reader
already goes through the normalizer or explicitly falls back
(`previous ?? initialIntentState(...)`); a pre-#1086 save loads, gets `{}`, and the very
first AI round populates every living AI major's entry identically to how `majorCivs`
itself already works. Proven by a regression: load a fixture predating this field, run one
round, assert the resulting simulation state is unaffected except for the newly-populated
`nationalIntentByCiv` map (mirrors `tests/storage/new-game-completeness.test.ts`'s
ratchet pattern).

## 3. Selection / hysteresis contract

```ts
export const NATIONAL_INTENT_MIN_HOLD_TURNS = 15;
export const NATIONAL_INTENT_SWITCH_MARGIN = 12; // score points, same units as strategicValue (0-100 scale)
export const NATIONAL_INTENT_RECOVERY_STABLE_TURNS = 4; // consecutive shock-free rounds before exiting recover
```

`resolveNationalIntent(input: NationalIntentInput): NationalIntentState`, called once per
civ per round from `prepareMajorCivStrategicPlan`, taking **only** narrowed,
perception-safe inputs (mirrors `DominationDoctrineInput`'s own narrowing — no raw
`GameState`, no hidden enemy facts):

```ts
export interface NationalIntentInput {
  turn: number;
  previous: NationalIntentState | null;
  perception: MajorCivPerception;
  personality: PersonalityTraits;
  doctrine: DominationDoctrine;   // already perception-safe, computed upstream
  cityThreats: readonly AICityThreat[]; // already perception-safe, computed upstream
  challenge: OpponentChallenge;
}
```

Algorithm:

1. **Shock check** (§5). If shocked and `previous?.current !== 'recover'`: transition to
   `recover` immediately — hysteresis and switch-margin are bypassed for a shock entry
   (an existential threat cannot wait 15 turns for reconsideration). New state:
   `current: 'recover', previous: previous?.current ?? null, selectedTurn: turn,
   reconsiderAfterTurn: turn + NATIONAL_INTENT_MIN_HOLD_TURNS, shockActive: true,
   reasonCodes: ['intent-shock-recover']`.
2. **Shock continuing**. If shocked and already `recover`: retain unchanged except
   `shockActive` stays `true` (no new `selectedTurn`, so `reconsiderAfterTurn` does not
   keep sliding forward — a still-dangerous civ is not artificially "freshly decided"
   every round).
3. **Shock resolving**. If not shocked and `previous.current === 'recover'`: track
   stabilization via a **shock-free streak**, not raw elapsed turns since entering
   recover (a civ that briefly looks safe for one round and is threatened again the next
   must not exit early). This needs one small additional field to count the streak
   without inventing a second timer concept — see the amendment in §3.1.
4. **Ordinary hysteresis**. If not shocked, `previous` exists, `previous.current !==
   'recover'`, and `turn < previous.reconsiderAfterTurn`: retain `previous` verbatim
   except `reasonCodes: ['intent-hysteresis-retained']` — small score fluctuations within
   the hold window never switch intent, regardless of what ordinary scoring would now
   prefer.
5. **Reselection**. Otherwise (no previous, or past `reconsiderAfterTurn`, or just exited
   recover): score `expand`/`develop`/`dominate`/`deter` (never `recover` — shock-only,
   §1) via `scoreIntent` (§4), pick the best; if `previous` exists and is one of these
   four, require `score(best) > score(previous) + NATIONAL_INTENT_SWITCH_MARGIN` to
   switch (mirrors `ai-plan-portfolio.ts`'s own `switchingMargin` pattern for plan
   retention) — otherwise retain `previous` with `reasonCodes: ['intent-hysteresis-retained']`.
   A genuine switch sets `selectedTurn: turn`, `reconsiderAfterTurn: turn +
   NATIONAL_INTENT_MIN_HOLD_TURNS`, `reasonCodes` per §4's contributing reasons.

### 3.1 Amendment — shock-free streak needs its own counter, not overloading `selectedTurn`

Investigated storing the streak as `turn - selectedTurn` while `shockActive` transitions
to `false` mid-hold, but that conflates "how long has this civ been in `recover`" (needed
for §3 step 2's "don't keep sliding the reconsideration window while still shocked") with
"how many consecutive rounds has it been shock-free" (needed for step 3's stabilization
check) — two different clocks that reset independently. Adding a second field is the
smaller, more honest fix than making one field serve two purposes:

```ts
export interface NationalIntentState {
  // ...as above...
  shockFreeStreak: number; // consecutive non-shocked rounds while current === 'recover'; irrelevant otherwise, always 0
}
```

Step 3 becomes: increment `shockFreeStreak` each not-shocked round while `current ===
'recover'`; once `shockFreeStreak >= NATIONAL_INTENT_RECOVERY_STABLE_TURNS`, exit through
step 5's ordinary reselection (never straight back to whatever `previous` was before the
shock — the world may have changed during the emergency, so recovery re-scores from
scratch, tagged `intent-shock-resolved` in addition to whatever step 5 naturally adds).

## 4. Scoring `expand` / `develop` / `dominate` / `deter`

One function, `scoreIntents(input): Record<'expand'|'develop'|'dominate'|'deter', number>`,
each score on the same 0-100 scale `objectiveCandidates.strategicValue` already uses (so
`NATIONAL_INTENT_SWITCH_MARGIN` is comparable to that existing convention, not a new
unitless number invented for this one function):

- **`expand`**: `min(100, 40 + (softCap - ownCities.length) * 12 + expansionDrive * 30)`
  where `softCap = getExpansionCitySoftCap(personality.expansionDrive)` (already exported
  from `ai-prepared-turn.ts`/wherever it lives) — reuses the exact same soft-cap concept
  `objectiveCandidates`'s own `expand` branch already gates on, so intent and candidate
  generation can never disagree about "is there room to grow." Zero when already at/above
  cap.
- **`develop`**: flat baseline `45`, `+15` if `personality.traits.includes('trader')`,
  `-10` per active war (`majorCivWarOpponentIds(actor.diplomacy.atWarWith).length`, per
  `.claude/rules/game-systems.md`'s #1041 rule — never raw `atWarWith.length`). This is
  deliberately the "nothing more pressing" default — every other intent needs a reason to
  outscore it.
- **`dominate`**: `doctrine.pursuit ? 55 + doctrine.captureValueBonus : 15`. Directly
  consumes the existing `DominationDoctrine` output rather than re-deriving pursuit
  logic — see §6 for why this is integration, not duplication.
- **`deter`**: `30 + cityThreats.filter(t => t.captureRisk > 0 && !t.isLastCity).length *
  18 + (personality.traits.includes('diplomatic') ? 15 : 0)`. Scoped to *non-existential*
  threats deliberately — an existential one is shock (`recover`), not `deter`.

Personality contributes a **bias**, never a script: every term above is additive/small
relative to the perception-driven terms (city count, threat count, doctrine pursuit), so
world state always has the deciding vote for a civ with no personality lean at all, and a
personality-favored intent still loses to a strongly-evidenced rival (verified directly —
§9 fixture 5).

`reasonCodes` on a genuine reselection: `'intent-sustained-evidence'` always;
`'intent-personality-bias'` added when the personality term was the deciding factor
(winning margin over the runner-up would flip if the personality term were removed —
computed directly, not guessed); `'intent-domination-pursuit'` added when `dominate` wins
and `doctrine.pursuit` was true.

## 5. Shock detection

```ts
function isShocked(perception: MajorCivPerception, cityThreats: readonly AICityThreat[]): boolean {
  return perception.ownCities.length === 0
    || cityThreats.some(threat => threat.isLastCity && threat.captureRisk >= SHOCK_CAPTURE_RISK_THRESHOLD);
}
export const SHOCK_CAPTURE_RISK_THRESHOLD = 0.5;
```

Both signals are already computed upstream of `resolveNationalIntent`'s call site inside
`prepareMajorCivStrategicPlan` (`perception.ownCities`, `cityThreats(...)`) — no new
perception surface, no new hidden-information read. `perception.ownCities.length === 0`
paired with `getCivilizationLiveness`'s `'settler'` reason is exactly "citylessness the
civ is still alive to recover from"; a `'no-survival-assets'`/`'eliminated'` civ is
already filtered out of `stableActorIds` upstream (dead civs never reach
`prepareMajorCivStrategicPlan` at all) so no separate elimination check is needed here.

## 6. Domination doctrine integration — one authority, not two

**`evaluateDominationDoctrine` is unchanged** — it remains the sole source of "is
domination pursuit currently justified" (earned knowledge, own city count, personality,
challenge). §4's `dominate` score is a **read** of `doctrine.pursuit`/
`doctrine.captureValueBonus`, never a second computation of the same fact. The single
strategic authority is: `DominationDoctrine` decides *whether pursuit is currently
justified*; `NationalIntentState` decides *whether the civ is currently prioritizing that
ambition over its other options this turn*. A civ can have `doctrine.pursuit === true`
(it has earned the knowledge and is aggressive) while `current !== 'dominate'` (a
severe local threat currently outscores it as `deter`, or a bigger expansion window
currently outscores it as `expand`) — that is the intended, non-duplicated relationship:
doctrine supplies eligibility and a bonus; intent supplies the turn-to-turn priority
arbitration doctrine itself explicitly does not attempt (it has no hysteresis, no
competing-priority concept — see its own doc comment, "transient planning input").

`objectiveCandidates`'s existing `doctrine.captureValueBonus`/`doctrine.reasonCodes` uses
(the `capture` candidate branch, §7) are **untouched** — intent adds an *additional*,
separately-reasoned bonus alongside them, never replacing or double-applying doctrine's
own contribution. No candidate's `strategicValue` can receive `doctrine.captureValueBonus`
twice.

## 7. Downstream effects — candidate admission, production, research

**Design constraint from the arc prompt:** "Prefer a typed strategic posture/doctrine
object produced from intent, then consumed at narrow strategic seams... Avoid scattering
`if (intent === 'x') +20` through ten files." One small typed table, few consumers:

```ts
export interface NationalIntentPosture {
  expandBias: number;    // added to an 'expand' candidate's strategicValue
  captureBias: number;   // added to a 'capture' candidate's strategicValue
  resourceBias: number;  // added to a 'secure-resource' candidate's strategicValue
  settlementRoleWeight: number;  // multiplier alongside weightProductionRoles' existing settlement term
  economyRoleWeight: number;     // multiplier alongside weightProductionRoles' existing trade/worker terms
  combatRoleWeight: number;      // multiplier alongside weightProductionRoles' existing combat term
}

export const NATIONAL_INTENT_POSTURE: Record<NationalIntent, NationalIntentPosture> = {
  expand:   { expandBias: 20, captureBias: 0,  resourceBias: 8,  settlementRoleWeight: 1.4, economyRoleWeight: 1.1, combatRoleWeight: 0.9 },
  develop:  { expandBias: 0,  captureBias: 0,  resourceBias: 5,  settlementRoleWeight: 1.0, economyRoleWeight: 1.3, combatRoleWeight: 0.85 },
  dominate: { expandBias: 0,  captureBias: 18, resourceBias: 0,  settlementRoleWeight: 0.9, economyRoleWeight: 0.9, combatRoleWeight: 1.3 },
  deter:    { expandBias: -5, captureBias: -8, resourceBias: 0,  settlementRoleWeight: 0.8, economyRoleWeight: 1.0, combatRoleWeight: 1.25 },
  recover:  { expandBias: -20, captureBias: -20, resourceBias: -10, settlementRoleWeight: 0.5, economyRoleWeight: 1.1, combatRoleWeight: 1.1 },
};
```

Consumers (exactly two functions touched, both already receiving `personality`):

1. **`objectiveCandidates`** (`ai-prepared-turn.ts`) — gains one new parameter,
   `posture: NationalIntentPosture`. The `capture` candidate's `strategicValue` gains
   `+ posture.captureBias` (additive alongside the existing `doctrine.captureValueBonus`
   term, §6 — never the same number). The `secure-resource` candidate's `strategicValue`
   gains `+ posture.resourceBias`. The `expand` candidate's `strategicValue` computation
   (`site.score * (0.5 + personality.expansionDrive)`) gains `+ posture.expandBias`,
   applied identically for `bestRankedExpand`/`stillCommitted` so the existing switching-
   margin hysteresis logic is unaffected by *which* candidate carries the bonus. `recover`
   posture's deliberately negative biases mean a shocked civ's own candidate generation
   naturally deprioritizes new conquest/expansion without a separate "is intent recover"
   branch anywhere else in that function — the same typed table does the work.
2. **`weightProductionRoles`** (`ai-personality.ts`) — gains one new parameter, `posture:
   NationalIntentPosture`. The existing `settlement`/`transport`+`recon` term multiplies
   by `posture.settlementRoleWeight`; the existing combat-role term multiplies by
   `posture.combatRoleWeight`; the existing `trade`/`espionage`/`missionary` terms
   multiply by `posture.economyRoleWeight`. Every existing personality-only term is
   preserved exactly (multiplying by `1.0` reproduces current behavior for any call site
   that has not yet threaded a posture through, though in practice both real callers of
   `weightProductionRoles` are updated in the same change since it is a two-argument
   function signature change, not an optional parameter).

**Research** (`weightTechChoice`) and **diplomacy** (`shouldDeclareWar`,
`ai-diplomacy.ts`) are explicitly deferred, not silently dropped — see §12. The issue's
"should influence... production demands, diplomacy, research priorities" is a principle
naming every plausible seam, not a checklist requiring all of them in one MR; the arc
prompt itself states "Not every intent must touch every consumer... an intent with zero
downstream behavioral effect is invalid" — the two seams above already give every one of
the five intents (including the shock-only `recover`) a real, independently-testable
behavioral difference from every other intent, satisfying that bar without touching
research/diplomacy surfaces #1087 is explicitly scoped to deepen next.

## 8. Traceability

New `AIDecisionTrace.decision` member: `'intent'`. Emitted once per civ per round from
`prepareMajorCivStrategicPlan`, alongside (not replacing) the existing `'objective'`
trace:

```ts
{
  actorId: civId,
  turn: state.turn,
  decision: 'intent',
  selectedId: nextIntent.current,
  candidates: [
    // one entry per scored ambition intent (expand/develop/dominate/deter), each with
    // its computed score and reasonCodes -- 'recover' appears only when shock-selected,
    // scored implicitly at "whatever forces the override" rather than a numeric score,
    // matching the existing convention that a mandatory/forced choice doesn't need a
    // comparative score (mirrors how mandatory tactical actions already skip scoring
    // in ai-tactics.ts's sortRanked).
  ],
}
```

This directly satisfies "record intent selection/transition and reason codes" without a
new trace concept — `AIDecisionTrace` already exists exactly for this.

## 9. Hidden-information invariance

`NationalIntentInput` (§3) accepts only: `turn` (public), `previous` (own persisted
state), `perception` (already fog-bounded — the same `MajorCivPerception` every other
strategic function consumes), `personality` (own, from `civ-definitions.ts`), `doctrine`
(already perception-safe per `ai-domination.ts`'s own contract), `cityThreats` (derived
from `perception`, already perception-safe), `challenge` (game-wide, not hidden). No
parameter carries another civ's hidden unit roster, hidden production, or hidden exact
resources. Test: build two states identical from the actor's own perspective (same
`perception`, same `cityThreats`, same `doctrine`) but differing in unseen enemy
production/exact troop composition the actor has no visibility into — `resolveNationalIntent`
must return byte-identical results, proven with `assertSimulationEquivalent`-style deep
comparison of the two `NationalIntentState` outputs.

## 10. Difficulty

`challenge` is threaded into `NationalIntentInput` **only** because `doctrine` already
depends on it upstream (`DominationDoctrineInput.challenge`) — `resolveNationalIntent`
itself reads it nowhere in §3/§4/§5. No explorer/veteran branch exists in the hysteresis,
scoring, or shock logic. This is a deliberate, evidence-driven choice: nothing in this
design needs a difficulty-scaled hold window or switch margin, and inventing one without a
demonstrated gap would be exactly the "Explorer chooses stupid intent, Veteran chooses
objectively correct intent" anti-pattern the arc prompt explicitly warns against.
Difficulty continues to own tactical mistake behavior (`OpponentChallenge`, unchanged);
this feature sits entirely above that layer and is difficulty-invariant by construction.

## 11. Performance

`resolveNationalIntent` does O(1) work given its already-computed inputs (`cityThreats`
is already a bounded array from `cityThreats()`, `perception.ownCities.length` is O(1)).
No new map scan, no new pathfinding, no new BFS. `objectiveCandidates`'s two new posture
lookups (`NATIONAL_INTENT_POSTURE[intent]`) are O(1) table reads inside an already-O(known
cities + known resources + expansion sites) function — no change to its asymptotic shape.
`tests/perf/algorithmic-budgets.test.ts` will be run unchanged and is not expected to move;
confirmed, not assumed, in the implementation plan's verification step.

## 12. Explicit non-goals

- No generic GOAP/HTN planner.
- No omniscient victory-state knowledge — `dominate` reads only the existing
  perception-safe `DominationDoctrine`/`DominationKnowledge`.
- No forced domination pursuit for non-aggressive civs — `doctrine.pursuit`'s existing
  `aggressive`-trait gate is untouched; a non-aggressive civ's `dominate` score stays at
  its low `15` floor regardless of intent architecture.
- No replacement of the objective/portfolio/tactical architecture — `resolveNationalIntent`
  produces a bias table consumed by two existing functions; it does not create plans,
  assign units, or execute tactics.
- **Diplomacy integration deferred to #1087** (see §7) — #1087 is explicitly scoped to
  deepen personality's (and by extension intent's) influence on diplomatic behavior;
  duplicating that work here risks the exact "two independent layers" anti-pattern §6
  avoids for Domination.
- **Research (`weightTechChoice`) integration deferred** — same reasoning as diplomacy;
  a future narrow follow-up can thread `NationalIntentPosture` through
  `TRACK_WEIGHTS`-style weighting using the identical typed-table pattern this MR
  establishes, once evidence from #1087's own personality work shows it is needed rather
  than speculative.
- No new player-facing UI (`#1090`'s scope).
- No new `#1089`/minor-civ-archetype behavior.
- No `#1133` tooling change.

## Mandatory inline review

**perform an INLINE review across these dimensions about balancing gameplay, fun, new
mechanics, different player ages (7-43), different play styles, the built in difficulty
modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx,
updating saved games, proper testing, regressions solo play, and hot seat plays, and
proper implementation.**

- **Balance/gameplay/fun:** posture biases are small relative to existing
  `strategicValue`/role-weight magnitudes (max `±20` against a 0-100 `strategicValue`
  scale that already ranges 45-100; role-weight multipliers stay within `0.5×`-`1.4×`,
  never zeroing or infinitely inflating a role) — this nudges priority, it cannot make an
  intent categorically forbid or guarantee an outcome. No yield, cost, or movement-bonus
  table is touched, so no `.claude/rules/game-balance.md` ceiling is implicated. `recover`'s
  negative biases make a shocked civ *less* likely to open new fronts, which is the
  intended "an AI in crisis stops being ambitious" legibility improvement, not a nerf to
  any specific yield.
- **New mechanics:** one new persisted state shape, one new evaluator function, one new
  typed bias table — no new player-facing mechanic, no new unit/building/tech.
- **Ages 7-43 / play styles:** purely an AI-internal reasoning layer; a player experiences
  it only as "the AI's behavior over dozens of turns feels more like it's pursuing a
  strategy" — no new UI, no new decision surface for the player.
- **Difficulty modes:** covered in §10 — fully difficulty-invariant.
- **AI usage:** this *is* the AI change; covered throughout.
- **UI/UX:** no player-facing surface changes. Internal `AIDecisionTrace` gains one new
  `decision: 'intent'` kind — additive to an existing diagnostic type, not a new schema.
- **Architecture:** new file `ai-national-intent.ts` sits cleanly between
  `ai-domination.ts` (reads) and `ai-prepared-turn.ts` (writes/consumes) — no new
  cross-module dependency cycle; `NationalIntentPosture` is consumed at exactly two
  existing functions, both already `personality`-parameterized.
- **Extensibility:** `NATIONAL_INTENT_POSTURE` is a flat typed table — adding a sixth
  intent later (should real evidence justify `trade`/`influence`) means one new table row
  plus one new `scoreIntents` branch, not touching every consumer's own logic.
- **Data:** no content/catalog change.
- **SFX:** none.
- **Updating saved games:** covered in §2 — no migration, additive/self-normalizing,
  proven by a predates-the-field regression.
- **Proper testing:** covered in the implementation plan — hysteresis boundary tests,
  shock entry/continuation/exit tests, personality-bias-without-override tests, Domination
  non-duplication test, hidden-information invariance test, save/reload test, long-horizon
  observability addition.
- **Regressions solo/hot seat:** `resolveNationalIntent` runs per-AI-civ inside the
  existing `prepareMajorCivStrategicPlan`/`processNonHumanMajorRound` path, identically
  regardless of `hotSeat` seat configuration — no `currentPlayer`/seat-scoped branch
  exists or is added. A human-controlled civ never gets a `nationalIntentByCiv` entry
  (mirrors `majorCivs`' own AI-only scope) so there is no possibility of a human seat
  reading another seat's AI intent as if it were their own hidden state — it is simply
  absent for human civs, the same way `majorCivs` is.
- **Proper implementation:** no dead return fields (`NationalIntentState`'s every field is
  read by the normalizer, the evaluator, or a downstream consumer), no direct state
  mutation (the evaluator is pure; the write-back follows `writePreparedPortfolios`'s
  existing spread-copy pattern), no `Math.random()`, no new hand-rolled RNG (this feature
  needs no randomness at all — every transition is a deterministic function of perception-
  safe inputs).

No real finding surfaced by this review is left unaddressed; none required a design
change beyond §3.1's amendment (found during the review itself, while checking the shock
hold-window question against "can it ever get stuck permanently" — folded in above rather
than listed as a separate late fix).
