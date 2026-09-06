# #910 — bilateral vassalage lifecycle

Status: implementation complete, final verification pending. Initial audit base: 064485a3; final rebase base: 085fa459 (origin/main), 2026-09-05. #910 is open; #901 was delivered by #913; #958 has now merged. Work runs inline in the dedicated codex/issue-910-vassalage-lifecycle worktree. The user approved the full audit → design/review → plan/review → implementation/review → verification → PR scope.

## Current-main audit

This numbered inventory answers the assignment's audit questions. Historical sources are the March 21 game design, March 29 milestone design, March 31 M4b1 design, April 3 M4b1 plan, and August 29 #901 design/plan. Current code takes precedence over historical descriptions of shipped behavior.

| Questions | Verified answer |
|---|---|
| 1–2 | VassalageState has overlord: string or null; vassals: string array; protectionScore: number; protectionTimers: {attackerCivId, turnsRemaining} array; peakCities and peakMilitary: numbers. Every civ owns this record. Protection belongs to each vassal, though onVassalAttacked misleadingly names its argument overlordDip. |
| 3–7 | acceptVassalage is a pure low-level helper in diplomacy-system.ts. It returns vassalState, overlordState and optional leagueUpdates. It adds a permanent vassalage treaty and history event to both sides, sets overlord, appends the vassal, and computes the full league array after forced departure. No current production caller applies its result. |
| 8–12 | endVassalage needs both diplomacy records and IDs, removes both treaty records and links, and resets the vassal's protection. petitionIndependence ends the agreement: acceptance adds +10 bilateral relationship; refusal adds bilateral war, -50 relationship change and +20 vassal treachery. It currently runs automatically for humans too. An overlord release action is not wired; the historical treachery table assigns abandonment +40. Other treaties survive peaceful acceptance/end; the existing war helper does not remove all conflicting treaty records. |
| 13–15 | The shape permits nesting and unlimited vassals; neither low-level acceptance nor scalar eligibility prevents cycles or enforces a numerical cap. There is no existing cap to preserve. The new live validator must prohibit being both a vassal and an overlord. Multiple independent vassals remain allowed. |
| 16–22 | canOfferVassalage requires personal era >=2, peakCities >=2, and current cities OR military strictly below 50% of peak. It checks no target, relationship, contact, war, or role. From is the prospective vassal, to the prospective overlord. evaluateVassalage offers to the strongest perceived nonenemy only when own perceived strength <40% of theirs. There is no overlord acceptance evaluator. Scalar legality has no difficulty input. |
| 23–26 | PendingDiplomaticRequest has id, type: peace/treaty, optional treatyType and turnsRemaining, fromCivId, toCivId, turnIssued. Treaty IDs include roles, type and turn. Enqueue deduplicates pair/type in either direction. TTL is 10 world turns; pruneExpiredDiplomaticRequests runs during world turn processing. Acceptance itself currently omits the TTL check. |
| 27–35 | The diplomacy panel lists recipient-owned incoming requests and expiry labels; controllers call acceptDiplomaticRequest/rejectDiplomaticRequest with currentPlayer and ID. Generic commit checks parties, contact, war and duplicate treaty. proposeTreatyAgreement evaluates AI recipients immediately, and queues for human recipients regardless of proposer. Notifications use recipient-scoped delivery and deferred hot-seat logs. The #901 planned diplomatic-agreement-system.ts never shipped; actual functions are in diplomacy-system.ts. |
| 36–45 | basic-ai calls offerVassalage, ignores its metadata result, then emits vassalage-offered. It writes no pending state. No presentation listener consumes this event. acceptDiplomaticRequest explicitly rejects treatyType vassalage. getAvailableActions lists offer_vassalage too broadly, the panel renders it, but applyDiplomaticAction has no case, so it is a dead action. No live actor combination can complete acceptance. |
| 46–50 | processTurn passes totalGold after city/route/tech/alliance receipts and outpost upkeep, before later treasury upkeep/strain. processVassalageTribute floors income*0.25; it currently allows negative tribute. The turn loop deducts tribute and accumulates the same amount in grossGoldByCiv for the overlord, independent of iteration order or human status. It is an income levy, not a treasury levy and not 25% of final net treasury change. |
| 51–54 | A three-turn timer per attacker is intended; expiry subtracts 20 protection. processProtectionTimers ticks vassals; no production source calls onVassalAttacked, and no live path clears a satisfied timer. No obligation UI exists. Low-level tests explicitly preserve a response window instead of an unavoidable automatic overlord declaration, resolving conflicting old prose. |
| 55–59 | The vassal leaves its current league without treachery; a league below two members dissolves. The overlord's league is unchanged. The pure helper returns the complete changed league list; no live atomic commit exists. A failed new commit must leave all leagues and both civs untouched. |
| 60–63 | Existing pending and active structures serialize. Vassalage treaty requests need no new fields. Schema is 24. normalizeLoadedState defaults only the whole pending array; migrations default only an absent diplomacy record. Malformed nested vassalage/request data is not normalized today. Human-owned independence consent needs a distinct request kind, which the old peace/treaty union cannot truthfully encode. |
| 64–67 | Incoming treaty controls filter by currentPlayer. beginHotSeatHandoff closes network and other special surfaces but does not explicitly remove diplomacy-panel. Its anonymous veil and notification delivery already isolate recipient logs/audio. The vassalage calculations have no currentPlayer dependency, but AI/turn code uses global era or automatic human decisions at some seams. |
| 68–71 | diplomacy-vassalage.test.ts has 22 low-level tests; m4b1-diplomacy-integration.test.ts seeds acceptance directly and weakly checks income/elimination. Extend diplomacy-system, ai-diplomacy/basic-ai, ai-treaty-consent, diplomacy-panel, diplomacy-actions-controller, turn-flow-controller, notification-routing/delivery, register-diplomacy-presentation, save-manager/migrations. Missing coverage spans all four live actor combinations, consent ownership, stale/TTL/duplicates, exact tribute, protection triggers, rendered exits, active load and real handoff. |

## Product and scope

A vulnerable civilization can choose protection over elimination. First explain: “Egypt offers to become your vassal. You protect them and receive part of their income.” Exact rules remain available alongside the action. The proposer offers itself; nobody demands another civ's submission.

Scope includes formation, response, invalidation/expiry, status, protection, tribute, restricted diplomacy, independence and overlord release. Keep the existing thresholds and 25% rate. No Open Borders movement, bargaining, forced capitulation, city transfers, new currencies, new leagues, minor-civ mobilization, assets, or bespoke audio.

## Lifecycle and ownership

| Proposer | Recipient | Path |
|---|---|---|
| Human prospective vassal | Human prospective overlord | Validate → enqueue → private recipient turn → accept/decline → revalidate → commit |
| Human prospective vassal | AI prospective overlord | Validate → deterministic recipient evaluation → commit or decline |
| AI prospective vassal | Human prospective overlord | AI chooses offer → same validator/enqueue → recipient decision |
| AI prospective vassal | AI prospective overlord | AI chooses offer → same recipient evaluator → commit or decline |

State transitions: eligible → pending → accepted/declined/expired/invalidated. Only the recipient can answer a request. An accepted click is an intention: validate the latest state before committing. Repeated clicks and reciprocal proposals cannot duplicate agreements. Clear conflicting pending formation offers when a proposer becomes a vassal. Expiry removes a request without interpreting silence as consent or refusal.

One public proposal API and one GameState-level commit owner live beside the #901 lifecycle in diplomacy-system.ts. Generic treaty commitment continues excluding vassalage. A special dispatcher wraps the existing pure acceptVassalage helper and applies both civ updates, treaties, league changes and initial obligations in one returned state. Controllers never patch these pieces. No new general agreement framework or inbox.

## Eligibility and AI

Formation requires distinct living major civs with owned cities, contact, bilateral peace, proposer personal era >=2, established peak eligibility, and no existing vassal relationship or nested overlord role. Recipient must be independent. A duplicate pair/type request or treaty blocks another proposal. Revalidate all of these at acceptance. Scalar loss thresholds remain strict below-half, not <=half. No relationship gate is invented as a legal restriction.

“Stronger” remains strategic advice and the existing AI offer threshold, rather than exposing exact hidden armies through a new legal comparison. Human recipients can judge the risk themselves. AI offer generation retains its perceived-strength rule, filters candidates through canonical legality, and uses personal era. An AI overlord accepts only with nonnegative recipient relationship, diplomacyFocus >=0.3, at most one active war, and at least two owned combat units per proposed/current vassal. This modest capacity policy gives a poor offer a deterministic refusal without reading foreign units, economy, cities, map, or arsenal. It is AI judgment, not a player cap. Use one pure scalar evaluator for human→AI and AI→AI; no RNG or difficulty inputs.

Explorer, Standard and Veteran share legal/economic rules and this initial consent policy. No numerical score or hidden detail is shown. AI uses its existing perception for offers and owned state for acceptance/protection. New ongoing protection duties make acceptance consequential; no payoff buff is added.

## Obligations and ending

Tribute is floor(max(0, eligible income)*0.25), from the existing turn income stage. No tribute before acceptance or after end. Clamp negative input so a poor vassal cannot receive a reverse transfer. Keep treasury upkeep/debt behavior unchanged. Use one shared rate and effect text.

Protection timers belong to the attacked vassal. Start them at actual war/attack transitions and for existing enemies at formation; do not infer repeated events from final-state scans. The overlord has three world turns to join the war; joining, or the vassal making peace, clears the timer. Expiry subtracts 20 once and notifies both parties; <=20 protection ends the relationship peacefully. Human overlords get an explicit Defend action; AI overlords answer live obligations deterministically. Newly joined overlord wars bring vassals in without treachery. Shared helpers serve player diplomacy, player combat declarations, AI and turn processing; civilian/minor-war buttons cannot bypass vassal restrictions.

Independence uses the existing count-based 60% threshold reduced by 10 percentage points per 20 lost protection, including the existing zero-overlord-force case. Human vassals choose when to petition; only AI vassals auto-petition. Human overlords receive a typed independence request in the existing inbox. Granting releases peacefully with +10 bilateral relationship. Refusal causes independence war, -50 bilateral relationship change and +20 vassal treachery; both the petition and refusal controls warn about war. An expired or stale petition does not cause war. AI overlords retain the existing diplomacyFocus >0.5 peaceful-grant rule. Overlords can also abandon/release a vassal with the historical +40 treachery cost, clearly confirmed. End clears both links/treaties, vassal timers and related requests; it never silently restores the old league. Missing/eliminated overlords free dependents. Existing wars remain except the new independence-war transition.

## Player Truth Table

| Viewer / before | Action | Internal change | Immediate visible truth |
|---|---|---|---|
| Eligible proposer | Offer Vassalage, after reading role/effects | Request or AI response | “Offer sent” or accepted/declined; pending is never active status |
| Recipient with pending offer | Accept | Revalidated atomic commit | Request gone; “Overlord of Egypt”; tribute/protection/league summary |
| Recipient with pending offer | Decline | Request removed only | Row gone, no tribute/timers/league change |
| Recipient with stale offer | Accept | Remove invalid request | “Offer is no longer available”; no success toast |
| Active vassal | Inspect counterpart | None | “Vassal of Rome”, tribute, independence threshold, diplomatic limits |
| Active overlord | Inspect vassal | None | Role, protection score, outstanding response timers; Defend action |
| Eligible human vassal | Petition for Independence | Recipient-owned request or AI decision | Pending petition and refusal-war warning, or completed result |
| Human overlord | Grant / Refuse Independence | Canonical peaceful or war end | Both role links disappear; clear peace/war outcome |
| Overlord | Confirm Release Vassal | End +40 treachery | Released status and cost; no future tribute |
| Third civilization | Open Diplomacy | None | No private offers/decisions between others; own known relationships only |
| Hot-seat P1→P2 | Handoff | Close diplomacy panel before veil; switch viewer | P1 sees no P2 controls; P2 sees its incoming offer after handoff |

All actionable eligible counterparts remain reachable. Buttons use createGameButton and 44px targets. Use textContent for new content, actor-specific accessible labels, focus the refreshed panel after resolution, and suppress repeated detached-button activation. Exact request IDs are always revalidated against current state. A generic “Break” control must not operate on a vassalage treaty and leave links behind.

## Data, saves and notifications

Formation fits existing treaty requests. Independence adds type: independence to PendingDiplomaticRequest, reusing IDs, roles and turnIssued; no additional inbox or arbitrary payload. Use schema 27 after the final rebase because schema 26 now belongs to city bombardment; the durable request discriminator and nested-data normalization require the next slot. Migration is idempotent, defaults missing nested fields, clamps finite scores/counts, filters malformed/dangling requests and timers, and never accepts, pays tribute, starts timers or changes leagues on load. Preserve valid pending IDs/expiry and active links/treaties unchanged. Test schema 0, 24, 25, current, malformed and future rejection at actual persistence boundaries.

Use generic treaty-proposed/accepted/declined for formation, with role-specific wording; retire the event-only offer call. Use transition events for independence request, end and protection changes, and one recipient-scoped notification route per transition. No duplicate vassalage-accepted plus treaty-accepted announcement. Existing notification delivery handles log, deferred hot-seat display and generic SFX; no custom sound. Hidden AI↔AI activity must never toast or sound for a human. Text carries every important consequence.

## Balance, alternatives and risks

25% can snowball, but vassals must previously have expanded and lost over half of one peak measure, cannot nest, keep their own economy, can recover independence, and create war exposure. There is no historical numeric cap; adding one needs separate balance evidence. AI capacity avoids indiscriminate collection. Deliberate army deletion to qualify is possible under the old rule; preserve it rather than invent a new economy. Conquerors gain a non-elimination choice; diplomats/traders trade trust and tribute for obligations; builders and tall/defensive players gain survival; wide players take a real protection burden; optimizers see exact costs; younger players get plain role text and confirmations. Refusal-war and +40 abandonment costs prevent a misleading “free undo”.

Alternatives rejected: a second offer queue duplicates #901 privacy/persistence; generic signTreaty cannot apply league/role consequences; encoding independence as peace or a zero-duration vassalage treaty obscures its semantics; unconditional automatic protection contradicts the tested three-turn choice; allowing turn AI to decide for humans violates consent. The chosen approach adds only necessary special dispatches.

Performance: scalar consent is O(owned units + own relationships); reuse AI perception already computed for offer selection. Pending prune/dedupe is O(requests). Protection is bounded by vassal/attacker pairs. Do not add all-map scans. The canonical military count can read owned unit IDs. UI is read-only and computes common eligibility once per counterpart.

## Testing and acceptance

Required proof: all four live actor combinations; strict conjunctive eligibility with near misses; no early effect; own/third-party rejection; stale/expired/duplicate acceptance; bilateral treaty/link/league atomicity; no nesting; deterministic hidden-state-invariant AI and difficulty parity; precise positive/zero/negative/rounded tribute after real turns; protection source, response, expiry and auto-breakaway; human-owned independence and refusal war; release/elimination cleanup; rendered action and immediate refresh/focus; private real handoff and delivery/audio; pending/active/protection/ended save round trips without load effects; generic NAP/Trade/Open Borders/Alliance/Arms Control/peace regressions. Run source checks, mirrored focused tests, web smoke, production build and durable current-HEAD suite. Storage/import boundary changes additionally require Tauri frontend build and asset path checks; native packaging is unchanged. Review both committed and uncommitted diffs. The PR may close #910 only after all applicable assignment criteria pass and this document matches implementation.

## Inline design review

| Dimension | Finding | Severity | Incorporated action |
|---|---|---|---|
| Balancing gameplay | No existing cap; free protection would make tribute dominant | High | Preserve numbers; wire actual obligations and bounded AI capacity |
| Fun | Auto-end could remove player agency immediately after acceptance | High | Human chooses petition; visibly explain exits |
| New mechanics | Independence cannot be encoded honestly as generic treaty | Medium | Add explicit request discriminator in same infrastructure |
| Ages 7–43 | “Offer Vassalage” can invert perceived roles | High | Plain first sentence and consequence summary before commit |
| Play styles | Survival bargain can become a permanent trap | High | Threshold/petition/release/protection escape paths |
| Difficulty | Global era used by AI changes eligibility | High | Personal era shared with player legality; no difficulty economics |
| Computer players | Notification-only offer; no recipient policy | High | Live proposal path, one owned-data evaluator |
| UI | Broad dead action and generic Break can lie | High | Canonical eligibility; dedicated vassalage status/actions |
| UX | Stale accept always says “Treaty signed” | High | Truthful current-state outcome and immediate refresh/focus |
| Architecture | Pure accept return fields could be dropped | High | Single GameState commit applies both sides and league array |
| Extensibility | Full agreement framework unnecessary | Low | Special dispatch beside #901; pure scalar AI leaf |
| Data | Missing role guards permit cycles | High | Reject nesting, duplicate links and invalid actors before commit |
| SFX | Old event has no listener; dual events risk duplicate cue | Medium | One routed formation event family, recipient delivery |
| Saved games | Malformed nested data and new independence kind | High | Versioned idempotent normalizer, no load transitions |
| Testing | Helper tests miss live lifecycle | High | Real controller/turn/storage/handoff coverage |
| Solo regressions | Automatic petitions decide for human | High | Human action ownership, AI-only autonomous petitions |
| Hot-seat regressions | Diplomacy panel not explicitly closed | High | Remove it synchronously at handoff and assert DOM privacy |
| Proper implementation | Protection argument name contradicts stored owner | Medium | Correct naming, source-owned timers and parity regression |
