# #545 MR5 — AI Deterrence Visibility & Launch Doctrine: Implementation Design

This is an MR-scoped implementation design, not a new feature spec. It translates the
arc-level design (`2026-08-25-issue-545-strategic-deterrence-design.md` §9 and §10,
quoted and re-verified against the live file below) into concrete module/function/data
shapes for MR5, plus two implementation decisions and one open-question resolution that
weren't nailed down at the arc-design level. Written after re-verifying every file/
function claim in `/tmp/next-545.md` (the MR4→MR5 hand-off) against the current code —
all claims checked out.

## Status inputs

- MR1–4 merged (#895, #897, #898, #899). Current worktree `HEAD` == `origin/main` tip
  (`0e27f2c3`), confirmed via `git merge-base HEAD origin/main`. No rebase needed before
  this MR's branch starts.
- `CURRENT_SAVE_SCHEMA_VERSION` is 20. MR5 adds no new persisted fields (confirmed below
  — everything new is derived/computed, nothing stored), so no migration is expected.

## Locked decisions for MR5

1. **AI-vs-AI strike audibility**: visibility-gated. The human hears `SFX.strategicStrike()`
   and gets a notification for an AI-vs-AI strike only when they've met *both* the
   striking and struck civ (`hasMetCivilization` both directions). The struck city itself
   needs no separate visibility check — cities are never hidden once their owner is met.
2. **MR5 scope**: single combined MR covering both §9 (visibility + conventional caution)
   and §10 (launch doctrine) — not split into 5a/5b.

## §9 — Deterrence information & AI conventional caution (verbatim from arc spec, re-verified)

> **Visibility rule** (applies uniformly to AI scoring and player-facing UI — one source
> of truth): any civ with `hasMetCivilization(state, viewerId, ownerId)` can see a
> boolean "has nuclear capability" (= Manhattan Project completed) and can see any
> platform it has *independently* discovered through existing means (a spotted Silo
> city — cities are never hidden once a civ is met; a detected Missile Submarine via
> #542's concealment rules). `strategicArsenal`'s exact count is **never** exposed to any
> other civ, at any difficulty, anywhere (not diplomacy panel, not AI perception, not
> intel reports).
>
> **AI conventional-behavior effect:** a new bounded `strategicDeterrenceCaution` scoring
> factor is applied wherever the AI currently scores "declare war on"/"invade further
> into" a civ, keyed *only* off the same boolean visibility above (known capability, not
> count). Implemented as new `OPPONENT_CHALLENGE_PROFILES` knobs (existence of the
> caution effect is uniform across difficulties; its magnitude scales explorer <
> standard < veteran, following the established eagerness-knob convention exactly).
> **Player-readable**: the diplomacy panel surfaces a relationship-modifier note (e.g.
> "wary of your strategic capability") whenever this factor is actively suppressing that
> AI's aggression toward the human player — no invisible number.
>
> **Own-empire visibility gap**: already fixed by MR4's Strategic Arsenal panel. No MR5
> work needed here.

**Re-verified against live code**: the only aggression-scoring function in the codebase
is `shouldDeclareWar` (`src/ai/ai-personality.ts:93`) — there is no separate "invade
further into" scorer. `canDeclareWarForPreparedPlan` (`src/ai/basic-ai.ts:528`) is a
target-legality gate, not a scoring function, and is out of scope for this factor. The
arc spec's "declare war on"/"invade further into" phrasing describes intent broader than
what the codebase actually implements today; `shouldDeclareWar` is the single real
integration point.

## §10 — AI launch doctrine (verbatim from arc spec, re-verified)

> - **Explorer**: never authorizes first use. Only ever considers retaliation, and even
>   that is heavily suppressed.
> - **Standard**: never initiates. Authorizes retaliation once struck.
> - **Veteran**: may initiate **only** under an explicit, computable existential-threat
>   gate: its own capital city HP below a fixed threshold (illustrative: 20) **and** a
>   hostile land unit adjacent to the capital **and** no friendly relief force within N
>   hexes (illustrative: 3) capable of contesting it. All three conditions required.
> - **Retaliation is never automatic/scripted.** A struck civ's AI re-scores a launch
>   exactly like any other turn's decision, using the same doctrine — being struck
>   raises the `strategicLaunchWillingness` knob substantially for that turn's
>   evaluation.
> - Legality, blast effects, reputation consequences, and information boundaries are
>   byte-identical across all three difficulties — only willingness/threshold knobs
>   differ.
> - AI target evaluation is bounded: only civs currently `atWarWith`, only their
>   already-discovered cities — no unbounded all-map scan.
> - **Module boundary**: lives in a new leaf module, `ai-strategic-doctrine.ts`,
>   consumed by the existing AI turn/war-decision pipeline — not bolted directly into
>   `basic-ai.ts`/`ai-diplomacy.ts`.
> - **Production scoring is already done** (`strategicArsenalValueScore` in
>   `ai-production.ts`) — MR5's knobs govern launch decisions only.

**Re-verified against live code**: `strategicStrikesReceivedFrom` (optional `string[]`
on `DiplomacyState`), `isStrategicStrikeRetaliation`, `getLegalStrategicLaunchTargets`,
`executeStrategicLaunch` all exist exactly as MR4 built them
(`src/systems/strategic-launch-system.ts`, `src/systems/strategic-launch-execution-system.ts`).
`hasManhattanProject` exists in `src/systems/strategic-arsenal-system.ts`.
`getCapitalCity(state, civId)` exists in `src/systems/capital-system.ts` and is the right
helper for the existential-threat gate's capital-HP check. No "friendly relief force
near capital" helper exists anywhere in the codebase — MR5 must write a small new local
helper for that one condition; nothing to reuse.

## Architecture

### 1. Visibility function (shared by AI scoring and UI)

New export in `src/systems/strategic-arsenal-system.ts`, next to `hasManhattanProject`:

```ts
export function hasKnownStrategicCapability(
  state: GameState,
  viewerCivId: string,
  ownerCivId: string,
): boolean {
  return hasMetCivilization(state, viewerCivId, ownerCivId)
    && hasManhattanProject(state, ownerCivId);
}
```

One source of truth, imported by both `ai-strategic-doctrine.ts` (AI scoring) and
`diplomacy-panel.ts` (player-facing note). No platform-level (Silo/submarine) visibility
function is needed for MR5 — that's already correctly handled by existing city
visibility and #542's submarine concealment; the arc spec's mention of it in §9 is
describing existing behavior, not a new gate to build.

### 2. `OpponentChallengeProfile` gains two knobs

In `src/core/opponent-challenge.ts`:

- `strategicDeterrenceCautionWeight: number` — scales the war-score threshold penalty
  applied when a potential war target has known strategic capability. Explorer smallest,
  veteran largest (uniform-existence, scaled-magnitude, per the established convention —
  same shape as `submarineEscortWeight`/`heroicCommandEagernessWeight`).
- `strategicLaunchRetaliationWillingness: number` (0..1) — probability-of-launching-this-
  turn once retaliation-eligible (`isStrategicStrikeRetaliation` true for some legal
  target). Explorer lowest ("heavily suppressed"), standard moderate, veteran highest
  ("maximally willing"). Kept in the same profile table as every other knob rather than a
  separate table in the new leaf module, for consistency — even though only civs with
  arsenal capacity ever consult it, matching how e.g. `submarineEscortWeight` is also
  meaningless for a civ with no submarines yet.

First-use willingness is **not** a probability knob — Explorer/Standard never author-
ize first use (hard `false`), and Veteran's first use is gated by the deterministic
three-condition existential-threat check, not a roll. Only *retaliation* is
probability-scaled.

### 3. `shouldDeclareWar` signature extension

`src/ai/ai-personality.ts`:

```ts
export function shouldDeclareWar(
  personality: PersonalityTraits,
  relationship: number,
  militaryAdvantage: number,
  currentTurn: number,
  hasMetTarget: boolean,
  hasBorderPressure: boolean,
  targetHasKnownStrategicCapability: boolean,
  strategicDeterrenceCautionWeight: number,
): boolean
```

The existing `warScore > (0.8 + peacePressure)` comparison gains a caution term:
`warScore > (0.8 + peacePressure + (targetHasKnownStrategicCapability ? strategicDeterrenceCautionWeight : 0))`.
Exact weight values are a plan-writing-time tuning decision (small enough that a
determined/high-advantage AI can still eventually declare war — this is caution, not a
hard block — matching the spec's "no invisible arbitrary AI fear bonus" framing: it's a
documented, player-visible modifier, not a wall).

### 4. Threading the new inputs down to `shouldDeclareWar`

- `DiplomaticContext` (`src/ai/ai-diplomacy.ts`) gains
  `targetHasKnownStrategicCapability: boolean`.
- `evaluateDiplomacy` gains a `strategicDeterrenceCautionWeight: number` param, passed
  straight through to `shouldDeclareWar`.
- `src/ai/basic-ai.ts`'s existing per-civ `diplomacyContext` construction loop (where
  `hasBorderPressure` is computed today, around the `perception.knownCivIds` loop) adds
  the new boolean via `hasKnownStrategicCapability(newState, civId, otherId)`. The
  profile lookup that already resolves other knobs for this civ's challenge supplies
  `strategicDeterrenceCautionWeight` to the `evaluateDiplomacy` call.

### 5. Diplomacy panel note

`src/ui/diplomacy-panel.ts`: for each foreign civ row, when
`hasKnownStrategicCapability(state, state.currentPlayer, otherId)` is true and that civ
is not currently at war with the human, render a small `textContent`-only note (e.g.
"wary of your strategic capability") — same XSS-safe injection pattern already used
throughout that file (`el.textContent = text`). This is the required "no invisible
number" surfacing for the caution factor.

### 6. New leaf module: `src/ai/ai-strategic-doctrine.ts`

```ts
export function canAuthorizeVeteranFirstUse(state: GameState, civId: string): string | null
export function evaluateStrategicLaunchDecision(
  state: GameState,
  civId: string,
  challenge: OpponentChallenge,
  rng: () => number,
): string | null  // returns a target city id, or null
```

- `canAuthorizeVeteranFirstUse`: only meaningful for `veteran`. For each civ in
  `atWarWith`, checks the three-condition gate — own capital (`getCapitalCity`) HP below
  threshold (illustrative 20, final value at plan-writing time), a hostile land unit
  adjacent to it, and no friendly combat-capable land unit within N hexes (illustrative
  3) of the capital (new small local helper — counts own non-civilian land units within
  hex range using the existing `hexDistance`/`wrappedHexDistance` pattern already used
  elsewhere in `basic-ai.ts`). If all three hold and that opponent has a legal target
  (`getLegalStrategicLaunchTargets`), returns the first such target city id.
- `evaluateStrategicLaunchDecision`: the sole entry point. For `veteran`, first tries
  `canAuthorizeVeteranFirstUse`. If that returns null (or difficulty isn't veteran),
  falls through to retaliation: for each `atWarWith` civ with legal targets, if
  `isStrategicStrikeRetaliation(state, civId, otherId)` is true, roll
  `rng() < profile.strategicLaunchRetaliationWillingness`; on success return the first
  legal target city id. Deterministic seed via
  `createRng(\`${state.gameId ?? 'legacy'}:${state.turn}:${civId}:strategic-launch\`)`
  (same convention as `ai-network-planning.ts`). Returns `null` if nothing authorized.
  No target-value scoring beyond "first legal target" — deliberately simple (YAGNI);
  legal-target ordering already comes from `getLegalStrategicLaunchTargets`'s existing
  city iteration order.

### 7. `basic-ai.ts` integration

Inside `processAITurnInternal`'s existing `if (civ.diplomacy)` block, immediately after
the war-declaration decisions loop finishes applying (so `atWarWith` reflects this turn's
new declarations too): if the civ has any strategic launch platforms (cheap guard —
`getEligibleStrategicLaunchPlatforms(newState, civId).length > 0`, avoids doing doctrine
work for the ~all civs with no arsenal), call `evaluateStrategicLaunchDecision`. If it
returns a target city id, call `executeStrategicLaunch(newState, civId, targetCityId)`
and replace `newState` with the result's `.state` (mirroring how the existing
`onConfirmLaunch` UI controllers already consume `executeStrategicLaunch`'s return
shape — reuse that same handling pattern, don't invent a new one).

### 8. AI-vs-AI notification/SFX gating

`src/presentation/register-strategic-strike-presentation.ts`'s `'city:strategic-strike'`
handler currently always calls `ctx.notifier.deliver` + (from the controllers)
`SFX.strategicStrike()` unconditionally for the human's own confirmed launch. For MR5,
the handler adds a visibility check before delivering the notification/SFX when the
acting civ is not the human:
`hasMetCivilization(state, humanCivId, actorCivId) && hasMetCivilization(state, humanCivId, recipientCivId)`.
The human's own launches (already gated by the UI flow requiring the human to have
selected the target) always notify/play, unchanged. This is a pure additive condition on
the existing handler — no new event shape needed, matching MR4's own note that payload
extension (not a parallel event) is the right lever if nuance is ever needed.

## Testing approach

- `strategic-arsenal-system.test.ts`: `hasKnownStrategicCapability` — true only when met
  AND Manhattan Project built; false for either unmet or no-project.
- `ai-personality.test.ts`: `shouldDeclareWar` — known-capability target raises the
  effective threshold (a war that would otherwise trigger doesn't, once the boolean and a
  nonzero weight are added); zero weight is a no-op (regression safety for explorer-tier
  smallest-weight case).
- `ai-strategic-doctrine.test.ts` (new): existential-threat gate — each of the three
  conditions independently blocks authorization; all three together authorizes;
  non-veteran difficulties never authorize first use regardless of conditions.
  Retaliation — deterministic rng stub proves the willingness threshold is respected at
  each difficulty; non-retaliation-eligible civs are never targeted; only `atWarWith`
  civs with legal targets are considered (no all-map scan — assert a civ with a legal
  target on a *non*-warred civ is never struck).
  `evaluateStrategicLaunchDecision` never calls `resolveStrategicStrike` directly — assert
  via the `executeStrategicLaunch` call site in `basic-ai.ts`, not inside this module
  (this module only decides, `basic-ai.ts` executes).
- `diplomacy-panel.test.ts`: the caution note renders exactly when
  `hasKnownStrategicCapability` is true and the civs aren't at war; absent otherwise.
- `register-strategic-strike-presentation.test.ts`: AI-vs-AI strike between two civs the
  human hasn't met produces no notification/SFX call; once both are met, it does; the
  human's own launch is unaffected by this new condition.
- Full-suite regression: `national-project-balance.test.ts` and
  `wonder-definitions.test.ts` are unaffected (no wonder/national-project content
  touched) but must still pass per standard practice; `pacing-audit.test.ts` is
  unaffected (no yield/economy change) — confirm both pass rather than skip per
  CLAUDE.md's blanket full-suite-before-push rule.

## Non-goals for MR5

- No arms-control treaty (§12, MR6).
- No `superweapons` off-mode setting (§13, MR7).
- No change to production scoring (`strategicArsenalValueScore` already correct).
- No platform-level (Silo/submarine) visibility function — already handled by existing
  systems.
- No target-value scoring beyond "first legal target" for AI launch selection.
