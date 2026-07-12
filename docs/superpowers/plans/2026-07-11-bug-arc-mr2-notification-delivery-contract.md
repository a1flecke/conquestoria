# MR2 — Notification Delivery Contract (#551) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline (this repo forbids subagents — see CLAUDE.md Agent Policy). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every game-consequence notification is delivered to an explicit recipient civ, never leaks to the wrong hot-seat player, and is stamped with the turn it happened — one delivery contract instead of three ad-hoc mechanisms.

**Architecture:** A new `src/ui/notification-delivery.ts` module becomes the single sink. It writes the per-civ log always, toasts only when the recipient is the active unsuppressed viewer, and queues to `state.pendingEvents` (hot seat only) otherwise — the existing turn-handoff summary drains that queue. `showNotification` survives solely for immediate feedback to the acting player's own action.

**Tech Stack:** TypeScript, vitest, existing EventBus/GameEventBuffer plumbing.

## Global Constraints

- All commands via `bash scripts/run-with-mise.sh yarn <cmd>`.
- `yarn build` + `yarn test` green before push. Tests mirror `src/` under `tests/`.
- NEVER hardcode `'player'`; recipients are explicit civ ids.
- Notifications must queue, never overwrite; log keeps last 50 per player with turn numbers (existing `src/core/notification-log.ts` behavior — do not change caps).
- `textContent` only for dynamic strings.

## Background for the implementer (zero-context)

Current mechanisms (all in `src/main.ts` unless noted):

1. `showNotification(message, type, target?)` (line ~638): toasts immediately
   AND appends to **whoever `gameState.currentPlayer` is at call time**. ~125
   call sites; most are legitimate direct feedback ("Unit fortified.") — those
   stay. A handful of `bus.on` listeners use it for game consequences — those
   are the leak and must migrate (Task 3 lists every one).
2. `appendToCivLog(civId, message, type, target?)` (line ~656): appends to the
   correct civ's log; toasts only if `civId === currentPlayer` **at emit
   time**. Used by the routers in `src/ui/notification-routing.ts`.
3. `state.pendingEvents` (`src/core/hotseat-events.ts`): per-civ queue drained
   ONLY by the hot-seat handoff summary (`src/ui/turn-handoff.ts:61` →
   `clearEventsForPlayer`). Fed today by `queueFirstContactPendingEvents`
   (main.ts:3797, unconditional — leaks stale queue growth into solo saves),
   `queueStrategicWarningPendingEvent` (main.ts:3979, hot-seat gated), and
   `appendFactionNotice` (main.ts:3985).

Event timing: world simulation runs inside `runCompletedRound`
(`src/core/completed-round-orchestrator.ts`) which **buffers** events
(`src/core/game-event-buffer.ts`); the buffer is committed to the live bus
AFTER the post-round state (turn already incremented, `currentPlayer` possibly
advanced) is adopted. Commit sites:
- Solo: `src/main.ts:3458` (`result.events.commitTo(bus)` inside `endTurn`).
- Hot seat: `src/core/completed-round-handoff.ts:60` (inside
  `runCompletedRoundSimulation`, invoked from `src/main.ts:3397`).

Why the bugs happen: listeners run at commit time, so `currentPlayer`-based
attribution and `gameState.turn` stamping are both wrong for events that
happened during the completed round. In hot seat, a consequence for player A
can toast on player B's screen (leak) or surface only at A's next summary
(late). In solo, `pendingEvents` never drains at all.

The delivery contract this MR installs:

| Recipient state | Behavior |
|---|---|
| Recipient is AI (`!civ.isHuman`) | log only |
| Recipient === `currentPlayer`, presentation not suppressed | log + toast now |
| Otherwise, `state.hotSeat` set | log + queue to `pendingEvents[recipient]` (shown in that player's next handoff summary) |
| Otherwise (solo) | log + toast (solo's single human is always the viewer) |

Turn stamping: both commit sites wrap the commit in
`withHappenedTurn(preRoundTurn, …)` so entries carry the turn the round
belonged to, not the incremented turn.

---

### Task 1: The delivery module

**Files:**
- Create: `src/ui/notification-delivery.ts`
- Test: `tests/ui/notification-delivery.test.ts`

**Interfaces:**
- Consumes: `appendNotification`, `NotificationEntry` from `@/core/notification-log`; `collectEvent` from `@/core/hotseat-events`.
- Produces:

```ts
export interface NotificationDeliveryDeps {
  getState: () => GameState;
  toast: (message: string, type: NotificationEntry['type'], target?: NotificationEntry['target']) => void;
  isSuppressed: () => boolean;
}
export interface NotificationDelivery {
  deliver: NotificationSink; // (civId, message, type, target?) => void
  withHappenedTurn<T>(turn: number, fn: () => T): T;
}
export function createNotificationDelivery(deps: NotificationDeliveryDeps): NotificationDelivery;
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/ui/notification-delivery.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createNotificationDelivery } from '@/ui/notification-delivery';
import type { GameState } from '@/core/types';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 6,
    currentPlayer: 'p1',
    idCounters: {},
    civilizations: {
      p1: { isHuman: true } as any,
      p2: { isHuman: true } as any,
      ai1: { isHuman: false } as any,
    },
    notificationLog: {},
    pendingEvents: {},
    ...overrides,
  } as unknown as GameState;
}

function make(state: GameState, suppressed = false) {
  const toast = vi.fn();
  const delivery = createNotificationDelivery({
    getState: () => state,
    toast,
    isSuppressed: () => suppressed,
  });
  return { delivery, toast };
}

describe('notification delivery contract', () => {
  it('toasts and logs for the active unsuppressed viewer', () => {
    const state = makeState();
    const { delivery, toast } = make(state);
    delivery.deliver('p1', 'War!', 'warning');
    expect(toast).toHaveBeenCalledWith('War!', 'warning', undefined);
    expect(state.notificationLog!['p1']).toHaveLength(1);
    expect(state.notificationLog!['p1'][0].turn).toBe(6);
  });

  it('hot seat: queues (no toast) for a non-current human — the leak regression', () => {
    const state = makeState({ hotSeat: { players: [] } as any });
    const { delivery, toast } = make(state); // currentPlayer is p1
    delivery.deliver('p2', 'Secret consequence', 'warning');
    expect(toast).not.toHaveBeenCalled();
    expect(state.notificationLog!['p2']).toHaveLength(1);
    expect(state.pendingEvents!['p2']).toHaveLength(1);
    expect(state.pendingEvents!['p2'][0].message).toBe('Secret consequence');
  });

  it('hot seat: queues for the current player while presentation is suppressed', () => {
    const state = makeState({ hotSeat: { players: [] } as any });
    const { delivery, toast } = make(state, true);
    delivery.deliver('p1', 'Mid-handoff event', 'info');
    expect(toast).not.toHaveBeenCalled();
    expect(state.pendingEvents!['p1']).toHaveLength(1);
  });

  it('solo: toasts even for consequence events (single human is always the viewer)', () => {
    const state = makeState(); // no hotSeat
    const { delivery, toast } = make(state);
    delivery.deliver('p1', 'You met the Aztecs.', 'info');
    expect(toast).toHaveBeenCalledTimes(1);
    expect(state.pendingEvents!['p1'] ?? []).toHaveLength(0); // never queue in solo
  });

  it('AI recipients get log-only', () => {
    const state = makeState();
    const { delivery, toast } = make(state);
    delivery.deliver('ai1', 'AI thing', 'info');
    expect(toast).not.toHaveBeenCalled();
    expect(state.pendingEvents!['ai1'] ?? []).toHaveLength(0);
    expect(state.notificationLog!['ai1']).toHaveLength(1);
  });

  it('withHappenedTurn stamps the round the event belonged to', () => {
    const state = makeState(); // state.turn === 6
    const { delivery } = make(state);
    delivery.withHappenedTurn(5, () => {
      delivery.deliver('p1', 'Happened last round', 'info');
    });
    expect(state.notificationLog!['p1'][0].turn).toBe(5);
    delivery.deliver('p1', 'Happens now', 'info');
    expect(state.notificationLog!['p1'][1].turn).toBe(6); // context reset
  });

  it('withHappenedTurn resets context even when fn throws', () => {
    const state = makeState();
    const { delivery } = make(state);
    expect(() => delivery.withHappenedTurn(5, () => { throw new Error('boom'); })).toThrow('boom');
    delivery.deliver('p1', 'after throw', 'info');
    expect(state.notificationLog!['p1'][0].turn).toBe(6);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/notification-delivery.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// src/ui/notification-delivery.ts
import type { GameState } from '@/core/types';
import { appendNotification, type NotificationEntry } from '@/core/notification-log';
import { collectEvent } from '@/core/hotseat-events';
import type { NotificationSink } from '@/ui/notification-routing';

export interface NotificationDeliveryDeps {
  getState: () => GameState;
  toast: (message: string, type: NotificationEntry['type'], target?: NotificationEntry['target']) => void;
  isSuppressed: () => boolean;
}

export interface NotificationDelivery {
  deliver: NotificationSink;
  withHappenedTurn<T>(turn: number, fn: () => T): T;
}

// The single delivery contract for game-consequence notifications (#551):
// log always; toast only when the recipient is the active, unsuppressed
// viewer; queue to pendingEvents (hot seat only) otherwise, where the
// turn-handoff summary already drains it. Solo never queues — its single
// human is always the viewer, so deferred delivery would mean "never".
export function createNotificationDelivery(deps: NotificationDeliveryDeps): NotificationDelivery {
  let happenedTurn: number | null = null;

  const deliver: NotificationSink = (civId, message, type, target) => {
    const state = deps.getState();
    const turn = happenedTurn ?? state.turn;
    appendNotification(state, civId, { message, type, turn, target });

    const civ = state.civilizations[civId];
    if (!civ?.isHuman) return;

    const isActiveViewer = civId === state.currentPlayer && !deps.isSuppressed();
    if (isActiveViewer || !state.hotSeat) {
      deps.toast(message, type, target);
      return;
    }
    state.pendingEvents ??= {};
    collectEvent(state.pendingEvents, civId, {
      type: 'info',
      message,
      turn,
      ...(target ? { target } : {}),
    });
  };

  return {
    deliver,
    withHappenedTurn<T>(turn: number, fn: () => T): T {
      happenedTurn = turn;
      try {
        return fn();
      } finally {
        happenedTurn = null;
      }
    },
  };
}
```

Note: check the `GameEvent` type in `src/core/types.ts` for the exact allowed
`type` values and whether it carries `target` — `queueStrategicWarningPendingEvent`
in `src/ui/notification-routing.ts:285` already spreads a `target`, so follow
whatever shape that compiles against. If `GameEvent.type` is a closed union
without `'info'`, add `'info'` to the union (it is display-only).

One subtlety: the solo branch calls `deps.toast` directly; the wired-up toast
(Task 2) is `enqueueToast`, which itself drops toasts while the presentation
gate is suppressed. That is correct — in solo the gate is only suppressed
during victory/entry overlays, and the log copy is already written.

- [ ] **Step 4: Run tests to verify pass, commit**

```bash
bash scripts/run-with-mise.sh yarn vitest run tests/ui/notification-delivery.test.ts
git add src/ui/notification-delivery.ts tests/ui/notification-delivery.test.ts
git commit -m "feat(notifications): single per-civ delivery contract (#551)"
```

### Task 2: Wire the module in and stamp round turns

**Files:**
- Modify: `src/main.ts` (~line 656 `appendToCivLog`; solo commit ~line 3452–3458; hot-seat commit call site ~line 3397)
- Modify: `src/core/completed-round-handoff.ts` (no change needed if wrapping at the main.ts call site — see step 2)
- Test: covered by Task 1 unit tests + Task 4 regression; this task is wiring.

**Interfaces:**
- Consumes: `createNotificationDelivery` from Task 1.
- Produces: module-level `notificationDelivery` in main.ts; `appendToCivLog` becomes an alias so all existing router call sites keep working unchanged.

- [ ] **Step 1: Instantiate and alias**

In `src/main.ts`, replace the `appendToCivLog` const (line ~656) with:

```ts
const notificationDelivery = createNotificationDelivery({
  getState: () => gameState,
  toast: enqueueToast,
  isSuppressed: () => roundPresentationGate.isSuppressed(),
});
// All routers keep using this name; it now enforces the delivery contract.
const appendToCivLog: NotificationSink = notificationDelivery.deliver;
```

Import `createNotificationDelivery` from `@/ui/notification-delivery`.

- [ ] **Step 2: Stamp the solo commit**

In `endTurn`'s solo branch (main.ts ~3452), capture the pre-round turn and wrap
the commit:

```ts
      const roundTurn = gameState.turn;
      const result = runCurrentCompletedRound(gameState);
      if (!result.ok) throw result.error;
      gameState = result.state;
      const soloMoves = captureAIMoves(() => {
        notificationDelivery.withHappenedTurn(roundTurn, () => {
          result.events.commitTo(bus);
        });
      });
```

- [ ] **Step 3: Stamp the hot-seat commit**

The hot-seat commit happens inside `transaction.runCompletedRoundSimulation()`
(main.ts:3397, implemented in `src/core/completed-round-handoff.ts:60`). The
commit is synchronous within that call, so wrap where the transaction is
created: find where `createCompletedRoundHandoff`'s options are built in
main.ts (grep `runCompletedRound:` near line 3390) and capture
`const roundTurn = <initial state>.turn` from the same `initialState` passed
in, then wrap `eventTarget`: pass a proxy EventBus whose `emit` defers to
`bus` inside `withHappenedTurn`, OR simpler and preferred — wrap the await:

```ts
    const roundTurn = gameState.turn; // before simulation adopts the new state
    const outcome = await notificationDelivery.withHappenedTurn(
      roundTurn,
      () => transaction.runCompletedRoundSimulation(),
    );
```

`withHappenedTurn` is synchronous; `runCompletedRoundSimulation` is async but
its event commit (`commitTo`) executes synchronously before its first
persistence await — verify by reading `src/core/completed-round-handoff.ts:46-63`
(commit at line 60 precedes `persistCompletedRoundHandoff`). Since the
happened-turn context only matters during the synchronous commit, wrapping the
call works, but the context will have reset by the time the promise resolves —
that is fine. Add this comment at the wrap site so a future refactor that
makes the commit async knows to re-plumb:

```ts
    // withHappenedTurn only needs to cover the synchronous commitTo() inside
    // runCompletedRoundSimulation (completed-round-handoff.ts). If that commit
    // ever moves after an await, thread the turn through the options instead.
```

- [ ] **Step 4: Build, run full suite, commit**

```bash
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test
git add src/main.ts
git commit -m "feat(notifications): wire delivery contract + round-turn stamping (#551)"
```

Expect some existing tests around notification routing to still pass — they
inject their own sink. If a test constructed `appendToCivLog` behavior
directly, update it to build a `createNotificationDelivery` instance.

### Task 3: Migrate consequence listeners off showNotification

**Files:**
- Modify: `src/main.ts` — exactly these listeners:
  - `bus.on('diplomacy:peace-requested', …)` (~3800): use `routePeaceRequested(gameState, fromCivId, toCivId, appendToCivLog)` — recipient `toCivId`, not currentPlayer.
  - `bus.on('beast:slain', …)` (~3944): the reward toast targets `slayerCivId` via `appendToCivLog(slayerCivId, toast, 'success')`. The hoard-choice UI beneath it must stay gated on `slayerCivId === gameState.currentPlayer` (check the surrounding code; `maybeShowPendingHoardChoice` already re-checks on handoff).
  - `bus.on('era:advanced', …)` (~3990): the era toast is a GLOBAL announcement misattributed to `currentPlayer` today. Replace with a loop delivering to every human civ, message `\`The world has entered Era ${era}!\``; keep `routeEraAdvanced`'s era-2 unrest primer per human civ (its `factionSink` already takes a civId — call it per human). Update `routeEraAdvanced`'s signature in `src/ui/notification-routing.ts` from `(era, civId, civName, toastSink, factionSink)` to `(era, humanCivIds: string[], sink: NotificationSink)` and let it deliver both lines itself; update its unit tests in `tests/ui/notification-routing.test.ts` accordingly.
  - `bus.on('economy:treasury-strain', …)` (~4043): replace direct `showNotification(...)` with the existing `routeEconomyTreasuryStrain(gameState, event, appendToCivLog)` (it already targets `event.civId`).
  - `bus.on('unit:journey-blocked', …)` (~4100): recipient is `gameState.units[unitId]?.owner`; fall back to skipping (log nothing) if the unit is gone — do NOT fall back to currentPlayer.
  - `bus.on('trade:route-ended', …)` (~4162): recipient is the from-city owner: `gameState.cities[fromCityId]?.owner`; deliver additionally to the to-city owner when different and human.
  - `bus.on('advisor:message', …)` (~3813): leave on `showNotification` — advisor checks run against the active viewer by construction; add the comment `// viewer-scoped by design: advisors run for the active player only`.
- Modify: `src/ui/notification-routing.ts` (routeEraAdvanced signature change).
- Modify: remove `queueFirstContactPendingEvents` call (main.ts:3797) and `queueStrategicWarningPendingEvent` call (main.ts:3977-3980) — the delivery contract now queues automatically for non-current recipients, so these are double-queues. Delete both helper functions from `src/ui/notification-routing.ts` and their tests (they exist solely for this plumbing; confirm no other callers with `grep -rn "queueFirstContactPendingEvents\|queueStrategicWarningPendingEvent" src tests`).
- Test: update `tests/ui/notification-routing.test.ts` for the changed/deleted functions.

- [ ] **Step 1: For each listener above, write/adjust a focused test first** — e.g. for peace-requested:

```ts
  it('routes a peace request to the recipient civ only', () => {
    const sink = vi.fn();
    routePeaceRequested(state, 'aggressor', 'victim', sink);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toBe('victim');
  });
```

(`routePeaceRequested` already behaves this way — the bug is the listener not
using it. The listener-level fix is verified by Task 4's integration
regression; the unit tests here pin the router contracts.)

- [ ] **Step 2: Apply the listener edits listed above, run the full suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: any test asserting the old routeEraAdvanced signature or the two
deleted queue helpers fails until updated; update them to the new contracts.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(notifications): consequence listeners deliver to explicit recipients (#551)"
```

### Task 4: Hot-seat leak + solo staleness regressions

**Files:**
- Test: `tests/ui/notification-delivery-regressions.test.ts` (new)
- Modify: `src/main.ts` `migrateLegacySave` (~line 4278): solo saves clear stale `pendingEvents`.

- [ ] **Step 1: Write the regression tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { createNotificationDelivery } from '@/ui/notification-delivery';
// build a two-human hot-seat state fixture; reuse the state factory from
// tests/ui/notification-delivery.test.ts by extracting it to
// tests/ui/helpers/notification-state.ts (do that move in this step).

describe('#551 regressions', () => {
  it('a consequence for the previous player never toasts on the next player\'s screen', () => {
    const state = makeState({ hotSeat: { players: [] } as any, currentPlayer: 'p2' });
    const { delivery, toast } = make(state);
    // Simulate round-commit: war declared against p1 while p2 is the viewer.
    delivery.withHappenedTurn(9, () => {
      delivery.deliver('p1', 'The Aztecs declared war on you!', 'warning');
    });
    expect(toast).not.toHaveBeenCalled();
    expect(state.pendingEvents!['p1'][0]).toMatchObject({ message: expect.stringContaining('declared war'), turn: 9 });
    expect(state.notificationLog!['p1'][0].turn).toBe(9);
  });

  it('solo never accumulates pendingEvents', () => {
    const state = makeState(); // solo
    const { delivery } = make(state);
    delivery.deliver('p1', 'You met the Mayans.', 'info');
    delivery.deliver('p1', 'Barbarians spotted!', 'warning');
    expect(Object.values(state.pendingEvents ?? {}).flat()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Solo save hygiene in migrateLegacySave**

Pre-MR2 solo saves can contain never-drained `pendingEvents` (from the
previously unconditional first-contact queueing). In `migrateLegacySave`:

```ts
  // MR2 (#551): pendingEvents is hot-seat-only; solo saves from before the
  // delivery contract may carry stale queued events that would never drain.
  if (!gameState.hotSeat && gameState.pendingEvents
      && Object.values(gameState.pendingEvents).some(list => list.length > 0)) {
    gameState.pendingEvents = {};
  }
```

Add a save-compat test: construct a solo state with non-empty `pendingEvents`,
run the migration path (if `migrateLegacySave` is not exported, extract this
block into an exported `clearStaleSoloPendingEvents(state)` in
`src/core/hotseat-events.ts` and call it from `migrateLegacySave` — prefer the
extraction; main.ts functions are untestable), assert it is emptied and that a
hot-seat state keeps its queue.

- [ ] **Step 3: Run full suite + build, commit**

```bash
bash scripts/run-with-mise.sh yarn test && bash scripts/run-with-mise.sh yarn build
git add -A
git commit -m "test(notifications): hot-seat leak + solo staleness regressions (#551)"
```

### Task 5: Rule-book update + manual verification

- [ ] Append to `.claude/rules/ui-panels.md` Notifications section:

```markdown
- Game-consequence notifications MUST go through `notification-delivery`'s
  `deliver(civId, …)` with an explicit recipient — never `showNotification`,
  which is reserved for immediate feedback to the acting player's own input.
  Emit-time `currentPlayer` attribution is the #551 leak bug class.
```

- [ ] Manual hot-seat verification (dev server): 2-human game; have an AI do
  something visible to player 1 (e.g. borders shift); end player 1's turn;
  confirm player 2's screen shows nothing about it; confirm player 1's next
  turn summary lists it with the correct turn number; confirm the log panel
  entry matches.
- [ ] Manual solo verification: end turn; confirm consequence toasts appear at
  the start of your next turn stamped with the round they happened, and the
  notification log shows the same turn number.
- [ ] Commit any fixes; final commit:

```bash
git add -A && git commit -m "docs(rules): notification delivery contract (#551)"
```

---

## Inline Dimension Review

- **Gameplay balance:** No mechanics change; information timing becomes *correct*, which in hot seat is itself a fairness fix (no more intel about the other player's round).
- **Fun:** Wrong-player and missing notifications are trust-killers; the handoff summary becoming the reliable "what happened while you were away" beat is a core hot-seat pleasure.
- **New mechanics:** None; a delivery contract, not a feature.
- **Ages 7–43:** Younger players especially can't diagnose "the game told my sister my secret" — correctness here is invisible-but-essential. Message text unchanged.
- **Play styles:** Aggressive players get war/combat consequences on time; builders get border/trade notices on time. No style favored.
- **Difficulty modes:** Challenge-independent; strategic-warning delivery (a challenge-linked feature) now rides the same contract, removing its bespoke queue.
- **AI usage:** AI recipients are log-only (cheap, inspectable); AI behavior unchanged. AI-generated events now attribute correctly to their human victims.
- **UI:** No new surfaces; turn-handoff summary and notification log panel unchanged in appearance, corrected in content.
- **UX:** Fixes both reported symptoms (late in solo, leaking in hot seat) with one rule a player can predict: "my news arrives on my turn, stamped when it happened."
- **Architecture:** Replaces three ad-hoc paths with one injectable, pure-dependency module; `appendToCivLog` aliasing means ~40 router call sites need zero edits. `withHappenedTurn` documents its sync-commit assumption at the wrap site.
- **Extensibility:** MR3's treaty proposals and any future consequence event get correct delivery for free by using the sink; the rule-book entry prevents regression by future agents.
- **Data:** No schema change. `pendingEvents` semantics narrow to hot-seat-only; stale solo queues cleaned by migration.
- **SFX:** None added; existing notification SFX fire from toast display, so suppressed/deferred events correctly stay silent until shown.
- **Saved games:** Solo saves with stale `pendingEvents` are cleaned in `migrateLegacySave` (tested); hot-seat saves keep queues intact.
- **Testing:** Contract matrix (6 unit cases), throw-safety, two named regressions, router recipient pinning, save-compat test, plus manual hot-seat and solo checklists.
- **Solo regressions:** "Never queue in solo" is a tested invariant; turn stamping verified; existing solo toast behavior preserved for action feedback.
- **Hot-seat regressions:** The leak test is the headline regression; suppressed-window delivery for the current player is covered; handoff summary drain path untouched (existing tests in tests/ui/turn-handoff.test.ts still apply).
- **Implementation correctness:** The only behavioral edits are in enumerated listeners; the alias keeps every router call site identical, so the diff is reviewable line-by-line against the listener list in Task 3.
