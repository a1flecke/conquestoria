# #910 Vassalage Lifecycle Implementation Plan

> For agentic workers: use superpowers:executing-plans inline. User approval covers execution through one focused PR. Do not delegate. Track steps with checkboxes.

Goal: complete voluntary vassalage and independence with recipient consent for all four human/AI combinations.

Architecture: retain the #901 pending inbox and diplomacy-system.ts mutation boundary; special vassalage/independence dispatches apply all returned effects. Keep AI consent a cycle-free scalar leaf. UI/controllers consume canonical legality and current-state outcomes. Protection transitions originate in shared war/attack code; turn processing only advances already-created obligations.

Tech stack: TypeScript, Vitest/jsdom, serializable GameState, EventBus, Vite, IndexedDB/localStorage saves.

Spec: ../specs/2026-09-05-issue-910-vassalage-lifecycle-design.md. Initial audited base 064485a3; final implementation rebased to 085fa459. Tasks 1–5 are implemented; Task 6 records final review and delivery.

## Files and ownership

- src/core/types.ts: independence request/action/event discriminators.
- src/systems/diplomacy-system.ts: eligibility, scalar effects, formation/end/war commitment, pending dispatch and protection turn processing. Preserve existing exported pure helper compatibility; no cycle-creating separate lifecycle module.
- src/ai/ai-treaty-consent.ts: one pure evaluateVassalageConsent policy.
- src/ai/ai-diplomacy.ts and src/ai/basic-ai.ts: personal-era, current-state, valid-candidate offer selection; live proposal/war/protection execution.
- src/core/turn-manager.ts: canonical count/tribute/protection/independence integration.
- src/systems/combat-reward-system.ts, src/app/controllers/player-action-controller.ts: military-attack and combat-declaration sources.
- src/systems/minor-civ-actions.ts and src/systems/minor-civ-coalition-system.ts only for vassal war restrictions/obligations at their existing state transition, without changing minor-civ strategy or mobilization.
- src/systems/civilization-elimination-system.ts: clear protection when freeing vassals.
- src/ui/vassalage-controls.ts: focused DOM helper for formation copy, incoming decisions, active status, defend/petition/release. Real diplomacy panel calls it in this PR.
- src/ui/diplomacy-panel.ts: use shared eligibility, remove generic vassalage Break, mount focused controls without duplicating inbox rows.
- src/app/controllers/diplomacy-actions-controller.ts: canonical dispatch, truthful stale responses and rerender; reuse treaty callbacks for independence requests.
- src/app/controllers/turn-flow-controller.ts: remove diplomacy-panel before the handoff veil.
- src/ui/notification-routing.ts, src/presentation/register-diplomacy-presentation.ts, src/ui/advisor-system.ts: role-specific recipient delivery and truthful advisor triggers.
- src/storage/vassalage-normalization.ts and src/storage/save-migrations.ts: schema 27 migration plus additive normalization of current-version malformed data; no transition side effects. Schema 26 remains city bombardment from the rebased base.
- Mirrored tests for every changed area plus tests/systems/helpers/vassalage-fixture.ts, tests/systems/vassalage-lifecycle.test.ts and tests/integration/vassalage-lifecycle.test.ts.

## Canonical API contract

Formation check returns {ok:true} or {ok:false, reason:string}. It validates living/owned-city/contact/peace/role/peak/personal-era conditions. Request lookup/deduplication is separate so acceptance can ignore its own pending record without relaxing legality.

    getVassalageMilitaryCount(state, civId): number
    getVassalageEligibility(state, vassalId, overlordId): VassalageEligibility
    proposeVassalage(state, vassalId, overlordId, bus): GameState
    commitVassalageAgreement(state, vassalId, overlordId, bus): GameState
    canPetitionIndependence(state, vassalId): boolean
    proposeIndependence(state, vassalId, overlordId, bus): GameState
    resolveIndependence(state, vassalId, overlordId, accepted, bus): GameState
    releaseVassal(state, overlordId, vassalId, bus): GameState
    declareMajorWar(state, attackerId, defenderId, bus?): GameState
    applyVassalageWarConsequences(before, after, bus?): GameState
    processVassalageTurn(state, bus): GameState

Formation exports are reachable via applyDiplomaticAction('offer_vassalage'); acceptance dispatches on treatyType and pending type. All no-op failures preserve the input object except request removal when an owned stale request is answered. Make scalar policy input explicit:

    evaluateVassalageConsent({ relationship, diplomacyFocus, militaryCount, vassalCount, warCount })

Accept iff relationship >=0, focus >=0.3, warCount <=1, militaryCount >=2*(vassalCount+1). It receives neither GameState nor hidden counterpart information.

## Task 1 — consent and formation

- [x] Create a deterministic fixture with three living contacted civs, owned cities/warriors, personal era 2, proposer peakCities=3/currentCities=1, peakMilitary=6/currentMilitary=1. Parameterize isHuman on proposer/recipient. Do not rely on global era or hidden unit observations for legal eligibility.
- [x] Add failing lifecycle tests using existing applyDiplomaticAction so failure proves the actual dead path. Representative assertions:

      const pending = applyDiplomaticAction(state, 'vassal', 'overlord', 'offer_vassalage', bus);
      expect(pending.pendingDiplomacyRequests).toHaveLength(1);
      expect(pending.civilizations.vassal.diplomacy.vassalage.overlord).toBeNull();
      const accepted = acceptDiplomaticRequest(pending, 'overlord', pending.pendingDiplomacyRequests![0].id, bus);
      expect(accepted.civilizations.vassal.diplomacy.vassalage.overlord).toBe('overlord');
      expect(accepted.civilizations.overlord.diplomacy.vassalage.vassals).toEqual(['vassal']);
      expect(accepted.defensiveLeagues).toEqual([]);
      expect(pending.defensiveLeagues).toHaveLength(1);

- [x] Run ./scripts/run-with-mise.sh yarn test --run tests/systems/vassalage-lifecycle.test.ts; expect failures for absent request/commit. Record intended red result.
- [x] Implement the named legality and formation functions in diplomacy-system.ts; derive personal era with resolveCivilizationEra; count owned combat-role units consistently. Add shared tribute/protection constants. Apply pure acceptance outputs including leagueUpdates once, reset new vassal protection, join existing overlord wars, seed existing hostile obligations, and remove conflicting pending formation requests. Emit only generic treaty events for formation.
- [x] Extend accept/reject request dispatch, enforce TTL at action time and remove invalid owned requests without mutation/success events. Enqueue deduplicates live requests after pruning.
- [x] Add tests for self, missing/eliminated/cityless/unmet parties, bilateral war, era-only/peak-only near misses, exact 50%, already-vassal/nesting, multiple independent vassals, reversed duplicate, unrelated treaty coexistence, wrong/proposer/third actor, expired/stale strength eligibility, duplicate accept and no partial league mutation.
- [x] Run focused new lifecycle plus diplomacy-system/vassalage/negative/league tests; expected all pass. Inspect source diff.

## Task 2 — AI consent and live offer path

- [x] First add pure policy tests for all bounds and rejection reasons; add actor-matrix lifecycle tests for human→AI and AI→AI acceptance/refusal, difficulty parity and hidden foreign-state invariance.
- [x] Run ai-treaty-consent and new lifecycle tests; confirm intended red assertions.
- [x] Implement evaluateVassalageConsent exactly as above; call it from proposeVassalage for AI recipients. Evaluate legality before policy. Use normal treaty-declined event on a real AI refusal.
- [x] Replace basic-ai's ignored offerVassalage/notification-only block with proposeVassalage. Filter otherStrengths through current legality, use current civ and personal era, preserve the existing <40% perceived strength offer rule. Guard already-vassal/overlord AI offers. Route major declarations through the shared war owner.
- [x] Add a real processAITurn regression causing an eligible weak AI to offer to a human and another AI; inspect pending/active state, exactly one event, deterministic repeat. Test an unmet/illegal strongest target is excluded and no hidden foreign unit affects recipient policy.
- [x] Run tests/ai/ai-diplomacy.test.ts, tests/ai/ai-treaty-consent.test.ts, tests/ai/basic-ai.test.ts and new lifecycle tests. Expected pass; inspect diff.

## Task 3 — protection, restrictions and exit

- [x] Add failing source/turn tests: human/AI war against a vassal creates its 3-turn timer; same attacker does not refresh; response or peace clears; expiry subtracts 20 and emits once; <=20 releases; ordinary unrelated wars unchanged. Add attack-source coverage, overlord-war join, and vassal independent war/treaty blocking.
- [x] Implement declareMajorWar and explicit before/after applyVassalageWarConsequences. Hook real major declarations, combat attacks, and minor diplomacy war transitions. Apply forced wars without treachery and avoid recursive league cascades. Keep human protection optional; AI defends through same canonical action. Admission seeds obligations for existing wars without re-emitting historical war events.
- [x] Add failing human-owned independence tests: no automatic human petition; AI vassal→human overlord queues; correct human can grant/refuse; wrong actor cannot; refusal is war and +20 treachery; stale/expired petition never causes war. Add peaceful release +40 overlord treachery, invalid exit, elimination and next-turn no-tribute checks.
- [x] Extend request type with independence and action with release_vassal/defend_vassal. Use existing shared inbox/TTL and callbacks. canPetitionIndependence uses current owned counts and existing threshold. Human vassals invoke it explicitly; AI vassals auto-propose. Human overlords decide themselves; AI preserves focus >0.5 peaceful decision. Expiry is a removal, not a refusal. Clear role/treaty/timers/related requests atomically; filter conflicting bilateral treaties on independence war. Do not reinstate former leagues.
- [x] Replace the old automatic turn-manager vassalage block with processVassalageTurn, preserving economic phase ordering. Clamp tribute input at zero. Update elimination cleanup for protection reset.
- [x] Run affected system mirrors, player-action-controller, AI and m4b1 integration tests plus new lifecycle integration. Expected pass. Review resulting live entry points, not only helpers.

## Task 4 — player UI, controller truth, notification privacy

- [x] Write failing jsdom/controller tests that click Offer, Accept, Decline, Defend, Petition, Grant/Refuse and confirmed Release. Assert the visible refreshed panel and role/effect text, not only arrays. Assert wrong-viewer/third-party absence and no generic vassalage Break. Repeated detached clicks cannot repeat actions. Stale Accept must not report signed.
- [x] Add src/ui/vassalage-controls.ts using createGameButton, textContent, actor-specific aria-labels, effect summary and shared constants. Every eligible counterpart remains reachable. Mount it in each live diplomacy row; suppress duplicate generic vassalage proposals/actions/treaties. Keep unrelated treaty rows intact.
- [x] Route actions through diplomacy-actions-controller. Reuse accept/decline treaty callbacks for typed independence requests; determine success from validated current state, not object identity alone or button intent. Restore focus to the refreshed diplomacy panel after response. Guard handleBreakTreaty against vassalage bypass.
- [x] Add failing real beginHotSeatHandoff test with a mounted private diplomacy panel; remove it synchronously before veil. Verify P2 can open and answer the pending offer after handoff and P1's notification stays private. Extend recipient delivery/SFX tests, registrar tests and notification routing with role/end/protection text. Do not send both generic and bespoke acceptance notifications.
- [x] Replace advisor hidden-rival-count hint with an actual incoming offer trigger; self-offer advice uses canonical current eligibility and includes tribute cost. Add negative advisor coverage.
- [x] Run all changed UI/controller/presentation mirrors, notification-delivery, panel-actions-controller and turn-flow-controller tests. Expected pass.

## Task 5 — persistence and integration

- [x] Add failing serialize/deserialize and migration tests for formation pending, human independence pending, active vassalage, timers, league state, released state, schema 0/24/current, malformed arrays/IDs/numbers, idempotence, future schema rejection, and no load event/payment/league mutation. Compare acceptance and next-turn results after reload with uninterrupted state.
- [x] Add schema 27 after rechecking the rebased current version. Implement vassalage-normalization.ts as a pure data normalizer; invoke versioned migration and safe additive normalization for already-current saves. Default missing nested records, clamp scores/counts, dedupe valid timers/request IDs, drop invalid request kinds/roles/TTL/dangling IDs. Preserve valid active relationships; never create bilateral consent or rebuild leagues during load.
- [x] Add exact processTurn comparison for tribute: accepted versus pending/declined/released, both actor orders, positive/zero/negative income, rounding; positive tribute must be removed from vassal and credited to overlord once. Use stable owned-city integration fixtures and avoid AI actions perturbing the economic assertion.
- [x] Run storage mirrors, integration lifecycle/m4b1, game-state/turn tests where available. Run src rule checks for every changed source file.

## Player Truth Table and misleading UI risks

| Before | Click | Immediate result | Still reachable |
|---|---|---|---|
| Eligible, no request | Offer | Pending pill or AI outcome; no false active treaty | All other eligible counterparts/treaties |
| Recipient owns live offer | Accept | Request removed, active role/effects | Status, defend and valid exit actions |
| Recipient owns offer | Decline | Request gone; no active role | Other requests/actions |
| Recipient sees stale DOM | Accept | No longer available; no signed toast | Current valid panel actions |
| Vassal meets threshold | Petition | Pending request/AI decision with war-risk text | Status and existing obligations |
| Overlord receives petition | Grant / Refuse | Independence / war, bilateral cleanup | Ordinary post-end diplomacy |
| Overlord owns active vassal | Confirm Release | Released, +40 cost visible | Ordinary diplomacy |
| P1 panel open | End turn | Panel disappears before veil | P2-only inbox after handoff |

“Eligible” requires every canonical condition; global-era-only, exact-half loss, nested, unmet, dead, conflicting and stale cases must stay out. “Incoming” is recipient-owned, “pending” never implies treaty signed. Protection text must describe the actual income stage and response window, not a net-income promise or automatic protection. Petition refusal means war and is labeled explicitly. No UI-only gameplay rules.

Interaction replay: offer → repeated click → reopen → recipient handoff → accept/decline → reopen; repeat after saved reload; stale ID after expiry; active defend; petition → handoff → grant/refuse; confirmed release; third viewer sees no private controls. Assert actual DOM after each relevant interaction. Inbox is a set of expiring decisions, not a production queue; show expiry, no invented order/ETA or reordering controls.

## Task 6 — inline implementation review, verification and delivery

- [x] Review actual committed and uncommitted diffs against origin/main across all 18 dimensions below. Fix findings, rerun only affected focused tests and update both docs to match the result.
- [x] Run live browser interaction QA for AI→human, human→AI and hot-seat, using a deterministic development fixture only if existing repository conventions permit. Run ./scripts/run-with-mise.sh yarn test:web-smoke. Record any environmental limitation honestly.
- [x] Run git diff --check and scripts/check-src-rule-violations.sh with every changed src path. Inspect full source diffs and git diff --stat origin/main...HEAD plus git diff --stat.
- [x] Commit focused Conventional Commits, mark implemented steps accurately; do not label anything merged before PR merge.
- [x] Run ./scripts/run-with-mise.sh yarn build separately. Because storage boundaries changed, run ./scripts/run-with-mise.sh yarn build:tauri and confirm web /conquestoria/ versus desktop relative paths. Native packaging is unchanged.
- [ ] Run ./scripts/run-with-mise.sh yarn test:durable and then ./scripts/run-with-mise.sh yarn test:durable:status for final HEAD/working tree. Preserve session IDs and poll incomplete runs; no equivalent concurrent retry. After two materially similar failures, report the blocker instead of blind retry.
- [ ] Push the branch once; observe complete hooks/exit or verify remote SHA. Open one PR closing #910 only if complete, with architecture, audit deviations, actor matrix, consequences, AI visibility/difficulty, hot-seat, schema, all review fixes, validation and explicit exclusions. Do not merge.

## Inline implementation-plan review

| Dimension | Finding | Severity | Plan correction |
|---|---|---|---|
| Balancing gameplay | Integration seeded acceptance hides reverse tribute on loss | High | Task 5 exact positive/zero/negative comparison |
| Fun | One-way acceptance exposes no recovery choice | High | Task 3 before UI delivery; complete petition/release together |
| New mechanics | Petition denial is destructive, unlike ordinary decline | High | Separate typed request dispatch and explicit refusal-war tests |
| Ages 7–43 | Generic treaty row does not explain roles | High | Focused DOM helper with plain first sentence and details |
| Play styles | All-vassal collection lacks obligation cost | Medium | Capacity policy and real response timers before shipment |
| Difficulty | Tests could exercise global-era fixtures accidentally | High | Explicit personal-era negative case and challenge invariance |
| Computer players | Unit evaluator tests alone leave event-only basic-ai path | High | Real processAITurn state assertions in Task 2 |
| UI | Isolated new helper could be dark code | High | Mount in live diplomacy panel in same task/PR |
| UX | Controller success toasts mask failed stale commits | High | Current-state outcome plus DOM/focus regression |
| Architecture | New lifecycle module could import-cycle with diplomacy | Medium | Keep GameState mutation boundary in existing system |
| Extensibility | Need only one extra request discriminator | Low | Reuse ID/TTL and response callbacks, no parallel inbox |
| Data | Accepting another offer invalidates pending role assumptions | High | Prune conflicting formation offers atomically |
| SFX | Duplicate routed events would sound twice | Medium | Generic formation event family, recipient-only outcome routes |
| Saved games | Merely JSON round-tripping avoids real normalizers | High | Actual serialize/deserialize and old/current malformed fixtures |
| Testing | Helper-only checks cannot prove human war bypass blocked | High | Player-action-controller and AI source parity tests |
| Solo regressions | Peace/treaty code shared with new dispatch | High | Existing all-treaty mirrors preserved in final focused set |
| Hot-seat regressions | Switching currentPlayer in a fixture misses stale DOM | High | Actual beginHotSeatHandoff with mounted panel |
| Proper implementation | A partial UI PR could expose broken actions | High | One focused PR after all tasks/review/verification |

## Inline implementation review

| Dimension | Implemented result and review finding | Disposition |
|---|---|---|
| Balancing gameplay | Tribute uses `floor(max(0, income) * 0.25)` at the pre-maintenance revenue stage; positive, rounded, zero, and negative cases run through real turns. | Verified; no balance constants changed. |
| Fun | Both roles have visible exits: threshold petition, protection breakaway, and overlord release. | Verified in lifecycle, obligation, UI, and browser flows. |
| New mechanics | Independence uses the existing recipient-owned inbox with a typed request; refusal alone begins war. | Fixed expired/malformed requests so silence cannot become refusal. |
| Ages 7–43 | The live panel explains who pays, who protects, the response window, and the consequences before action. | Copy reviewed at desktop and mobile viewport. |
| Play styles | Human protection remains a choice; AI protection uses the same action; multiple vassals increase AI consent capacity requirements. | Verified with multiple-vassal and actor-role tests. |
| Difficulty | Legal eligibility uses personal era and canonical owned combat roles; AI consent ignores challenge setting and hidden foreign rosters. | Verified across Explorer, Standard, and Veteran. |
| Computer players | `processAITurn` submits real offers and shared wars. Review found a late embargo/league bypass for an established AI vassal. | Fixed with a current-role guard and failing-first regression. |
| UI | The dedicated control mounts in every live diplomacy row and generic vassalage rows/actions are suppressed. | Verified by jsdom and Playwright interaction. |
| UX | Buttons disable after use, release requires confirmation, stale responses report unavailable, and the refreshed panel receives focus. | Verified; no optimistic “signed” message remains. |
| Architecture | State mutation stays in diplomacy/combat/minor-civ owners; presentation only routes recipient-scoped events. | Review found a map-entry raw war path and replaced it with `declareMajorWar`. |
| Extensibility | One new pending-request discriminator and shared constants cover all roles, timers, and UI text. | No parallel queue or ID-specific AI branch added. |
| Data | Formation/end mutations update both role records, treaties, leagues, timers, and related requests atomically. | Fixed forced wars to remove incompatible bilateral treaties. |
| SFX | Formation reuses one generic accepted event; protection and exit routes add no custom duplicate cue. | Delivery tests assert recipient scope and no extra SFX. |
| Saved games | Schema 26 normalizes only data; schema 25 remains Federal Autonomy after rebase. | Fixed malformed nonpositive/NaN timers so loading cannot restart protection. |
| Testing | Exact behavior is covered at pure, system, controller, storage, integration, and browser layers. | Real human/AI city-capture parity and minor-civ alliance cleanup added. |
| Solo regressions | AI offers, consent, protection, war restrictions, and economy all execute through shipped turn paths. | Focused legacy diplomacy/AI/economy suites remain green. |
| Hot-seat regressions | The diplomacy panel closes before the privacy veil and the recipient can answer after handoff. | Verified through controller and browser flows. |
| Proper implementation | No dark helper, UI-only mutation, inferred hidden strength, or load-time transition remains. | Full source diff reviewed after rebasing to 085fa459. |
