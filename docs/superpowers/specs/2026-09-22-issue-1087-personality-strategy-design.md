# #1087 — Personality Shapes Strategic Choices, Not Tactical Competence (Design)

## 0. Phase 0 — Existing personality behavior inventory

Read in full: `ai-personality.ts`, `ai-diplomacy.ts`, `ai-treaty-consent.ts`, `ai-national-intent.ts`
(#1086), `ai-domination.ts`, `ai-expansion-sites.ts`, `ai-treasury.ts`, `ai-strategy.ts`,
`ai-research.ts`'s and `ai-production.ts`'s and `basic-ai.ts`'s personality call sites. Grepped
`personality` across every file in `src/ai/*.ts` (excluding tests) to confirm no consumer was missed.
`ai-tactics.ts` and `ai-unit-roles.ts` were grepped too and have **zero** personality references —
confirmed, not assumed, that tactical execution is already personality-free.

| # | Surface | Current personality effect | Strategic or tactical? | Keep / move / remove / reconcile |
|---|---|---|---|---|
| 1 | `weightProductionRoles` (`ai-personality.ts`) → `ai-production.ts` `generateWithResidual` (the real, live city-production candidate scorer) | Role-based (`combat`/`settlement`/`transport`/`recon`/`trade`/`espionage`/`missionary`) score terms from `warLikelihood`/`expansionDrive`/`diplomacyFocus`/`trader` trait, each multiplied by `NATIONAL_INTENT_POSTURE` (#1086) | Strategic (candidate admission scoring) | **Keep as the canonical model.** Already posture-integrated by #1086; #1087 extends this pattern to the surfaces below rather than inventing a second one. |
| 2 | `weightTechChoice` (`ai-personality.ts`) → `ai-research.ts`'s `personalityTrackWeight`, part of `evaluateResearchCandidate`'s real score | Per-trait `TRACK_WEIGHTS[trait][track]` multiplier on tech-track score | Strategic (research candidate admission) | **Reconcile.** This is research's exact analogue of #1 but was **not** given a `posture` multiplier in #1086 — production got posture-awareness, research did not. A civ in `dominate` intent should weight military-track research higher and a `develop` civ should weight economy/science higher, mirroring `combatRoleWeight`/`economyRoleWeight`. Real gap, mechanical fix, same shape as #1086's own production wiring. |
| 3 | `weightProductionChoice` / `chooseProduction` (`ai-strategy.ts`) | Flat hardcoded item-id-list weighting (`MILITARY_ITEMS`/`ECONOMY_ITEMS`/`SETTLER_ITEMS`/naval lists) by `warLikelihood`/`expansionDrive` | Strategic, but narrow | **Keep, out of scope.** Sole caller is `chooseLegendaryWonderFallback` (`basic-ai.ts`) — a fallback path taken only when the real candidate pipeline (#1) produces nothing. It is not the production pipeline and touching it risks an unrelated regression for no behavioral payoff `#1087`'s acceptance criteria care about. Documented here so a future reader does not mistake it for dead or for the canonical model. |
| 4 | `chooseTech` (`ai-strategy.ts`) | Wraps `weightTechChoice` in a pick-best loop | Strategic | **Dead code.** Zero callers outside its own test file — `ai-research.ts` calls `weightTechChoice` directly through its own candidate pipeline. Not touched by #1087 (removing dead code is not this issue's scope and the file has an existing regression test); flagged for a follow-up cleanup issue, not fixed here. |
| 5 | `scoreIntents` (#1086, `ai-national-intent.ts`) | `expansionDrive` sizes soft cap + `expand` score; flat `+15` for `trader`→`develop`, `diplomatic`→`deter`; `aggressive` gates `doctrine.pursuit` which floors `dominate` | Strategic (intent selection — the top of the hierarchy) | **Keep, extend.** This is already exactly the "personality biases intent attractiveness" layer #1087 is required to build on. Gaps: `warLikelihood` has no term anywhere in intent scoring (an aggressive-but-not-`'aggressive'`-trait-tagged civ, or a high-`warLikelihood` civ, gets no `dominate`/`deter` lean at all beyond the binary trait check), and no trait reads for `deter` beyond `diplomatic`. See §2. |
| 6 | `shouldDeclareWar` (`ai-personality.ts`) → `ai-diplomacy.ts` `evaluateDiplomacy` | `warLikelihood * militaryAdvantage` vs. a flat threshold; early-turn aggressive-rush branch | Strategic (war/peace posture) | **Reconcile.** Reads raw personality only — never intent/posture, even though #1086 already computes a `dominate`/`deter` national intent for this exact civ this exact round. A civ mid-`dominate` intent should be measurably more willing to declare war than the same personality mid-`develop`; today it isn't. |
| 7 | `evaluateDiplomacy` (`ai-diplomacy.ts`) — NAP/arms-control gating | `personality.diplomacyFocus > 0.4` (repeated literal threshold, twice in this function) | Strategic | **Reconcile.** Flat trait/scalar threshold repeated at every call site is exactly the "personality spaghetti" anti-pattern the issue names. Candidate: consult intent/posture instead of (or blended with) the raw scalar. |
| 8 | `evaluateMinorCivDiplomacy` (`ai-diplomacy.ts`) — minor-civ gold gifting | `personality.diplomacyFocus > 0.4` (same literal threshold, third occurrence) | Strategic | **Reconcile**, same as #7 — same magic number copy-pasted a third time. |
| 9 | `evaluateVassalage` (`ai-diplomacy.ts`) | Takes a `personality: PersonalityTraits` parameter that **the function body never reads**. Vassalage-seeking is driven only by `selfStrength.midpoint < bestStrength * 0.4`. | Strategic | **Reconcile — dead parameter, real gap.** A `deter`/`recover`-intent civ (weak, threatened) should be measurably *more* willing to seek vassalage than a `dominate`/`expand`-intent civ at the identical strength ratio; nothing currently expresses that. This maps directly onto intent and is a clean, additive fix. |
| 10 | `evaluateEmbargoResponse` (`ai-diplomacy.ts`) | Hardcoded per-trait threshold table: `aggressive: 10, diplomatic: 30, else: 20` | Strategic | **Reconcile.** A third independent hardcoded trait-branch table, same anti-pattern as #7/#8 in a different shape. |
| 11 | `evaluateLeagueResponse` (`ai-diplomacy.ts`) | Hardcoded per-trait threshold table: `aggressive: 30, diplomatic: 5, else: 10` | Strategic | **Reconcile**, same shape as #10. |
| 12 | `evaluateVassalageConsent` / `evaluateTreatyConsent` / `evaluatePeaceConsent` (`ai-treaty-consent.ts`) | Per-agreement-kind flat `diplomacyFocus` thresholds (0.3/0.3/0.4/0.5) | Strategic (recipient-side consent) | **Keep as a pure leaf, do not thread posture in.** Deliberately `GameState`-free and `NationalIntentState`-free by design (its own header: "no GameState... Pure functions of relationship + personality"), invoked from both the human→AI and AI→AI paths, so it cannot read the *proposer's* AI-only intent without breaking that boundary, and reading the *recipient's own* intent would need it to stop being a pure leaf for a marginal gain. Out of scope; not touched. |
| 13 | `chooseAiMission` (`basic-ai.ts`) — espionage mission preference order | Three fully-independent hardcoded `SpyMissionType[]` preference-order literals selected by `traits.has('aggressive')` / `traits.has('diplomatic') \|\| traits.has('trader')` / else | Strategic (which espionage strategy to pursue) | **Reconcile.** The clearest existing instance of the "every downstream system independently checks if aggressive... if trader" anti-pattern the issue calls out by name. Candidate: derive from national intent instead of a raw trait branch (`dominate`→aggressive-order, `deter`/`recover`→defensive-leaning order, `develop`→diplomatic/economic order), which also makes it react to the *civ's current situation*, not just its fixed personality — a personality-consistent but situationally blind system today. |
| 14 | Production-queue treasury gate (`ai-treasury.ts`, header comment) | Explicitly documented as **"Deliberately NOT emergency-aware and NOT personality-weighted"** — same rule for every personality and challenge tier | N/A (a deliberate non-surface) | **Keep, cite as precedent.** This is a pre-existing, already-shipped instance of exactly the "every personality must remain competent at defense/recovery/survival" invariant #1087 requires. No change; cited in §5 below. |
| 15 | `ai-tactics.ts`, `ai-unit-roles.ts` | None — zero personality references, confirmed by grep | Tactical | **Keep, confirm via test.** Tactical execution is already personality-free; #1087 adds a regression pinning this so it can never regress silently (§5). |
| 16 | `objectiveCandidates` (`ai-prepared-turn.ts`) — expand-candidate emission gate | `perception.ownCities.length < getExpansionCitySoftCap(personality.expansionDrive)` (independent of, and duplicate-in-spirit to, `scoreIntents`'s own soft-cap use for the `expand` intent score) | Strategic (candidate admission) | **Keep, note the duplication is legitimate.** Candidate admission and intent scoring are two different layers by design (#1086's own hierarchy) and both may legitimately read raw personality — the alternative (admission gate reads only intent, never expansionDrive directly) would make expansion candidates disappear entirely for a civ whose intent briefly lapsed to `develop` even though it is still under its personal soft cap. Not touched. |

### Summary of what changes

- **Reconciled into intent/posture** (the required architectural direction): #2 (research posture), #6 (war declaration), #7/#8 (NAP/arms-control/gifting), #9 (vassalage — a real dead-parameter bug), #10/#11 (embargo/league response), #13 (espionage mission preference).
- **Kept as-is, precedent for the recovery invariant**: #14 (treasury), #15 (tactics — now test-pinned).
- **Kept as-is, out of scope**: #3 (narrow wonder-fallback path), #12 (treaty consent — deliberately GameState-free leaf).
- **Noted, not fixed**: #4 (`chooseTech` dead code — a follow-up cleanup issue, not #1087's scope).
- **Already correct, no change**: #1 (production, #1086's own reference implementation), #5 (intent scoring itself — extended, not replaced), #16 (admission-gate duplication is intentional layering).

## 1. Architectural contract (restated, concretized for this issue)

```
Personality (fixed, per-civType)
  --biases attractiveness of--> National Intent (#1086, persistent, hysteresis)
      --produces--> NationalIntentPosture (already exists, #1086)
          --shapes--> Strategic candidate admission + commitment (production #1, research #2 [new])
          --shapes--> Diplomatic posture (war declaration #6, treaty proposals #7/#8, embargo/league #10/#11,
                       vassalage-seeking #9, espionage mission choice #13 [all new])
              --creates--> capability demand (unchanged, already flows through #1's production candidates)
                  --executes--> Tactical AI (ai-tactics.ts / ai-unit-roles.ts — untouched, personality-free)
```

No downstream consumer gains a *second*, independent `personality.traits.includes(...)` branch under
this design — every reconciled surface either reads the already-computed `NationalIntentPosture`/
`NationalIntentState.current`, or (for #9, which has no existing posture field that fits) reads a
new, single, typed diplomatic-posture value computed once per round from national intent, not a new
per-call-site trait check.

## 2. Extending `NationalIntentPosture` — new fields, not a second table

`NATIONAL_INTENT_POSTURE` (#1086) already carries `expandBias`/`captureBias`/`resourceBias`/
`settlementRoleWeight`/`economyRoleWeight`/`combatRoleWeight`. #1087 adds three fields to the same
table, following the identical "one typed row per intent" shape — not a parallel `DIPLOMATIC_POSTURE`
table, so there is exactly one place that defines "what does this intent mean for behavior":

```ts
export interface NationalIntentPosture {
  expandBias: number;
  captureBias: number;
  resourceBias: number;
  settlementRoleWeight: number;
  economyRoleWeight: number;
  combatRoleWeight: number;
  // #1087 additions:
  researchMilitaryTrackWeight: number;   // multiplies weightTechChoice's military-track-relevant score
  warDeclarationBias: number;            // additive nudge to shouldDeclareWar's threshold comparison
  diplomaticOpennessBias: number;        // additive nudge to evaluateDiplomacy/evaluateEmbargoResponse/
                                          // evaluateLeagueResponse's thresholds; positive = more open
  vassalageSeekingBias: number;          // additive nudge to evaluateVassalage's strength-ratio threshold
}
```

Values per intent (rationale, not arbitrary — mirrors the existing table's own scale, where
`combatRoleWeight` ranges 0.85-1.3 and `expandBias` ranges -20..20):

| Intent | researchMilitaryTrackWeight | warDeclarationBias | diplomaticOpennessBias | vassalageSeekingBias |
|---|---:|---:|---:|---:|
| `expand` | 1.0 | 0 | 0 | 0 |
| `develop` | 0.85 | -0.1 | +0.1 | 0 |
| `dominate` | 1.3 | +0.2 | -0.15 | -0.15 |
| `deter` | 1.15 | 0 | -0.05 | +0.1 |
| `recover` | 0.9 | -0.3 | +0.15 | +0.25 |

`recover` (shock-only, #1086) gets the strongest `vassalageSeekingBias` and the strongest negative
`warDeclarationBias` — a civ that just lost its capital or is about to should not be *more* likely to
pick a fresh fight, and should be measurably more receptive to submitting to a stronger neighbor for
protection. This is the concrete mechanism satisfying §5's recovery invariant for the *diplomatic*
side (the *production/tactical* side is already satisfied by #14/#15 above).

## 3. Per-surface wiring

- **`weightTechChoice` (#2):** gains a required `posture: NationalIntentPosture` parameter (mirrors
  #1086's own precedent on `weightProductionRoles`). Applies `researchMilitaryTrackWeight` only to
  the `military` track score component — not a blanket multiplier on the whole tech score — so a
  `dominate` civ measurably prioritizes military tech without every other track being crushed to
  near-zero. `ai-research.ts`'s single call site threads `NATIONAL_INTENT_POSTURE[intent]` the same
  way `ai-production.ts` already does. `chooseTech` (dead, #4) is left alone — not a live call site.
- **`shouldDeclareWar` (#6):** gains a required `posture: NationalIntentPosture` parameter. The
  existing `warScore > (0.8 + peacePressure + cautionPenalty)` comparison becomes
  `warScore > (0.8 + peacePressure + cautionPenalty - posture.warDeclarationBias)` — a positive bias
  lowers the bar (more willing), a negative bias raises it (more reluctant), never inverting the
  existing early-turn branch's own independent gate (`personality.warLikelihood >= 0.8` stays
  untouched — that branch is a hardcoded rush-start rule already independent of ordinary war scoring).
- **`evaluateDiplomacy` (#7) / `evaluateMinorCivDiplomacy` (#8):** each gains a required
  `posture: NationalIntentPosture` parameter. The flat `personality.diplomacyFocus > 0.4` checks
  become `personality.diplomacyFocus + posture.diplomaticOpennessBias > 0.4`.
- **`evaluateLeagueResponse` (#11):** gains a required `posture` parameter. Threshold becomes
  `baseThreshold - posture.diplomaticOpennessBias * 20` — a positive (more open) bias lowers the
  bar, matching the pre-existing trait table's own direction (`diplomatic` already has the
  *lowest* threshold of the three, i.e. joins most readily).
- **`evaluateEmbargoResponse` (#10):** gains a required `posture` parameter, but with the
  **opposite sign** from #11: threshold becomes `baseThreshold + posture.diplomaticOpennessBias * 20`.
  This was caught during this issue's own mandatory review pass — the naive same-sign version
  (subtracting, as in #11) made a more diplomatically open posture *more* eager to join a punitive
  embargo, which inverts the pre-existing trait table's own meaning: `diplomatic` already has the
  *highest* threshold of the three (`30` vs. `10`/`20`), i.e. it is the most *reluctant* to join.
  Embargo and league response are not interchangeable "openness" surfaces — one is a punitive,
  isolating action (openness should suppress it) and the other is a cooperative, joining action
  (openness should encourage it) — and the fix keeps each direction consistent with its own
  pre-existing trait table rather than applying one formula everywhere on the assumption that
  "diplomatic openness" always means the same thing. See `tests/ai/ai-diplomacy.test.ts`'s
  "#1087 evaluateEmbargoResponse / evaluateLeagueResponse — posture bias direction" describe block
  for the regression that pins both directions (this also closed a real test-coverage gap: neither
  function had any direct test before #1087).
- **`evaluateVassalage` (#9):** the existing-but-unused `personality` parameter is replaced with a
  required `posture: NationalIntentPosture` parameter (the function never needed raw personality
  traits — the acceptance test is a strength ratio, and posture is the correct typed input for "how
  eager is this civ to submit to a stronger neighbor right now"). Threshold becomes
  `selfStrength.midpoint < bestStrength * (0.4 + posture.vassalageSeekingBias)` — a `recover` civ
  effectively becomes willing to vassalize at up to 0.65x relative strength instead of 0.4x.
- **`chooseAiMission` (#13):** the three hardcoded preference-order arrays are kept (they are
  legitimate authored content — "aggressive espionage" and "diplomatic espionage" are real, different
  strategies, not multipliers to invent), but the **selector** changes from a raw trait check to an
  intent-aware one: `dominate` intent selects the aggressive order regardless of trait (a civ
  currently pursuing conquest plays aggressive espionage even if its base personality is not tagged
  `aggressive`), `deter`/`recover` intent selects a defensive-leaning subset (excluding offensive
  first-strike missions like `cyber_attack`/`arms_smuggling` from the front of the list), and the
  existing trait-based fallback (`traits.has('aggressive')` etc.) is retained only for the `develop`/
  `expand` intents where personality, not urgency, should decide.

## 4. What does NOT change

- `weightProductionRoles` (#1) — already correct.
- `chooseProduction`/`weightProductionChoice` (#3) — narrow fallback, out of scope.
- `evaluateVassalageConsent`/`evaluateTreatyConsent`/`evaluatePeaceConsent` (#12) — deliberately
  `GameState`-free pure leaf; adding posture would need it to stop being one for a proposer-side
  signal it cannot see without an import it deliberately avoids.
- `ai-tactics.ts`, `ai-unit-roles.ts` — no personality reference today, none added.
- `ai-treasury.ts` — no personality reference today, none added; cited as existing precedent for §5.
- `objectiveCandidates`'s raw `expansionDrive` soft-cap read — legitimate dual-layer read, not a
  spaghetti instance (see inventory row #16).
- No new `NationalIntentState` field, no new persisted `OpponentAIState` field. Every #1087 change is
  either a pure-function signature addition (a required `posture` parameter, mirroring #1086's own
  precedent) or new rows in the already-existing, already-transient `NATIONAL_INTENT_POSTURE` table.
  **No save migration, no `SAVE_VERSION` bump** — the same "no downstream state" property #1086's
  posture table already has.

## 5. Invariants this design must satisfy (and how each is enforced)

- **Tactical parity.** Fixed battlefield + fixed plan + fixed `OpponentChallenge` ⇒ tactical quality
  must not vary by personality. Enforced by a new regression: two otherwise-identical `basic-ai.ts`
  turns differing only in `civType`/personality, same challenge, same map/units/plan, must produce
  byte-identical `chooseTacticalSequence` output. `ai-tactics.ts`/`ai-unit-roles.ts` take no
  personality input today (confirmed by grep, §0) — the test pins that this stays true rather than
  introducing new machinery to enforce it.
- **Recovery/emergency competence.** Every personality must be able to defend, recover, and survive.
  Enforced by: (a) `ai-treasury.ts`'s existing personality-blind production queue (unchanged), (b)
  `recover`'s posture row deliberately biasing every reconciled surface toward the *safer* choice
  (lower war declaration likelihood, higher diplomatic openness, higher vassalage-seeking, lower
  research-military-weight is intentionally *not* lowered — military tech access during `recover`
  must not be penalized even as the civ seeks peace), and (c) a regression that runs the existing
  `recover`-intent city-under-siege fixture from #1086's own test suite through the reconciled
  diplomacy/research call sites and asserts none of them make the civ's situation worse (no surface
  is coaxed into refusing a legal peace offer, no surface stops researching defensive-relevant tech).
- **Personality-pair differentiation.** At least one deterministic fixture per reconciled surface (7
  surfaces: research posture, war declaration, NAP/arms-control, minor-civ gifting, embargo response,
  league response, vassalage, espionage mission) proving two personalities differing only in the
  relevant trait/scalar, held at the *same* national intent, produce measurably different outputs —
  and a second fixture per surface proving the *same* personality held at two different intents also
  produces measurably different outputs (this is the actual acceptance bar: personality differs
  strategically, and the differentiation flows through intent as designed, not around it).
- **Determinism.** No new RNG draws anywhere in this design; every reconciled function stays a pure
  function of its (now slightly larger) typed input. `campaign-continuity.test.ts`-style determinism
  is unaffected structurally.
- **Hidden-information boundary.** `NationalIntentPosture` is already perception-safe by construction
  (#1086 built `NationalIntentState`/`NationalIntentInput` from `Pick<MajorCivPerception, 'ownCities'>`
  only). None of #1087's new posture fields read any new state, so no new leak surface is introduced.
- **Difficulty invariance.** None of the reconciled surfaces gain a challenge-tier branch; challenge
  continues to affect only what it already affects (mobilization timing, force caps, PURSUIT_BONUS in
  `ai-domination.ts`) — personality/intent and difficulty stay orthogonal, matching every existing
  rule file's stated policy (see `.claude/rules/game-balance.md`'s minor-civ "Difficulty policy"
  section for the same orthogonality principle applied elsewhere in this codebase).

## 6. Non-goals (explicit)

- No new player-facing UI panel surfacing intent/posture/personality — that is #1090's scope.
- No new personality traits, no new `NationalIntent` values, no GOAP/planner rewrite, no new victory/
  diplomacy/trade mechanics, no tactical-combat redesign. This issue reconciles seven existing
  strategic surfaces to read a value that already exists (`NationalIntentPosture`) instead of raw
  personality directly; it does not invent new mechanics for personality to drive.
- `chooseTech`'s dead code and `weightProductionChoice`'s narrow fallback path are documented, not
  fixed, in this MR — flagged as out-of-scope follow-ups, not silently left unexamined.

## 7. Traceability

`shouldDeclareWar`'s and `evaluateVassalage`'s outputs already surface indirectly through
`DiplomaticDecision[]`/existing `'objective'`/`'intent'` traces; #1087 adds no new `AIDecisionTrace`
kind (the issue's own guidance: prove behavior via tests, not by inventing new trace plumbing for
already-traced decision points). Where a reconciled function's posture-driven deviation from the
personality-only baseline is worth surfacing for debugging, it follows the exact precedent #1086 set
in `ai-national-intent.ts`'s own `reselect()` — computing a neutral-posture comparison and appending a
reason code only when posture was the deciding factor — applied narrowly to `shouldDeclareWar` only
(the single highest-stakes reconciled decision), not to all seven surfaces, to avoid the trace-bloat
`assertLegalChoices`'s 12-candidate structural cap already guards against elsewhere.

## Mandatory inline review

Performing the required inline review across: balancing gameplay, fun, new mechanics, different
player ages (7-43), different play styles, the built-in difficulty modes, how computer players will
use it, UI, UX, architecture, extensibility, data, SFX, updating saved games, proper testing,
regressions, solo play, and hot-seat play, and proper implementation.

- **Balancing gameplay / fun:** the bias magnitudes (§2's table) are deliberately small relative to
  each function's existing threshold scale — a `dominate` civ's war-declaration bar drops by 0.2
  against an existing `0.8 + peacePressure` baseline, not to zero — so personality+intent shifts
  behavior noticeably without making any single intent an auto-win or auto-loss button. Risk: if the
  long-horizon suite shows one intent dominating outcomes disproportionately, the fix is retuning
  these five numbers, not re-architecting; flagged as a concrete thing to watch in verification.
- **New mechanics:** none invented. Every change is "read an already-computed value instead of a raw
  trait/scalar" — the issue's own explicit ask.
- **Player ages 7-43 / play styles:** no player-facing surface changes at all in this MR (non-goal,
  §6) — AI behavior becomes more legible over a campaign (a warlike-seeming AI civ now visibly gets
  *more* warlike when it's winning and *more* cautious when it's losing, rather than a flat trait-only
  rule), which benefits every age/skill band without requiring any UI literacy to notice.
- **Difficulty modes:** confirmed orthogonal in §5 — no new challenge-tier branch anywhere.
- **Computer players:** this is the entire surface area of the change; §3/§5 above are the direct
  answer for how AI-vs-AI and AI-vs-human interactions change.
- **UI/UX:** none — no new panel, no new copy, no changed existing copy.
- **Architecture/extensibility:** a ninth `NationalIntentPosture` field for a future intent-driven
  surface follows the exact same pattern established here and in #1086 — add a field, add a row per
  intent, thread it as a required parameter. No new registry, no new table shape.
- **Data:** three new numeric fields per row in an existing five-row table; no new file, no new asset.
- **SFX:** none — no new event, no new notification.
- **Updating saved games:** none needed (§4) — every change is a pure-function signature addition to
  already-transient, non-persisted computation; confirmed against `save-persisted-shape-ratchet.test.ts`
  during implementation (no new key expected to appear there).
- **Testing / regressions:** §5 enumerates the required fixture classes (tactical-parity,
  recovery-competence, per-surface personality-pair-at-fixed-intent, per-surface
  same-personality-different-intent) — the plan doc turns each into concrete test file/case entries.
- **Solo play / hot seat:** no `currentPlayer`/ownership-check surface touched; every reconciled
  function is already civ-scoped (personality is per-`civType`, read the same way regardless of which
  seat is active), so hot-seat behavior is unaffected structurally, not just by assertion — confirmed
  by grep in §0 that none of the reconciled files reference `state.currentPlayer` or a hardcoded
  `'player'` ownership string.
- **Proper implementation:** correcting an over-claim caught during this same review pass — #1086's
  own `NATIONAL_INTENT_POSTURE.develop` row is *not* an all-neutral/all-1.0 identity value for the
  fields it already carries (`economyRoleWeight: 1.3`, `combatRoleWeight: 0.85`, both non-neutral), so
  "baseline posture reproduces today's exact output" is false and must not be assumed. The correct,
  verified precedent (confirmed by reading #1086's own test updates) is: every existing test whose
  call site gains a new required `posture` parameter gets its **expected value recomputed** for
  `NATIONAL_INTENT_POSTURE.develop` (the conventional default for a test that isn't exercising
  intent-driven behavior specifically) and asserted against the new, correct output — not a claim that
  the old literal value still holds. The plan doc's TDD order reflects this: RED tests assert the
  *new*, posture-multiplied expected value from the start, and existing test files are updated in the
  same commit as their call site's new argument, never left temporarily inconsistent.
