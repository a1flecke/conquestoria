# MR3 — Diplomacy Consent + War Visibility (#554) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline (this repo forbids subagents — see CLAUDE.md Agent Policy). Steps use checkbox (`- [ ]`) syntax for tracking. **Depends on MR2 (notification delivery contract) being merged.**

**Goal:** An AI can never sign a treaty with a human without the human clicking Accept, and a human who is at war can always see with whom, since when, and why.

**Architecture:** Extend the existing pending-peace-request machinery (`PendingDiplomaticRequest`, accept/reject handlers, diplomacy-panel buttons) to carry treaty proposals. The AI's treaty branch in `basic-ai.ts` enqueues a proposal when the target is human instead of signing instantly. War visibility is derived from the `war_declared` records `declareWar` already writes into `diplomacy.events`.

**Tech Stack:** TypeScript, vitest.

## Global Constraints

- All commands via `bash scripts/run-with-mise.sh yarn <cmd>`; green build+test before push.
- Diplomacy operations MUST update BOTH sides (bilateral state updates).
- NEVER hardcode `'player'` — humans are `civ.isHuman`; the viewer is `state.currentPlayer`.
- `declareWar` must deduplicate `atWarWith` (existing behavior — do not regress).
- Game-consequence notifications go through the MR2 delivery sink (`appendToCivLog`) with explicit recipients — never `showNotification`.
- New buttons via `createGameButton()` unless extending the diplomacy panel's existing `data-action` HTML-string pattern — match the file's existing idiom, keep dynamic civ names out of HTML strings (use the panel's existing escaping approach; verify with a quote-containing civ name in tests).

## Background for the implementer (zero-context)

- **The bug:** `src/ai/basic-ai.ts` (~line 917, the `case 'non_aggression_pact': case 'trade_agreement': case 'open_borders': case 'alliance':` block) calls `proposeTreaty(...)` on both civs and emits `diplomacy:treaty-accepted` immediately. `proposeTreaty` (`src/systems/diplomacy-system.ts:170`) pushes a signed `Treaty` despite its name. Humans get pacts they never agreed to.
- **The template:** peace requests already do consent correctly: `enqueuePeaceRequest` (`diplomacy-system.ts:486`) appends a `PendingDiplomaticRequest` (`src/core/types.ts:698`, currently `type: 'peace'` only) and emits `diplomacy:peace-requested`; the diplomacy panel (`src/ui/diplomacy-panel.ts:250-251, 407, 415`) renders Accept/Reject buttons wired to `acceptDiplomaticRequest` / `rejectDiplomaticRequest` via main.ts handlers (~line 921-934).
- **War records:** `declareWar` (`diplomacy-system.ts`) already pushes `{ type: 'war_declared', turn, otherCiv }` into `diplomacy.events`, and `routeWarDeclared` (`src/ui/notification-routing.ts:192`) derives a relationship-based reason string. The data for "since when / why" exists; no schema addition needed.
- **Naming honesty:** part of this MR is renaming `proposeTreaty` → `signTreaty` so the next agent cannot repeat the mistake.

Player→AI proposals: today the human's own treaty actions also auto-sign (via
`applyDiplomaticAction` → `proposeTreaty` both sides). That stays as-is in this
MR (AI evaluation of incoming proposals is out of scope, noted in the arc
spec); only AI→human gains consent.

---

### Task 1: Rename `proposeTreaty` → `signTreaty`

**Files:**
- Modify: `src/systems/diplomacy-system.ts:170`, `src/ai/basic-ai.ts` (import + 2 call sites ~921/926), `src/systems/diplomacy-system.ts` internal call sites (~400/408), any test referencing the name (`grep -rn "proposeTreaty" src tests`).

- [ ] **Step 1:** Global rename (mechanical): `proposeTreaty` → `signTreaty`. Add doc comment:

```ts
// Signs the treaty into THIS side's diplomacy state immediately — no consent
// step. Callers targeting a human must go through enqueueTreatyProposal
// instead (#554). Both sides must be signed for a complete treaty.
export function signTreaty(
```

- [ ] **Step 2:** Run: `bash scripts/run-with-mise.sh yarn build && bash scripts/run-with-mise.sh yarn test` → both green (pure rename).
- [ ] **Step 3:** Commit: `git commit -am "refactor(diplomacy): rename proposeTreaty to signTreaty for honesty (#554)"`

### Task 2: Treaty proposals in the pending-request pipeline

**Files:**
- Modify: `src/core/types.ts:698` (`PendingDiplomaticRequest`)
- Modify: `src/systems/diplomacy-system.ts` (`enqueueTreatyProposal`, extend `acceptDiplomaticRequest` / `rejectDiplomaticRequest`, add `getPendingTreatyProposalsFor`)
- Test: `tests/systems/diplomacy-system.test.ts` (extend)

**Interfaces:**
- Produces:

```ts
// types.ts
export interface PendingDiplomaticRequest {
  id: string;
  type: 'peace' | 'treaty';
  treatyType?: TreatyType;        // set when type === 'treaty'
  turnsRemaining?: number;         // treaty duration to sign with (mirrors AI decision: 10 for NAP, -1 otherwise)
  fromCivId: string;
  toCivId: string;
  turnIssued: number;
}

// diplomacy-system.ts
export function enqueueTreatyProposal(
  state: GameState, fromCivId: string, toCivId: string,
  treatyType: TreatyType, turnsRemaining: number, bus?: EventBus,
): GameState;
export function getPendingTreatyProposalsFor(state: GameState, civId: string): PendingDiplomaticRequest[];
```

- Consumes: `signTreaty` (Task 1). Accepting a `'treaty'` request signs **both** sides and emits `diplomacy:treaty-accepted`; rejecting removes the request with **no relationship penalty** (family-friendly: declining is not an insult) and emits nothing new.

- [ ] **Step 1: Write the failing tests** (extend `tests/systems/diplomacy-system.test.ts`; reuse its existing state fixture helpers — read the file's top first and follow its fixture idiom):

```ts
describe('treaty proposals (#554)', () => {
  it('enqueues a proposal without touching either civ\'s treaties', () => {
    const next = enqueueTreatyProposal(state, 'ai1', 'human1', 'non_aggression_pact', 10, bus);
    expect(next.pendingDiplomacyRequests).toHaveLength(1);
    expect(next.pendingDiplomacyRequests![0]).toMatchObject({
      type: 'treaty', treatyType: 'non_aggression_pact', fromCivId: 'ai1', toCivId: 'human1', turnsRemaining: 10,
    });
    expect(next.civilizations['human1'].diplomacy.treaties).toHaveLength(0);
    expect(next.civilizations['ai1'].diplomacy.treaties).toHaveLength(0);
  });

  it('dedupes: same pair+type proposal is not enqueued twice', () => {
    let next = enqueueTreatyProposal(state, 'ai1', 'human1', 'open_borders', -1);
    next = enqueueTreatyProposal(next, 'ai1', 'human1', 'open_borders', -1);
    expect(next.pendingDiplomacyRequests).toHaveLength(1);
  });

  it('accept signs both sides and clears the request', () => {
    let next = enqueueTreatyProposal(state, 'ai1', 'human1', 'trade_agreement', -1, bus);
    const requestId = next.pendingDiplomacyRequests![0].id;
    next = acceptDiplomaticRequest(next, 'human1', requestId, bus);
    expect(next.civilizations['human1'].diplomacy.treaties.some(t => t.type === 'trade_agreement')).toBe(true);
    expect(next.civilizations['ai1'].diplomacy.treaties.some(t => t.type === 'trade_agreement')).toBe(true);
    expect(next.pendingDiplomacyRequests).toHaveLength(0);
  });

  it('only the recipient can accept', () => {
    let next = enqueueTreatyProposal(state, 'ai1', 'human1', 'alliance', -1);
    const requestId = next.pendingDiplomacyRequests![0].id;
    const after = acceptDiplomaticRequest(next, 'ai1', requestId, bus); // proposer cannot self-accept
    expect(after.civilizations['human1'].diplomacy.treaties).toHaveLength(0);
  });

  it('reject clears the request with no relationship penalty', () => {
    let next = enqueueTreatyProposal(state, 'ai1', 'human1', 'alliance', -1);
    const before = next.civilizations['human1'].diplomacy.relationships['ai1'] ?? 0;
    const requestId = next.pendingDiplomacyRequests![0].id;
    next = rejectDiplomaticRequest(next, 'human1', requestId);
    expect(next.pendingDiplomacyRequests).toHaveLength(0);
    expect(next.civilizations['human1'].diplomacy.relationships['ai1'] ?? 0).toBe(before);
  });

  it('proposals expire after 10 turns (pruned by the turn processor)', () => {
    let next = enqueueTreatyProposal(state, 'ai1', 'human1', 'open_borders', -1);
    next = { ...next, turn: next.turn + 11 };
    next = pruneExpiredDiplomaticRequests(next);
    expect(next.pendingDiplomacyRequests).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failures** (functions missing / union rejects `'treaty'`).

- [ ] **Step 3: Implement**

`enqueueTreatyProposal` mirrors `enqueuePeaceRequest` (id via a
`buildPendingTreatyProposalId(from,to,type,turn)` sibling helper; dedupe on
same from+to+treatyType). Extend `acceptDiplomaticRequest`: locate the request
by id; require `request.toCivId === actingCivId`; branch on `request.type`:
`'peace'` keeps existing behavior; `'treaty'` does:

```ts
    const turns = request.turnsRemaining ?? -1;
    let next = { ...state, pendingDiplomacyRequests: remaining };
    next.civilizations[request.fromCivId].diplomacy = signTreaty(
      next.civilizations[request.fromCivId].diplomacy,
      request.fromCivId, request.toCivId, request.treatyType!, turns, next.turn,
    );
    next.civilizations[request.toCivId].diplomacy = signTreaty(
      next.civilizations[request.toCivId].diplomacy,
      request.toCivId, request.fromCivId, request.treatyType!, turns, next.turn,
    );
    bus.emit('diplomacy:treaty-accepted', { civA: request.fromCivId, civB: request.toCivId, treaty: request.treatyType! });
    return next;
```

Follow the file's existing immutability idiom exactly (spread civilizations
map as the existing accept branch does — read it first). Add
`pruneExpiredDiplomaticRequests(state)` (10-turn TTL on `turnIssued`, applies
to both peace and treaty requests) and call it from the world turn processor —
find where per-turn diplomacy upkeep runs in `src/core/turn-manager.ts` (grep
`processRelationshipDrift`) and call it adjacent. Also emit
`diplomacy:treaty-proposed { fromCivId, toCivId, treatyType }` from
`enqueueTreatyProposal`; add it to `GameEvents` in types.ts.

- [ ] **Step 4: Run tests → PASS; commit** `feat(diplomacy): pending treaty proposals with accept/decline (#554)`

### Task 3: AI enqueues instead of signing when the target is human

**Files:**
- Modify: `src/ai/basic-ai.ts` treaty branch (~line 917)
- Test: `tests/ai/basic-ai.test.ts` (extend — grep for existing `#435` treaty-guard tests and sit next to them)

- [ ] **Step 1: Failing test**

```ts
  it('never writes a treaty into a human civ\'s state without consent (#554)', () => {
    // Arrange a state where the AI decision path will choose a treaty with the
    // human: reuse the existing treaty-decision fixture in this file (the #435
    // tests build one); mark the target civ isHuman: true.
    const result = runAiRoundHelper(stateWithFriendlyHumanNeighbor);
    const human = result.civilizations['human1'];
    expect(human.diplomacy.treaties).toHaveLength(0);
    expect(result.pendingDiplomacyRequests?.some(r =>
      r.type === 'treaty' && r.toCivId === 'human1')).toBe(true);
  });

  it('still signs AI↔AI treaties instantly', () => {
    const result = runAiRoundHelper(stateWithTwoFriendlyAIs);
    expect(result.civilizations['ai2'].diplomacy.treaties.length).toBeGreaterThan(0);
  });
```

(Adapt fixture/helper names to what `tests/ai/basic-ai.test.ts` actually
exports — read it before writing; the assertions are the contract.)

- [ ] **Step 2: Implement** — in the treaty `case` block of basic-ai.ts:

```ts
        case 'non_aggression_pact':
        case 'trade_agreement':
        case 'open_borders':
        case 'alliance': {
          const duration = decision.action === 'non_aggression_pact' ? 10 : -1;
          // #554: humans must consent — enqueue a proposal instead of signing.
          if (newState.civilizations[decision.targetCiv]?.isHuman) {
            newState = enqueueTreatyProposal(
              newState, civId, decision.targetCiv, decision.action, duration, bus,
            );
            break;
          }
          // AI↔AI: sign both sides immediately (existing behavior).
          … (existing signTreaty x2 + treaty-accepted emit, unchanged)
          break;
        }
```

- [ ] **Step 3: Run suite; commit** `fix(ai): AI treaty offers to humans require consent (#554)`

### Task 4: Diplomacy panel — proposals + "at war since" rows

**Files:**
- Modify: `src/ui/diplomacy-panel.ts`
- Modify: `src/main.ts` (proposal accept/decline handlers next to `handleAcceptPeaceRequest` ~line 921; treaty-proposed notification listener)
- Modify: `src/ui/notification-routing.ts` (extract + export `describeWarReason(relationship: number): string` from `routeWarDeclared`'s inline mapping; add `routeTreatyProposed`)
- Test: `tests/ui/diplomacy-panel.test.ts` (extend, following its existing render-and-click test idiom)

**Player truth table (required by plans README):**

| Before | Action | Immediate visible result |
|---|---|---|
| Civ row shows "Proposes: Non-Aggression Pact — Accept / Decline" | Click Accept | Row rerenders showing the active treaty pill; proposal buttons gone; toast "Non-aggression pact with X signed." |
| Same | Click Decline | Proposal row gone; no relationship change shown; toast "Proposal declined." |
| Civ row for a civ you're at war with | (none — passive) | Row always shows "⚔ At war since turn N — <reason>" |
| Proposal exists, player ignores it 10 turns | (expiry) | Proposal row gone next time panel opens |

- [ ] **Step 1: Failing UI tests**

```ts
  it('renders an incoming treaty proposal with accept/decline and fires callbacks', () => {
    // state: pending treaty proposal ai1 → currentPlayer
    const onAccept = vi.fn(); const onDecline = vi.fn();
    openDiplomacyPanel(container, state, { …existingCallbacks, onAcceptTreatyProposal: onAccept, onDeclineTreatyProposal: onDecline });
    const accept = container.querySelector('[data-action="accept-treaty-proposal"]') as HTMLButtonElement;
    expect(accept).toBeTruthy();
    expect(container.textContent).toContain('Non-Aggression Pact');
    accept.click();
    expect(onAccept).toHaveBeenCalledWith(expect.stringContaining('treaty'));
  });

  it('shows war status with start turn and reason for a civ at war with the viewer', () => {
    // state: viewer at war with ai1; ai1's war_declared event at turn 4; relationship -60
    openDiplomacyPanel(container, state, callbacks);
    expect(container.textContent).toContain('At war since turn 4');
    expect(container.textContent).toContain('deep hostility');
  });

  it('never shows proposal buttons to the proposer or third parties', () => {
    // state: proposal ai1 → human2; viewer is human1
    openDiplomacyPanel(container, state, callbacks);
    expect(container.querySelector('[data-action="accept-treaty-proposal"]')).toBeNull();
  });
```

- [ ] **Step 2: Implement panel changes**

- Proposals: in the per-civ row builder (where `getPendingPeaceRequestForPair`
  is consulted, line ~97), also call `getPendingTreatyProposalsFor(state,
  state.currentPlayer)` filtered to this civ as `fromCivId`, and render one
  proposal line per entry using the panel's existing button-HTML idiom with
  `data-action="accept-treaty-proposal"` / `"decline-treaty-proposal"` and
  `data-request-id`. Treaty display names: add a `TREATY_LABELS: Record<TreatyType, string>`
  map (`non_aggression_pact: 'Non-Aggression Pact'`, etc.) — grep first for an
  existing label map to reuse (`grep -rn "Non-Aggression" src/ui`).
- War row: for each civ where `viewerDiplomacy.atWarWith.includes(civId)`,
  find the latest `war_declared` event for that civ in
  `viewer.diplomacy.events` and render
  `⚔ At war since turn ${event.turn} — ${describeWarReason(relationship)}`;
  if no event exists (legacy save), render `⚔ At war` only (test this case).
- Wire click delegation for the two new `data-action` values next to the
  existing accept/reject-peace delegation (lines ~407-415).
- main.ts handlers mirror `handleAcceptPeaceRequest` — call
  `acceptDiplomaticRequest`/`rejectDiplomaticRequest`, rerender, and toast via
  `showNotification` (direct action feedback — allowed under the MR2 rule).
- Notification: `bus.on('diplomacy:treaty-proposed', …)` in main.ts →
  `routeTreatyProposed(gameState, event, appendToCivLog)` delivering to
  `toCivId`: message `` `${fromName} proposes a ${label}. Review it in the Diplomacy panel.` ``
  (info). MR2's contract handles hot-seat deferral automatically.

- [ ] **Step 3: Run suite + build; commit** `feat(diplomacy): consent UI for AI treaty proposals + war attribution rows (#554)`

### Task 5: Save compatibility + manual verification

- [ ] Save-compat: old saves have `pendingDiplomacyRequests` entries without
  the new optional fields, and possibly **already-signed unconsented treaties**.
  Signed treaties stay (retroactively voiding them would surprise players
  mid-campaign; the player can break them in the panel — verify a break-treaty
  affordance exists via `breakTreaty`; if the panel lacks one for these treaty
  types, add a "Break Treaty" button with confirm to the treaty pill row — no
  silent destructive UI). Add a test loading a state shaped like an old save
  (peace-only requests, no `treatyType`) through `pruneExpiredDiplomaticRequests`
  and the panel render without throwing.
- [ ] Manual: solo game, befriend an AI, wait for its proposal → panel shows
  it; accept → pact pill appears; new game, decline → nothing signed. Hot
  seat: proposal to player 2 while player 1 active → nothing on player 1's
  screen; player 2's summary mentions it.
- [ ] `bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build`; commit.

---

## Inline Dimension Review

- **Gameplay balance:** Consent slightly slows AI-human pact formation (a proposal round-trip); AI↔AI dynamics unchanged. NAP duration (10) and trade gold (+2/turn, inside `signTreaty`) unchanged — no economy shift.
- **Fun:** Receiving an offer you can accept or refuse is a real decision moment (and a good "the world sees me" beat); silently acquiring pacts was anti-fun confusion. Declining without penalty keeps it low-stakes for kids.
- **New mechanics:** One: pending treaty proposals with 10-turn expiry. Deliberately modeled on the existing peace-request mechanic rather than a new subsystem.
- **Ages 7–43:** Accept/Decline buttons with plain treaty names; no penalty for declining means a 7-year-old can't be punished for ignoring the panel; expiry keeps the queue from rotting for players who never open diplomacy.
- **Play styles:** Warmongers can decline everything and lose nothing; diplomats get agency they lacked; turtlers see NAP offers as readable AI intent.
- **Difficulty modes:** Proposal frequency follows existing personality-driven decision logic (unchanged); no challenge-profile coupling added — reasonable, since consent is correctness, not difficulty.
- **AI usage:** AI proposes via the same decision path it used to sign; it does not (yet) evaluate incoming human proposals — human→AI stays instant-sign, explicitly noted as a follow-up. AI never self-accepts (tested).
- **UI:** Extends the existing per-civ row idiom (peace buttons) — no new panel; war rows add always-visible attribution.
- **UX:** Fixes both reported mysteries: pacts now arrive as reviewable offers; "somehow at war" becomes "at war since turn N — deteriorating relations." Notification points at the Diplomacy panel (self-explanatory path).
- **Architecture:** Reuses `PendingDiplomaticRequest` pipeline (one union widening, no parallel queue); rename makes the dangerous helper honest; `describeWarReason` shared between router and panel (one source of truth).
- **Extensibility:** `type: 'treaty'` + `treatyType` generalizes to future request kinds (vassalage offers already have a bespoke path — candidates for later migration onto this pipeline).
- **Data:** Two optional fields on an existing optional-array element — old saves parse untouched; expiry pruning handles pre-existing stale requests.
- **SFX:** None new; the treaty-accepted event already drives any existing stinger — verify `grep -rn "treaty-accepted" src/audio` and note in PR if silent (acceptable).
- **Saved games:** Old unconsented treaties persist by decision (documented + break-treaty affordance); requests without new fields tolerated (tested).
- **Testing:** System-level consent matrix (7 cases incl. expiry, self-accept, no-penalty decline), AI human/AI-AI split regression, panel render+click tests incl. third-party negative, legacy-save render test.
- **Solo regressions:** Peace-request flow untouched (same functions, new branch); existing diplomacy tests re-run; proposals surface via MR2 solo toast path.
- **Hot-seat regressions:** Proposal notification rides MR2 (no leak, tested there); panel reads viewer-scoped state only (`state.currentPlayer`); manual two-player check included.
- **Implementation correctness:** Bilateral signing asserted in tests on both civs; dedupe prevents proposal spam from repeated AI rounds; recipient-only accept enforced in the system layer, not just hidden in UI.
