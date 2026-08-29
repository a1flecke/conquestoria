# #901 Bilateral Diplomacy Consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every live bilateral treaty and peace proposal target-consensual, deterministic, viewer-safe, and committed through one canonical mutation path.

**Architecture:** Add a neutral agreement lifecycle in `src/systems/` and a cycle-free AI consent evaluator in `src/ai/`. The lifecycle owns legality, duplicate/stale cleanup, pending human requests, and exactly-once commitment; the AI module owns target-side policy. Peace enters the same lifecycle but dispatches to its existing bilateral peace and NetworkPlan cleanup effect. Vassalage remains untouched except for a regression guard because #910 owns its incomplete special lifecycle.

**Tech Stack:** TypeScript, Vitest, EventBus, DOM/jsdom panels, serializable `GameState` saves.

---

## Player Truth Table

| Before | Action | State result | Immediate visible result |
|---|---|---|---|
| Human faces friendly AI | Propose Trade | AI accepts and canonical commit signs both sides once | “Rome accepted your Trade Agreement.” Panel shows active treaty. |
| Human faces hostile AI | Propose Alliance | AI declines; no treaty/request state changes | “Rome declined your Alliance: relations are too strained.” |
| Human A faces Human B | Propose NAP | One recipient-owned pending request; no treaty | “Non-Aggression Pact proposed to Rome.” |
| Human B opens panel | Accept request | Canonical commit signs both sides once and removes pair/type requests | Panel rerenders with active treaty; both logs receive outcome. |
| Human B opens panel | Decline request | Request removed, no treaty | Panel rerenders; both logs receive outcome. |
| Any civ is at war | Propose peace | AI target decides immediately; human target receives request | Accepted peace removes both war records and invalid NetworkPlans. |
| Pending Arms Control | Accept after arsenals changed | Current cap is calculated during commit | Preview and committed cap match current signing-time value. |

## Misleading UI Risks

- A pending proposal must never be rendered as an active treaty.
- “Expires in N turns” uses `max(0, 10 - (state.turn - turnIssued))`; an absent or stale request is not shown as actionable.
- An Arms Control preview is only a current acceptance-time preview, not a promised frozen cap.
- An AI decline reason is qualitative and based only on a public policy category; it must not show a score, hidden units, or exact arsenal.

## Interaction Replay Checklist

- Propose to AI, rerender, and verify accepted/declined state and feedback.
- Propose Human A→B, switch viewer, accept, rerender, and confirm exactly one treaty entry per side.
- Repeat the proposal while pending and verify one request only; issue a reciprocal proposal and verify it does not create a mirror request.
- Open a pending request, decline, reopen the panel, and verify the row is gone.
- Handoff with an open Diplomacy panel and verify the panel and any private proposal text are gone before the next viewer is released.

## Task 1: Agreement domain types and AI target policy

**Files:**
- Create: `src/ai/ai-treaty-consent.ts`
- Modify: `src/ai/ai-diplomacy.ts`
- Modify: `src/core/types.ts`
- Test: `tests/ai/ai-treaty-consent.test.ts`

- [ ] **Step 1: Write failing consent-policy tests**

```ts
it('declines a hostile alliance and accepts a friendly valid NAP', () => {
  expect(evaluateTreatyConsent(hostileAlliance)).toMatchObject({ accepted: false, reason: 'relations-too-strained' });
  expect(evaluateTreatyConsent(friendlyNap)).toMatchObject({ accepted: true });
});

it('uses only target-owned visible context for peace', () => {
  expect(evaluatePeaceConsent({ targetVisibleStrength: 4, proposerVisibleStrength: 10, relationship: -60 })).toEqual({ accepted: true });
});
```

- [ ] **Step 2: Run the new tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-treaty-consent.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Add cycle-free target-policy types and functions**

```ts
export type AgreementKind = Exclude<TreatyType, 'vassalage'> | 'peace';
export type TreatyDeclineReason = 'relations-too-strained' | 'strategic-caution' | 'peace-not-acceptable';
export interface TreatyConsent { accepted: boolean; reason?: TreatyDeclineReason; }

export function evaluateTreatyConsent(input: TreatyConsentInput): TreatyConsent { /* relationship/personality policy */ }
export function evaluatePeaceConsent(input: PeaceConsentInput): TreatyConsent { /* target-visible strength or recovered relationship */ }
```

`ai-diplomacy.ts` delegates its existing proposal policy to this module so no old dead evaluator remains. Add `diplomacy:treaty-declined` and enrich accepted/proposed events only with counterpart ids, agreement kind, and optional public reason; never add score or hidden state.

- [ ] **Step 4: Run focused AI tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-treaty-consent.test.ts tests/ai/ai-diplomacy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-treaty-consent.ts src/ai/ai-diplomacy.ts src/core/types.ts tests/ai/ai-treaty-consent.test.ts
git commit -m "feat(#901): add target-side treaty consent policy"
```

## Task 2: Canonical agreement lifecycle and stale/duplicate legality

**Files:**
- Create: `src/systems/diplomatic-agreement-system.ts`
- Modify: `src/systems/diplomacy-system.ts`
- Test: `tests/systems/diplomatic-agreement-system.test.ts`
- Test: `tests/systems/diplomacy-system.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

```ts
it('queues Human A to Human B without signing and collapses reciprocal duplicates', () => {
  const first = proposeDiplomaticAgreement(state, 'player-a', 'player-b', 'trade_agreement', bus);
  const reciprocal = proposeDiplomaticAgreement(first.state, 'player-b', 'player-a', 'trade_agreement', bus);
  expect(reciprocal.state.pendingDiplomacyRequests).toHaveLength(1);
  expect(reciprocal.state.civilizations['player-a'].diplomacy.treaties).toHaveLength(0);
});

it('revalidates an invalid pending treaty at acceptance without signing', () => {
  const result = acceptDiplomaticAgreement(warStartedState, 'player-b', requestId, bus);
  expect(result.status).toBe('unavailable');
  expect(result.state.pendingDiplomacyRequests).toEqual([]);
});
```

- [ ] **Step 2: Run the new system tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/diplomatic-agreement-system.test.ts`

Expected: FAIL because the lifecycle module does not exist.

- [ ] **Step 3: Implement one proposal and one commit seam**

```ts
export function proposeDiplomaticAgreement(
  state: GameState, fromCivId: string, toCivId: string, kind: AgreementKind, bus: EventBus,
): DiplomaticAgreementResult;

export function acceptDiplomaticAgreement(
  state: GameState, recipientId: string, requestId: string, bus: EventBus,
): DiplomaticAgreementResult;

function commitDiplomaticAgreement(
  state: GameState, fromCivId: string, toCivId: string, kind: AgreementKind, bus: EventBus,
): DiplomaticAgreementResult;
```

The proposal seam verifies contact, current action availability, active treaty state, and pair/type pending state. It queues only a human target; it evaluates an AI target immediately. The commit seam repeats legality checks, removes every matching pair/type request, calculates Arms Control’s cap through `computeArmsControlCap`, signs both treaty sides once, or invokes bilateral `makePeace` followed by `cancelInvalidNetworkPlans` for peace. It must reject `vassalage` at this seam so #910 retains ownership.

- [ ] **Step 4: Replace duplicated treaty/peace signing callers**

`applyDiplomaticAction` delegates its treaty and `request_peace` cases to the lifecycle. `acceptDiplomaticRequest` delegates treaty/peace acceptance to it. Leave unilateral war, treaty-breaking, embargoes, leagues, and vassalage untouched.

- [ ] **Step 5: Run lifecycle and legacy diplomacy tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/diplomatic-agreement-system.test.ts tests/systems/diplomacy-system.test.ts tests/systems/diplomacy-vassalage.test.ts`

Expected: PASS; the vassalage suite proves no accidental lifecycle takeover.

- [ ] **Step 6: Commit**

```bash
git add src/systems/diplomatic-agreement-system.ts src/systems/diplomacy-system.ts tests/systems/diplomatic-agreement-system.test.ts tests/systems/diplomacy-system.test.ts
git commit -m "fix(#901): centralize bilateral agreement consent"
```

## Task 3: Route AI actions through target consent

**Files:**
- Modify: `src/ai/basic-ai.ts`
- Test: `tests/ai/basic-ai.test.ts`
- Test: `tests/ai/basic-ai-treaty-contact-guard.test.ts`

- [ ] **Step 1: Add failing AI-to-AI and AI-to-human tests**

```ts
it('does not let an initiating AI impose an alliance on a hostile target AI', () => {
  expect(processAITurn(hostileAiState, 'ai-1', bus).civilizations['ai-2'].diplomacy.treaties).toEqual([]);
});

it('still queues an AI proposal for a human recipient', () => {
  expect(processAITurn(state, 'ai-1', bus).pendingDiplomacyRequests).toContainEqual(
    expect.objectContaining({ fromCivId: 'ai-1', toCivId: 'player', type: 'treaty' }),
  );
});
```

- [ ] **Step 2: Run the new AI tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/basic-ai.test.ts tests/ai/basic-ai-treaty-contact-guard.test.ts`

Expected: FAIL because AI-to-AI still signs directly.

- [ ] **Step 3: Delegate every live treaty and peace decision**

Replace direct `signTreaty`, `enqueueTreatyProposal`, and direct peace enqueue branches in `processAITurn` with `proposeDiplomaticAgreement`. Preserve AI decision generation, contact guards, deterministic decision ordering, and the #545 known-capability inputs.

- [ ] **Step 4: Run focused AI regressions**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/basic-ai.test.ts tests/ai/basic-ai-treaty-contact-guard.test.ts tests/ai/ai-treaty-consent.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/basic-ai.ts tests/ai/basic-ai.test.ts tests/ai/basic-ai-treaty-contact-guard.test.ts
git commit -m "fix(#901): require target consent for AI agreements"
```

## Task 4: Presentation, controller feedback, and panel replay

**Files:**
- Modify: `src/presentation/register-diplomacy-presentation.ts`
- Modify: `src/ui/notification-routing.ts`
- Modify: `src/app/controllers/diplomacy-actions-controller.ts`
- Modify: `src/ui/diplomacy-panel.ts`
- Test: `tests/presentation/register-diplomacy-presentation.test.ts`
- Test: `tests/app/controllers/diplomacy-actions-controller.test.ts`
- Test: `tests/ui/diplomacy-panel.test.ts`

- [ ] **Step 1: Write failing presentation and DOM replay tests**

```ts
it('renders a recipient-only treaty request with expiry and removes it after decline', () => {
  expect(panel.textContent).toContain('Expires in 10 turns');
  declineButton.click();
  expect(rerendered.textContent).not.toContain('Proposes:');
});

it('delivers an accepted treaty result to both human parties but never a third hot-seat civ', () => {
  expect(deliver).toHaveBeenCalledWith('player-a', expect.stringContaining('accepted'), 'success');
  expect(deliver).toHaveBeenCalledWith('player-b', expect.stringContaining('accepted'), 'success');
  expect(deliver).not.toHaveBeenCalledWith('player-c', expect.any(String), expect.anything());
});
```

- [ ] **Step 2: Run the new presentation/UI tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/presentation/register-diplomacy-presentation.test.ts tests/app/controllers/diplomacy-actions-controller.test.ts tests/ui/diplomacy-panel.test.ts`

Expected: FAIL because accepted/declined events are not routed and expiry text is absent.

- [ ] **Step 3: Add recipient-scoped presentation and truthful feedback**

Register proposed, accepted, and declined agreement events through `notification-delivery`. The controller maps returned outcomes to immediate actor feedback and always rerenders the Diplomacy panel. Panel request rows show treaty/peace effect, recipient-owned controls, and computed remaining turns. For Arms Control, show the current `computeArmsControlCap` preview only to a recipient who can act.

- [ ] **Step 4: Run focused presentation/UI tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/presentation/register-diplomacy-presentation.test.ts tests/app/controllers/diplomacy-actions-controller.test.ts tests/ui/diplomacy-panel.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/presentation/register-diplomacy-presentation.ts src/ui/notification-routing.ts src/app/controllers/diplomacy-actions-controller.ts src/ui/diplomacy-panel.ts tests/presentation/register-diplomacy-presentation.test.ts tests/app/controllers/diplomacy-actions-controller.test.ts tests/ui/diplomacy-panel.test.ts
git commit -m "feat(#901): present bilateral treaty consent outcomes"
```

## Task 5: Hot-seat veil, persistence, and Arms Control regression coverage

**Files:**
- Modify: `src/app/controllers/turn-flow-controller.ts`
- Test: `tests/app/controllers/turn-flow-controller.test.ts`
- Test: `tests/storage/save-persistence.test.ts`
- Test: `tests/systems/diplomatic-agreement-system.test.ts`
- Test: `tests/systems/strategic-arsenal-system.test.ts`

- [ ] **Step 1: Write failing hot-seat and save tests**

```ts
it('closes an open Diplomacy panel before releasing the next hot-seat viewer', async () => {
  await controller.beginHotSeatHandoff(state.hotSeat!, false);
  expect(uiLayer.querySelector('#diplomacy-panel')).toBeNull();
});

it('round-trips a Human A to Human B request and commits Arms Control at accept time', () => {
  const loaded = roundTrip(proposed);
  const accepted = acceptDiplomaticAgreement(loaded, 'player-b', requestId, bus);
  expect(getActiveArmsControlCap(accepted.state, 'player-a')).toBe(currentCap);
});
```

- [ ] **Step 2: Run the new hot-seat/save tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/app/controllers/turn-flow-controller.test.ts tests/storage/save-persistence.test.ts tests/systems/diplomatic-agreement-system.test.ts`

Expected: FAIL because the handoff leaves the Diplomacy panel mounted.

- [ ] **Step 3: Close the panel at the veil boundary and preserve state shape**

Remove `#diplomacy-panel` in `closeNetworkPanelsForHandoff` or an equivalently named handoff-only closer before the blocking veil begins. Do not add a new save schema field: pending requests already serialize and legacy normalization already supplies `[]`.

- [ ] **Step 4: Run hot-seat, persistence, and #545 tests**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/app/controllers/turn-flow-controller.test.ts tests/storage/save-persistence.test.ts tests/systems/diplomatic-agreement-system.test.ts tests/systems/strategic-arsenal-system.test.ts tests/systems/strategic-arsenal-summary-presentation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/controllers/turn-flow-controller.ts tests/app/controllers/turn-flow-controller.test.ts tests/storage/save-persistence.test.ts tests/systems/diplomatic-agreement-system.test.ts tests/systems/strategic-arsenal-system.test.ts
git commit -m "fix(#901): preserve treaty privacy across hot-seat handoff"
```

## Task 6: Rule checks and final verification

**Files:**
- Modify: `docs/superpowers/plans/2026-08-29-issue-901-bilateral-diplomacy-consent.md`

- [ ] **Step 1: Run source-rule checks**

Run: `scripts/check-src-rule-violations.sh src/ai/ai-treaty-consent.ts src/ai/ai-diplomacy.ts src/ai/basic-ai.ts src/systems/diplomatic-agreement-system.ts src/systems/diplomacy-system.ts src/presentation/register-diplomacy-presentation.ts src/app/controllers/diplomacy-actions-controller.ts src/ui/diplomacy-panel.ts src/app/controllers/turn-flow-controller.ts`

Expected: exit 0.

- [ ] **Step 2: Run the complete focused regression set**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-treaty-consent.test.ts tests/ai/ai-diplomacy.test.ts tests/ai/basic-ai.test.ts tests/ai/basic-ai-treaty-contact-guard.test.ts tests/systems/diplomatic-agreement-system.test.ts tests/systems/diplomacy-system.test.ts tests/systems/diplomacy-vassalage.test.ts tests/systems/strategic-arsenal-system.test.ts tests/app/controllers/diplomacy-actions-controller.test.ts tests/app/controllers/turn-flow-controller.test.ts tests/ui/diplomacy-panel.test.ts tests/presentation/register-diplomacy-presentation.test.ts tests/storage/save-persistence.test.ts`

Expected: PASS.

- [ ] **Step 3: Run type/build and durable-suite proof separately**

Run: `bash scripts/run-with-mise.sh yarn build`

Expected: exit 0.

Run: `bash scripts/run-with-mise.sh yarn test:durable`

Expected: durable test execution completes successfully.

Run: `bash scripts/run-with-mise.sh yarn test:durable:status`

Expected: current `HEAD` and working tree are verified passing.

- [ ] **Step 4: Review the complete diff**

Run: `git diff --check && git diff --stat origin/main...HEAD && git diff --stat && git diff origin/main...HEAD`

Expected: no whitespace errors; no remaining direct live `signTreaty` path for #901 agreement kinds; no target-private notification or SFX path; vassalage remains limited to #910-owned helpers.

- [ ] **Step 5: Synchronize this plan and commit**

Mark completed tasks and add a merged-status annotation when the PR merges.

```bash
git add docs/superpowers/plans/2026-08-29-issue-901-bilateral-diplomacy-consent.md
git commit -m "docs(#901): record consent implementation verification"
```
