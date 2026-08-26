# #545 MR5 — AI Deterrence Visibility & Launch Doctrine: Implementation Design

This is an MR-scoped implementation design, not a new feature spec. It translates the
arc-level design (`2026-08-25-issue-545-strategic-deterrence-design.md` §9 and §10,
quoted and re-verified against the live file below) into concrete module/function/data
shapes for MR5, plus two implementation decisions and one open-question resolution that
weren't nailed down at the arc-design level. Written after re-verifying every file/
function claim in `/tmp/next-545.md` (the MR4→MR5 hand-off) against the current code —
all claims checked out. An inline review pass across gameplay/balance, ages 7–43, play
styles, difficulty modes, AI, UI/UX, architecture, extensibility, data, SFX, saves,
testing, and solo/hot-seat regressions then found seven real issues in the first draft
(see "Design review" below) — all fixed inline, so the sections that follow already
reflect the corrected design, not the original.

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

## Design review — issues found and fixed

An inline review across gameplay/balance, fun, ages 7–43, play styles, difficulty modes,
AI, UI/UX, architecture, extensibility, data, SFX, saves, testing, and solo/hot-seat
regressions was performed on the first draft of this doc. Findings and fixes, folded
directly into the sections below rather than left as a separate to-do list:

1. **SFX/notification architecture was broken for the exact case MR5 exists to add.**
   The first draft's §8 assumed `SFX.strategicStrike()` was already wired into the
   `'city:strategic-strike'` event handler and only needed a visibility condition added.
   Re-checking the live code (`register-strategic-strike-presentation.ts`,
   `panel-actions-controller.ts:716`, `selection-controller.ts:224`) showed the SFX call
   actually lives **only** in the two UI controllers, fired directly on the human's own
   confirmed launch — the event handler only ever delivered a notification. MR5 is the
   first MR where a strike can happen with *no* UI controller in the loop at all (an
   AI launching at the human, or at another AI) — under the first draft, an AI striking
   the human would produce a notification but **silence**, and AI-vs-AI strikes the
   human witnesses would produce nothing at all. Fixed by consolidating all
   SFX + witness-notification logic into the registrar and removing the two direct
   controller calls (§8, rewritten below) — single source of truth, no double-fire, and
   the new AI-initiated cases are correctly covered for the first time.
2. **Caution weight and retaliation willingness had no stated bounds** — an unbounded
   `strategicDeterrenceCautionWeight` could make nuclear capability a hard war-immunity
   shield instead of caution (contradicts the spec's own "no invisible arbitrary AI fear
   bonus" framing), and a retaliation willingness of 1.0 would make "the very next
   eligible turn" a deterministic counter-launch — legal per the code but a de facto
   violation of the spec's explicit "retaliation is never automatic/scripted" intent.
   Fixed with explicit bounds and invariant tests (§2, §3, Testing).
3. **AI could nuke a minor civ (city-state).** `getStrategicLaunchLegality` only checks
   `isAtWar`, which is also true for major-vs-minor wars (`MinorCivState.diplomacy` is a
   full `DiplomacyState`; `'diplomacy:war-declared'` even carries
   `opponentKind: 'major' | 'minor' | 'barbarian'`). Unscoped, an AI at war with a
   city-state could burn a warhead on it — absurd overkill against a non-peer target,
   and not what §10's "civs" language was modeling. Fixed by explicitly restricting AI
   target consideration to major civs (§6).
4. **Target selection ("first legal target") had no narrative weight** — an AI-launched
   strike hitting an arbitrary border city instead of the enemy capital reads as random
   rather than a deliberate, weighty decision. Fixed with a simple capital-preference
   tiebreak, still bounded/YAGNI (§6).
5. **"Friendly relief force" was ambiguous** (own units only, or allied units too?)
   — the latter would require alliance-aware relief detection that doesn't exist
   anywhere in the codebase. Fixed by scoping explicitly to the endangered civ's own
   units (§6).
6. **The retaliation-risk preview note MR4 explicitly deferred** ("skip the
   retaliation-risk note entirely rather than inventing a visibility check") is exactly
   unblocked by this MR's own visibility gate. Leaving it as "optional polish" conflicts
   with CLAUDE.md's UI rule that decision points must be self-explanatory, especially
   for a game-ending action a 7-year-old player might trigger without understanding the
   consequence. Pulled into MR5's required scope (new section after §8).
7. **A quiet, verifiable positive invariant surfaced during the AI/play-styles pass**:
   by construction, a human who never builds strategic arsenal and never strikes first
   can never be nuked — retaliation requires the AI's *own* `strategicStrikesReceivedFrom`
   to include the human, and the veteran existential gate requires the human to already
   be laying siege to that AI's capital. Worth a named regression test so it stays true
   (Testing) rather than an implicit property nobody protects.

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
- `strategicLaunchRetaliationWillingness: number` (0..1, **hard-capped below 1.0**, e.g.
  max ~0.9 at veteran) — probability-of-launching-this-turn once retaliation-eligible
  (`isStrategicStrikeRetaliation` true for some legal target). Explorer lowest ("heavily
  suppressed"), standard moderate, veteran highest ("maximally willing"). The sub-1.0
  cap is required, not a tuning nicety: at exactly 1.0, the very next eligible turn's
  roll always succeeds, which is a deterministic counter-launch in every practical
  sense — the spec's "retaliation is never automatic/scripted" language exists
  specifically to rule that out. Kept in the same profile table as every other knob
  rather than a separate table in the new leaf module, for consistency — even though
  only civs with arsenal capacity ever consult it, matching how e.g.
  `submarineEscortWeight` is also meaningless for a civ with no submarines yet.

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
Exact weight values are a plan-writing-time tuning decision, but they are bounded by a
hard requirement, not just a preference: **`strategicDeterrenceCautionWeight` must never
be large enough, at any difficulty, that a sufficiently motivated AI (high military
advantage, terrible relationship) cannot still cross the threshold.** Nuclear capability
is deterrence — it raises the bar, it does not grant war-immunity. This is a testable
invariant (see Testing), not just documentation. Veteran gets the *largest* weight
(same explorer < standard < veteran direction as every other knob) precisely because
veteran is the "smartest" difficulty — it should respect a demonstrated deterrent more
than a less sophisticated opponent would, which is the opposite polarity from an
eagerness knob (higher = more aggressive) but the same increasing direction across
difficulties, worth calling out explicitly so a future reader doesn't assume the
convention always means "veteran is more aggressive here." **Before changing this
signature, grep every existing caller and test of `shouldDeclareWar`** (today: only
`evaluateDiplomacy` in `ai-diplomacy.ts`, per the live-code check above) so no test file
is left calling the old 6-arg signature.

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

- **Major civs only.** `getLegalStrategicLaunchTargets(state, civId)` already returns
  every legal target city regardless of owner kind — but §10's doctrine is modeling
  deterrence between nuclear-armed *major* powers, not "may a nuke ever be used on
  anyone I'm at war with." Both `canAuthorizeVeteranFirstUse` and the retaliation path
  below filter the legal-target list to `city.owner in state.civilizations` (excluding
  `state.minorCivs` entries) before considering them. A major civ at war with a
  city-state is common and should never end in that city-state being nuked. This is a
  new, MR5-specific exclusion — MR4's human-facing launch flow is unchanged (a human
  could already legally target a minor civ's city today; that pre-existing gap is
  out of scope for this MR to fix, but the new AI doctrine must not inherit it).
- **Target selection prefers the enemy capital.** Among an opponent's legal targets,
  if their capital city (`getCapitalCity(state, otherId)`) is one of them, strike it;
  otherwise fall back to the first legal target in `getLegalStrategicLaunchTargets`'s
  existing order. This is a one-line tiebreak, not a scoring system — still YAGNI-
  bounded — but avoids an AI-launched strike reading as an arbitrary border-city hit
  instead of the deliberate, high-stakes decision it's meant to represent.
- `canAuthorizeVeteranFirstUse`: only meaningful for `veteran`, and applies uniformly
  regardless of whether the opponent is the human or another AI — the gate is keyed
  entirely off the acting civ's own capital state, not the opponent's identity. For
  each civ in `atWarWith` (major civs only, per above), checks the three-condition
  gate — own capital (`getCapitalCity`) HP below threshold (illustrative 20, final
  value at plan-writing time), a hostile land unit adjacent to it, and no friendly
  combat-capable land unit within N hexes (illustrative 3) of the capital. "Friendly"
  here means **the endangered civ's own units only** — not allied civs' units. Alliance-
  aware relief detection doesn't exist anywhere in this codebase, and adding it is out
  of scope for MR5; scoping to own units is a deliberate simplification, not an
  oversight (new small local helper — counts own non-civilian land units within hex
  range using the existing `hexDistance`/`wrappedHexDistance` pattern already used
  elsewhere in `basic-ai.ts`). If all three hold and that opponent has a legal target,
  returns the capital-preferred target per above.
- `evaluateStrategicLaunchDecision`: the sole entry point. For `veteran`, first tries
  `canAuthorizeVeteranFirstUse`. If that returns null (or difficulty isn't veteran),
  falls through to retaliation: for each `atWarWith` major civ with legal targets, if
  `isStrategicStrikeRetaliation(state, civId, otherId)` is true, roll
  `rng() < profile.strategicLaunchRetaliationWillingness`; on success return the
  capital-preferred target per above. Deterministic seed via
  `createRng(\`${state.gameId ?? 'legacy'}:${state.turn}:${civId}:strategic-launch\`)`
  (same convention as `ai-network-planning.ts`). Returns `null` if nothing authorized.

### 7. `basic-ai.ts` integration

Inside `processAITurnInternal`'s existing `if (civ.diplomacy)` block, immediately after
the war-declaration decisions loop finishes applying (so `atWarWith` reflects this turn's
new declarations too): if the civ has any strategic launch platforms (cheap guard —
`getEligibleStrategicLaunchPlatforms(newState, civId).length > 0`, avoids doing doctrine
work for the ~all civs with no arsenal), call `evaluateStrategicLaunchDecision`. If it
returns a target city id, call `executeStrategicLaunch(newState, civId, targetCityId)`
and replace `newState` with the result's `.state` (mirroring how the existing
`onConfirmLaunch` UI controllers already consume `executeStrategicLaunch`'s return
shape — reuse that same handling pattern, don't invent a new one). This call site does
**not** call `SFX.strategicStrike()` or emit `'city:strategic-strike'` itself beyond
what `executeStrategicLaunch`'s own commit already triggers — see §8, which is now the
single place that decides whether to notify/play for *any* strike, human- or
AI-initiated.

### 8. Strike notification/SFX — consolidated into one handler (rewritten after review)

**The first draft of this section was wrong** — see finding #1 above. Corrected design:

- **Remove** the direct `SFX.strategicStrike()` calls from `panel-actions-controller.ts:716`
  and `selection-controller.ts:224`. Both controllers keep emitting `'city:strategic-strike'`
  after a successful `executeStrategicLaunch` commit, exactly as today — only the direct
  SFX call moves out.
- `register-strategic-strike-presentation.ts`'s handler becomes the **single source of
  truth** for both the notification and the SFX, for every strike regardless of who
  triggered it (human via a controller, or AI via §7's `basic-ai.ts` call site) — this
  is the only way the new AI-initiated cases can be covered at all, since neither has a
  UI controller in the loop.
- **Notification** (unchanged for the recipient, extended for witnesses): the struck
  civ (`recipientCivId`) is always notified via `ctx.notifier.deliver`, exactly as MR4
  shipped — being struck is never gated on visibility, you always know when it happens
  to you. **New**: additionally loop over every *other* human-controlled civ
  (`state.civilizations[id]?.isHuman`, excluding the actor and recipient — relevant for
  hot-seat's second human, and matters for any future third+ human-controlled slot) and
  deliver a witness-flavor notification (`"<Striker> struck <city>!"`) when
  `hasMetCivilization(state, thatHumanCivId, actorCivId) && hasMetCivilization(state, thatHumanCivId, recipientCivId)`.
  Scoped to human civs only, not every civ (`register-beast-presentation.ts`'s
  `beast:awakened` handler loops over *all* civs for its notification, but a
  flavor-only witness notification has no gameplay purpose for an AI civ that isn't a
  party to the strike — this is a deliberate, narrower choice than that precedent, not
  an oversight).
- **SFX** (new, single trigger point): `SFX.strategicStrike()` plays at most once per
  event, gated on `state.currentPlayer` — the currently-active viewer, matching the
  existing precedent in `register-beast-presentation.ts`'s `beast:slain` handler
  (`if (slayerCivId === state.currentPlayer) { ... }` for viewer-specific effects).
  Play if `state.currentPlayer === actorCivId || state.currentPlayer === recipientCivId`
  (the viewer is a direct party — covers the human's own launch, and the human being
  struck, with no double-fire risk since this now fires exactly once from exactly one
  place), **or**, when the viewer is a bystander to an AI-vs-AI strike, if
  `hasMetCivilization(state, state.currentPlayer, actorCivId) && hasMetCivilization(state, state.currentPlayer, recipientCivId)`.
  **Verify before implementing**: confirm `state.currentPlayer` is not mutated anywhere
  during AI batch turn processing (a grep of `turn-manager.ts`/`basic-ai.ts` during this
  design pass found zero references to `currentPlayer` in either file, which is
  consistent with it staying pinned to the human who's about to see the results — but
  re-confirm this holds at plan-writing/implementation time, since it's the load-bearing
  assumption for AI-vs-AI SFX timing being correct rather than silent or misfired).
- Hot-seat with a struck human who is *not* the current viewer at the moment of the
  event (e.g. Human A's turn strikes Human B) is unaffected by this change — Human B's
  notification is queued via the existing "queue for hot-seat" `Notifier` contract
  (unchanged MR4 behavior); they don't get an SFX cue at delivery time either, matching
  MR4's existing (unchanged) behavior of only playing SFX at launch time, not at
  notification-delivery time.

### 9. Retaliation-risk preview note (pulled into MR5 scope — finding #6)

MR4's stage-2 launch preview (`src/ui/strategic-launch-flow.ts`) explicitly skips a
retaliation-risk note pending this MR's visibility gate. That gate now exists
(`hasKnownStrategicCapability`), and CLAUDE.md's UI rule ("all UI elements must be
self-explanatory — add help text, descriptions, and inline info where users make
choices") applies directly to a decision this consequential — this game is played by
ages 7–43, and an un-forewarned player (of any age) launching a strike without knowing
the target civ has its own nuclear capability, and might reply in kind, is exactly the
kind of silent-consequence UI CLAUDE.md's `ui-panels.md` rules exist to prevent. Add
one line to the stage-2 impact preview: when
`hasKnownStrategicCapability(state, actorCivId, targetCivId)` is true, show a plain-
language note (e.g. "This civilization has its own strategic capability — they may be
willing to retaliate."). No new mechanic, no new event — purely surfacing information
the new visibility function already computes. Renders via `textContent`, same XSS-safe
pattern as the rest of the flow.

## Testing approach

- `strategic-arsenal-system.test.ts`: `hasKnownStrategicCapability` — true only when met
  AND Manhattan Project built; false for either unmet or no-project.
- `ai-personality.test.ts`: `shouldDeclareWar` — known-capability target raises the
  effective threshold (a war that would otherwise trigger doesn't, once the boolean and a
  nonzero weight are added); zero weight is a no-op (regression safety for explorer-tier
  smallest-weight case). **Balance invariant (finding #2)**: assert that a sufficiently
  high `militaryAdvantage` + sufficiently negative `relationship` still returns `true`
  even against a known-capability target at every difficulty's configured weight —
  proves caution is not immunity. Update every existing test call site to the new 8-arg
  signature (see §3's grep requirement).
- `opponent-challenge.test.ts` (or wherever profile-shape invariants already live):
  assert `strategicLaunchRetaliationWillingness < 1.0` at all three difficulties —
  regression guard for finding #2's sub-1.0 cap requirement.
- `ai-strategic-doctrine.test.ts` (new): existential-threat gate — each of the three
  conditions independently blocks authorization; all three together authorizes;
  non-veteran difficulties never authorize first use regardless of conditions; "friendly"
  only counts the endangered civ's own units (an allied unit within range does not block
  authorization — regression guard for finding #5). Target selection — prefers the
  opponent's capital when it's a legal target, falls back to first-legal otherwise
  (finding #4). **Minor-civ exclusion (finding #3)**: a civ at war with a minor civ,
  with no major-civ target available, is never authorized to strike the minor civ's
  city — assert `evaluateStrategicLaunchDecision` returns `null` in that setup, not the
  minor civ's city id.
  Retaliation — deterministic rng stub proves the willingness threshold is respected at
  each difficulty; non-retaliation-eligible civs are never targeted; only `atWarWith`
  civs with legal targets are considered (no all-map scan — assert a civ with a legal
  target on a *non*-warred civ is never struck).
  `evaluateStrategicLaunchDecision` never calls `resolveStrategicStrike` directly — assert
  via the `executeStrategicLaunch` call site in `basic-ai.ts`, not inside this module
  (this module only decides, `basic-ai.ts` executes).
  **Play-styles invariant (finding #7)**: a human civ with zero arsenal and an empty
  `strategicStrikesReceivedFrom` on every opposing civ's diplomacy state is never
  returned as a strike target by any AI civ's `evaluateStrategicLaunchDecision`, across
  all three difficulties, even when at war — proves a pacifist/non-nuclear playstyle is
  structurally safe from ever being nuked, not just safe by convention.
- `diplomacy-panel.test.ts`: the caution note renders exactly when
  `hasKnownStrategicCapability` is true and the civs aren't at war; absent otherwise.
- `strategic-launch-flow.test.ts`: the retaliation-risk preview note (§9) renders exactly
  when `hasKnownStrategicCapability(state, actorCivId, targetCivId)` is true; absent
  otherwise.
- `register-strategic-strike-presentation.test.ts`: rewritten for the consolidated
  design (finding #1) —
  - Human's own launch: `SFX.strategicStrike()` fires **exactly once** (regression test
    for the double-fire risk the first draft would have introduced) and the recipient is
    notified.
  - AI strikes the human: recipient notified, SFX fires (new coverage — this case
    produced silence under the first draft).
  - AI-vs-AI strike, human has met both civs: human gets a witness notification and SFX
    fires.
  - AI-vs-AI strike, human hasn't met one or both civs: no witness notification, no SFX.
  - AI-vs-AI strike, a *second* human civ (hot-seat) has met both civs but is not
    `state.currentPlayer`: that civ gets a notification (queued) but SFX does not fire
    an extra time (SFX is viewer-gated to `state.currentPlayer`, notification is not).
  - Minor civ as recipient: unaffected — recipient notification is unconditional
    regardless of civ kind; only the *AI doctrine's* target selection excludes minor
    civs (finding #3), not the presentation layer.
- `panel-actions-controller.test.ts` / `selection-controller.test.ts`: assert
  `SFX.strategicStrike()` is **not** called directly from either controller anymore
  (regression guard proving the consolidation in finding #1 actually happened, not just
  documented).
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
- No target-value scoring beyond "prefer the opponent's capital, else first legal
  target" for AI launch selection (finding #4's tiebreak is the full extent of it).
- No alliance-aware "friendly relief force" detection — the existential-threat gate's
  relief check is scoped to the endangered civ's own units only (finding #5).
- No fix to the pre-existing MR1–4 gap allowing a *human* to target a minor civ's city
  via the launch flow — only the new AI doctrine excludes minor civs (finding #3); the
  human-facing gap is out of scope for this MR.
- SFX-at-notification-delivery-time for a non-active hot-seat player (e.g. Human B
  hearing a cue when they next take their turn, for a strike that happened during Human
  A's turn) — unchanged pre-existing MR4 behavior, not addressed by this MR.
